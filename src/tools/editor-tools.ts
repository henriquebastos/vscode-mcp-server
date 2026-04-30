import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getEditorAnnotationService } from '../editor/annotation-service';
import { getEditorContext } from '../editor/context-service';
import { getEditorDiffService, normalizeDiffRequest } from '../editor/diff-service';
import { updateFeedbackContext } from '../editor/feedback-commands';
import { getFeedbackCaptureService } from '../editor/feedback-service';
import { goToDefinition, revealRange } from '../editor/navigation-service';

const MAX_SELECTED_TEXT_CHARACTERS = 100_000;
const MAX_DIFF_FILES = 1_000;

const nonEmptyString = z.string().trim().min(1);
const positiveLine = z.number().int().positive();
const zeroBasedCharacter = z.number().int().min(0);
const positiveBoundedInteger = (max: number) => z.number().int().positive().max(max);

const annotationModeSchema = z.enum(['replace', 'add']);
const annotationKindSchema = z.enum(['focus', 'related', 'previous', 'question', 'warning', 'info']);
const feedbackClearScopeSchema = z.enum(['draft', 'ready', 'drained', 'cancelled', 'all']);

const pathTargetSchema = nonEmptyString.optional().describe('Workspace-relative path. Defaults to active editor when omitted.');
const uriTargetSchema = nonEmptyString.optional().describe('Document URI. Mutually exclusive with path.');

const positionSchema = z.object({
    line: positiveLine.describe('1-based line number'),
    character: zeroBasedCharacter.optional().default(0).describe('0-based character offset')
});

const rangeShape = {
    start: positionSchema,
    end: positionSchema.optional()
};

const rangeSchema = z.object(rangeShape);

function exposeObjectShape<Schema extends z.ZodTypeAny, Shape extends z.ZodRawShape>(schema: Schema, shape: Shape): Schema {
    Object.defineProperty(schema, 'shape', {
        get: () => shape
    });
    return schema;
}

function objectWithTargetXor<T extends z.ZodRawShape>(shape: T, message = 'Provide either path or uri, not both.'): z.ZodEffects<z.ZodObject<T>> {
    return exposeObjectShape(z.object(shape).superRefine((value, ctx) => {
        const target = value as { path?: string; uri?: string };
        if (target.path && target.uri) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['uri'],
                message
            });
        }
    }), shape);
}

const annotationRangeSchema = objectWithTargetXor(
    {
        ...rangeShape,
        path: nonEmptyString.optional().describe('Workspace-relative path for this range. Defaults to the tool path/URI or active editor.'),
        uri: nonEmptyString.optional().describe('Document URI for this range. Mutually exclusive with path.')
    },
    'Provide either path or uri for an annotation range, not both.'
);

const diffEntrySchema = z.object({
    label: nonEmptyString.optional().describe('Optional human-readable entry label returned in normalized entries'),
    leftUri: nonEmptyString.optional().describe('Optional left/original document URI'),
    rightUri: nonEmptyString.optional().describe('Optional right/modified document URI')
}).superRefine((value, ctx) => {
    if (!value.leftUri && !value.rightUri) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Explicit diff entries must include at least one of leftUri or rightUri.'
        });
    }
});

const emptyInputSchema = z.object({});

const clearFeedbackSchema = z.object({
    scope: feedbackClearScopeSchema.optional().default('all').describe('Which feedback session state to clear. Defaults to all.')
});

type ClearFeedbackToolInput = z.infer<typeof clearFeedbackSchema>;

const openDiffShape = {
    title: nonEmptyString.optional().describe('Human-readable title for the VS Code changes editor'),
    leftUri: nonEmptyString.optional().describe('Source-mode left URI. Mutually exclusive with entries.'),
    rightUri: nonEmptyString.optional().describe('Source-mode right URI. Mutually exclusive with entries.'),
    entries: z.array(diffEntrySchema).min(1).optional().describe('Explicit file-pair entries with optional leftUri/rightUri sides'),
    include: z.array(nonEmptyString).optional().describe('Optional relative-path include filters for normalized entries'),
    exclude: z.array(nonEmptyString).optional().describe('Optional relative-path exclude filters for normalized entries'),
    maxFiles: positiveBoundedInteger(MAX_DIFF_FILES).optional().describe('Maximum number of normalized entries to open')
};

const openDiffSchema = exposeObjectShape(z.object(openDiffShape).superRefine((value, ctx) => {
    const hasLeftSource = Boolean(value.leftUri);
    const hasRightSource = Boolean(value.rightUri);
    const hasAnySource = hasLeftSource || hasRightSource;
    const hasEntries = value.entries !== undefined;

    if (hasAnySource && hasEntries) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide exactly one diff mode: either leftUri/rightUri source mode or entries explicit mode.'
        });
    }
    if (!hasAnySource && !hasEntries) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide exactly one diff mode: either leftUri/rightUri source mode or entries explicit mode.'
        });
    }
    if (hasAnySource && (!hasLeftSource || !hasRightSource)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Source-mode diffs require both leftUri and rightUri.'
        });
    }
}), openDiffShape);

type OpenDiffToolInput = z.infer<typeof openDiffSchema>;

const getEditorContextSchema = z.object({
    includeSelectedText: z.boolean().optional().default(false).describe('Include selected text for active selections'),
    includeVisibleEditors: z.boolean().optional().default(false).describe('Include metadata for all visible editors'),
    maxSelectedTextCharacters: positiveBoundedInteger(MAX_SELECTED_TEXT_CHARACTERS).optional().default(4000).describe('Maximum selected text characters to return')
});

type GetEditorContextToolInput = z.infer<typeof getEditorContextSchema>;

const goToDefinitionSchema = z.object({
    path: pathTargetSchema.describe('Workspace-relative source path. Defaults to active editor.'),
    position: positionSchema.optional().describe('Source position using 1-based line and 0-based character'),
    range: rangeSchema.optional().describe('Source range; start is used when position is omitted')
});

type GoToDefinitionToolInput = z.infer<typeof goToDefinitionSchema>;

const clearAnnotationsSchema = objectWithTargetXor({
    id: nonEmptyString.optional().describe('Annotation group id to clear. Defaults to current when id/path/uri/all are omitted.'),
    path: nonEmptyString.optional().describe('Workspace-relative path to limit clearing'),
    uri: nonEmptyString.optional().describe('Document URI to limit clearing. Mutually exclusive with path.'),
    all: z.boolean().optional().default(false).describe('Clear all annotation groups')
});

type ClearAnnotationsToolInput = z.infer<typeof clearAnnotationsSchema>;

const setInlineCalloutSchema = objectWithTargetXor({
    id: nonEmptyString.optional().default('current').describe('Annotation group id. Defaults to current.'),
    path: pathTargetSchema,
    uri: uriTargetSchema,
    range: annotationRangeSchema.describe('Precise range the callout explains'),
    title: nonEmptyString.describe('Short callout title'),
    message: nonEmptyString.describe('Short callout sentence'),
    kind: annotationKindSchema.optional().default('focus').describe('Semantic visual style for the callout'),
    mode: annotationModeSchema.optional().default('replace').describe('Replace or add to callouts for the id')
});

type SetInlineCalloutToolInput = z.infer<typeof setInlineCalloutSchema>;

const setGutterMarkerShape = {
    id: nonEmptyString.optional().default('current').describe('Annotation group id. Defaults to current.'),
    path: nonEmptyString.optional().describe('Workspace-relative path for lines or ranges that omit path. Defaults to active editor.'),
    uri: nonEmptyString.optional().describe('Document URI for lines or ranges that omit uri. Mutually exclusive with path.'),
    lines: z.array(positiveLine).min(1).optional().describe('One or more 1-based line numbers for same-file gutter markers'),
    ranges: z.array(annotationRangeSchema).min(1).optional().describe('One or more precise marker ranges'),
    label: nonEmptyString.optional().describe('Short marker label or hover text'),
    kind: annotationKindSchema.optional().default('focus').describe('Semantic visual style for the marker'),
    mode: annotationModeSchema.optional().default('replace').describe('Replace or add to gutter markers for the id')
};

const setGutterMarkerSchema = exposeObjectShape(objectWithTargetXor(setGutterMarkerShape).superRefine((value, ctx) => {
    if (!value.lines && !value.ranges) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide at least one line or range for a gutter marker.'
        });
    }
}), setGutterMarkerShape);

type SetGutterMarkerToolInput = z.infer<typeof setGutterMarkerSchema>;

const setCodeLensNoteSchema = objectWithTargetXor({
    id: nonEmptyString.optional().default('current').describe('Annotation group id. Defaults to current.'),
    path: pathTargetSchema,
    uri: uriTargetSchema,
    range: annotationRangeSchema.describe('Precise range the CodeLens note labels'),
    title: nonEmptyString.describe('Short visible CodeLens label, such as "Step 1: schema" or "Caller"'),
    kind: annotationKindSchema.optional().default('focus').describe('Semantic intent for the note'),
    mode: annotationModeSchema.optional().default('replace').describe('Replace or add to CodeLens notes for the id')
});

type SetCodeLensNoteToolInput = z.infer<typeof setCodeLensNoteSchema>;

const setHoverNoteSchema = objectWithTargetXor({
    id: nonEmptyString.optional().default('current').describe('Annotation group id. Defaults to current.'),
    path: pathTargetSchema,
    uri: uriTargetSchema,
    range: annotationRangeSchema.describe('Precise range the hover note annotates'),
    title: nonEmptyString.optional().describe('Optional short hover note title'),
    message: nonEmptyString.describe('Markdown hover note body rendered as untrusted markdown'),
    kind: annotationKindSchema.optional().default('info').describe('Semantic visual style for the squiggle underline'),
    mode: annotationModeSchema.optional().default('replace').describe('Replace or add to hover notes for the id')
});

type SetHoverNoteToolInput = z.infer<typeof setHoverNoteSchema>;

const setExplanationCommentSchema = objectWithTargetXor({
    id: nonEmptyString.optional().default('current').describe('Annotation group id. Defaults to current.'),
    path: pathTargetSchema,
    uri: uriTargetSchema,
    range: annotationRangeSchema.describe('Precise range the explanation comment anchors to'),
    title: nonEmptyString.describe('Short guided explanation title'),
    body: nonEmptyString.describe('Markdown explanation body rendered as untrusted markdown'),
    kind: annotationKindSchema.optional().default('info').describe('Semantic visual style for the explanation comment'),
    mode: annotationModeSchema.optional().default('replace').describe('Replace or add to explanation comments for the id')
});

type SetExplanationCommentToolInput = z.infer<typeof setExplanationCommentSchema>;

const setHighlightSchema = objectWithTargetXor({
    id: nonEmptyString.optional().default('current').describe('Annotation group id. Defaults to current.'),
    path: nonEmptyString.optional().describe('Workspace-relative path for ranges that omit path. Defaults to active editor.'),
    uri: nonEmptyString.optional().describe('Document URI for ranges that omit uri. Mutually exclusive with path.'),
    ranges: z.array(annotationRangeSchema).min(1).describe('One or more precise highlight ranges'),
    kind: annotationKindSchema.optional().default('focus').describe('Semantic visual style for the highlight'),
    mode: annotationModeSchema.optional().default('replace').describe('Replace or add to ranges for the id')
});

type SetHighlightToolInput = z.infer<typeof setHighlightSchema>;

const revealRangeSchema = z.object({
    path: pathTargetSchema.describe('Workspace-relative path. Defaults to the active editor when omitted.'),
    range: rangeSchema.describe('Precise range to reveal using 1-based lines and 0-based characters')
});

type RevealRangeToolInput = z.infer<typeof revealRangeSchema>;

function jsonTextResult(value: unknown): CallToolResult {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(value, null, 2)
            }
        ]
    };
}

interface JsonToolRegistrar {
    registerTool<InputSchema extends z.ZodTypeAny>(
        name: string,
        config: { description: string; inputSchema: InputSchema },
        handler: (input: z.infer<InputSchema>) => Promise<CallToolResult>
    ): unknown;
}

function registerJsonEditorTool<InputSchema extends z.ZodTypeAny>(
    server: McpServer,
    name: string,
    description: string,
    inputSchema: InputSchema,
    handler: (input: z.infer<InputSchema>) => unknown | Promise<unknown>
): void {
    const registrar = server as unknown as JsonToolRegistrar;
    registrar.registerTool(
        name,
        { description, inputSchema },
        async (input: z.infer<InputSchema>): Promise<CallToolResult> => jsonTextResult(await handler(input))
    );
}

export function registerEditorTools(server: McpServer): void {
    registerJsonEditorTool(
        server,
        'get_feedback_code',
        `Returns the current guided editor feedback session without mutating it.

        WHEN TO USE: The user says they finished leaving feedback in VS Code, or you need to
        preview captured feedback before deciding whether to drain or clear it. This tool does
        not clear draft or ready feedback.`,
        emptyInputSchema,
        async () => getFeedbackCaptureService().getFeedback() ?? { status: 'empty', count: 0, items: [] }
    );

    registerJsonEditorTool(
        server,
        'drain_feedback_code',
        `Returns the ready guided editor feedback session and marks it consumed.

        WHEN TO USE: The user has finished a VS Code feedback batch and you are ready to process
        it exactly once. The returned batch remains structured in the response, but a second drain
        will fail until the user captures and finishes a new batch.`,
        emptyInputSchema,
        async () => {
            const feedbackService = getFeedbackCaptureService();
            const session = await feedbackService.drainFeedback();
            await updateFeedbackContext(feedbackService.getFeedback());
            return session;
        }
    );

    registerJsonEditorTool(
        server,
        'clear_feedback_code',
        `Clears guided editor feedback state and temporary markers.

        WHEN TO USE: Remove a draft, ready, drained, or cancelled feedback session after it has
        been processed or intentionally discarded. The scope argument makes it explicit which
        lifecycle state may be cleared; scope=all clears any current feedback session.`,
        clearFeedbackSchema,
        async ({ scope = 'all' }: ClearFeedbackToolInput) => {
            const result = await getFeedbackCaptureService().clearFeedback({ scope });
            await updateFeedbackContext(result.session);
            return result;
        }
    );

    registerJsonEditorTool(
        server,
        'open_diff_code',
        `Opens a native VS Code changes editor for URI-first guided diff review.

        WHEN TO USE: Compare explicit file pairs or, in source mode, high-level left/right URI
        resources, then use the returned document URIs for follow-up annotations. Explicit entries
        may omit one side for added or deleted files; no public status field is required.`,
        openDiffSchema,
        async (input: OpenDiffToolInput) => getEditorDiffService().openDiff(normalizeDiffRequest(input))
    );

    registerJsonEditorTool(
        server,
        'get_editor_context_code',
        `Returns the current VS Code editor context for guided code exploration.

        WHEN TO USE: Understanding what the user is looking at, adapting to active selections,
        visible ranges, or split editors before revealing, highlighting, or explaining code.

        By default returns the active editor. Set includeSelectedText=true to include selected code,
        and includeVisibleEditors=true to include all visible editors.`,
        getEditorContextSchema,
        async ({
            includeSelectedText = false,
            includeVisibleEditors = false,
            maxSelectedTextCharacters = 4000
        }: GetEditorContextToolInput) => getEditorContext({
            includeSelectedText,
            includeVisibleEditors,
            maxSelectedTextCharacters
        })
    );

    registerJsonEditorTool(
        server,
        'go_to_definition_code',
        `Navigates VS Code to the definition for a symbol position and returns the resulting location.

        WHEN TO USE: Follow a call, variable, or type visually during guided exploration. Omitting
        path targets the active editor; position defaults to the active selection when omitted.`,
        goToDefinitionSchema,
        async ({ path, position, range }: GoToDefinitionToolInput) => goToDefinition({ path, position, range })
    );

    registerJsonEditorTool(
        server,
        'clear_annotations_code',
        `Clears temporary editor annotations, including highlights, inline callouts, CodeLens notes, hover notes, gutter markers, overview-ruler markers, and Guided Explanation comments.

        WHEN TO USE: Remove stale visual focus before moving to a new explanation. By default clears
        id=current. Provide id to clear one group, path to limit clearing to a file, or all=true to clear everything.`,
        clearAnnotationsSchema,
        async ({ id, path, uri, all = false }: ClearAnnotationsToolInput) => getEditorAnnotationService().clearAnnotations({ id, path, uri, all })
    );

    registerJsonEditorTool(
        server,
        'set_inline_callout_code',
        `Sets a temporary visible inline explanation beside a precise code range.

        WHEN TO USE: Attach a short explanation directly in the editor without requiring hover.
        The callout is grouped by id, defaults to current, and is attached at the end of the range's start line.`,
        setInlineCalloutSchema,
        async ({ id = 'current', path, uri, range, title, message, kind = 'focus', mode = 'replace' }: SetInlineCalloutToolInput) => getEditorAnnotationService().setInlineCallout({
            id,
            path,
            uri,
            range,
            title,
            message,
            kind,
            mode
        })
    );

    registerJsonEditorTool(
        server,
        'set_gutter_marker_code',
        `Sets temporary gutter markers anchored to code lines or ranges.

        WHEN TO USE: Add step markers, warning/question markers, or related-location markers during
        guided explanation. Markers are grouped by id; id defaults to current. Provide lines for
        simple same-file markers or ranges for precise and multi-file markers.`,
        setGutterMarkerSchema,
        async ({ id = 'current', path, uri, lines, ranges, label, kind = 'focus', mode = 'replace' }: SetGutterMarkerToolInput) => getEditorAnnotationService().setGutterMarkers({
            id,
            path,
            uri,
            lines,
            ranges,
            label,
            kind,
            mode
        })
    );

    registerJsonEditorTool(
        server,
        'set_codelens_note_code',
        `Sets a temporary visible CodeLens note above a precise code range.

        WHEN TO USE: Add a short walkthrough step label or role label without editing source
        text or crowding the code line. Notes are grouped by id, default to current, and are
        cleared by clear_annotations_code. Labels are visible when CodeLens is enabled in VS Code.`,
        setCodeLensNoteSchema,
        async ({ id = 'current', path, uri, range, title, kind = 'focus', mode = 'replace' }: SetCodeLensNoteToolInput) => getEditorAnnotationService().setCodeLensNote({
            id,
            path,
            uri,
            range,
            title,
            kind,
            mode
        })
    );

    registerJsonEditorTool(
        server,
        'set_hover_note_code',
        `Sets a temporary squiggle-underlined hover note on a precise code range.

        WHEN TO USE: Add complementary word-level or expression-level information without showing
        persistent inline text. The note is visible as a wavy underline and shows sanitized markdown on hover.`,
        setHoverNoteSchema,
        async ({ id = 'current', path, uri, range, title, message, kind = 'info', mode = 'replace' }: SetHoverNoteToolInput) => getEditorAnnotationService().setHoverNote({
            id,
            path,
            uri,
            range,
            title,
            message,
            kind,
            mode
        })
    );

    registerJsonEditorTool(
        server,
        'set_explanation_comment_code',
        `Sets a temporary anchored Guided Explanation comment on a precise code range.

        WHEN TO USE: Attach a longer markdown explanation, teaching note, or Q&A anchor to code
        without editing source files. Comments are temporary guided-explanation notes, grouped by id,
        and cleared by clear_annotations_code.`,
        setExplanationCommentSchema,
        async ({ id = 'current', path, uri, range, title, body, kind = 'info', mode = 'replace' }: SetExplanationCommentToolInput) => getEditorAnnotationService().setExplanationComment({
            id,
            path,
            uri,
            range,
            title,
            body,
            kind,
            mode
        })
    );

    registerJsonEditorTool(
        server,
        'set_highlight_code',
        `Sets temporary visual highlights over one or more precise code ranges.

        WHEN TO USE: Draw the user's attention to exact expressions, arguments, or related spans
        during guided explanation. Highlights are grouped by id; id defaults to current. Replace mode
        clears the previous highlights for that id, while add mode appends ranges to it.`,
        setHighlightSchema,
        async ({ id = 'current', path, uri, ranges, kind = 'focus', mode = 'replace' }: SetHighlightToolInput) => getEditorAnnotationService().setHighlights({ id, path, uri, ranges, kind, mode })
    );

    registerJsonEditorTool(
        server,
        'reveal_range_code',
        `Reveals a precise code range in VS Code without selecting text.

        WHEN TO USE: Move the user's editor view to the code being explained when no persistent
        visual annotation is necessary. Omitting path targets the active editor.`,
        revealRangeSchema,
        async ({ path, range }: RevealRangeToolInput) => revealRange({ path, range })
    );
}
