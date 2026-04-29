import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { AnnotationKind, AnnotationMode, AnnotationRangeInput, getEditorAnnotationService } from '../editor/annotation-service';
import { getEditorContext } from '../editor/context-service';
import { DiffEntryInput, getEditorDiffService } from '../editor/diff-service';
import { McpRange } from '../editor/location-utils';
import { goToDefinition, revealRange } from '../editor/navigation-service';

interface OpenDiffToolInput {
    title?: string;
    leftUri?: string;
    rightUri?: string;
    entries?: DiffEntryInput[];
    include?: string[];
    exclude?: string[];
    maxFiles?: number;
}

interface GetEditorContextToolInput {
    includeSelectedText?: boolean;
    includeVisibleEditors?: boolean;
    maxSelectedTextCharacters?: number;
}

interface RevealRangeToolInput {
    path?: string;
    range: McpRange;
}

interface SetHighlightToolInput {
    id?: string;
    path?: string;
    uri?: string;
    ranges: AnnotationRangeInput[];
    mode?: AnnotationMode;
    kind?: AnnotationKind;
}

interface SetInlineCalloutToolInput {
    id?: string;
    path?: string;
    uri?: string;
    range: AnnotationRangeInput;
    title: string;
    message: string;
    mode?: AnnotationMode;
    kind?: AnnotationKind;
}

interface SetGutterMarkerToolInput {
    id?: string;
    path?: string;
    uri?: string;
    ranges?: AnnotationRangeInput[];
    lines?: number[];
    label?: string;
    mode?: AnnotationMode;
    kind?: AnnotationKind;
}

interface SetExplanationCommentToolInput {
    id?: string;
    path?: string;
    uri?: string;
    range: AnnotationRangeInput;
    title: string;
    body: string;
    mode?: AnnotationMode;
    kind?: AnnotationKind;
}

interface SetHoverNoteToolInput {
    id?: string;
    path?: string;
    uri?: string;
    range: AnnotationRangeInput;
    title?: string;
    message: string;
    mode?: AnnotationMode;
    kind?: AnnotationKind;
}

interface SetCodeLensNoteToolInput {
    id?: string;
    path?: string;
    uri?: string;
    range: AnnotationRangeInput;
    title: string;
    mode?: AnnotationMode;
    kind?: AnnotationKind;
}

interface ClearAnnotationsToolInput {
    id?: string;
    path?: string;
    uri?: string;
    all?: boolean;
}

interface GoToDefinitionToolInput {
    path?: string;
    position?: { line: number; character?: number };
    range?: McpRange;
}

const positionSchema = z.object({
    line: z.number().describe('1-based line number'),
    character: z.number().optional().default(0).describe('0-based character offset')
});

const rangeSchema = z.object({
    start: positionSchema,
    end: positionSchema.optional()
});

const annotationRangeSchema = rangeSchema.extend({
    path: z.string().optional().describe('Workspace-relative path for this range. Defaults to the tool path/URI or active editor.'),
    uri: z.string().optional().describe('Document URI for this range. Mutually exclusive with path.')
});

const annotationKindSchema = z.enum(['focus', 'related', 'previous', 'question', 'warning', 'info']);
const diffEntrySchema = z.object({
    label: z.string().optional().describe('Optional human-readable entry label returned in normalized entries'),
    leftUri: z.string().optional().describe('Optional left/original document URI'),
    rightUri: z.string().optional().describe('Optional right/modified document URI')
});

export function registerEditorTools(server: McpServer): void {
    server.tool(
        'open_diff_code',
        `Opens a native VS Code changes editor for URI-first guided diff review.

        WHEN TO USE: Compare explicit file pairs or, in source mode, high-level left/right URI
        resources, then use the returned document URIs for follow-up annotations. Explicit entries
        may omit one side for added or deleted files; no public status field is required.`,
        {
            title: z.string().optional().describe('Human-readable title for the VS Code changes editor'),
            leftUri: z.string().optional().describe('Source-mode left URI. Mutually exclusive with entries.'),
            rightUri: z.string().optional().describe('Source-mode right URI. Mutually exclusive with entries.'),
            entries: z.array(diffEntrySchema).optional().describe('Explicit file-pair entries with optional leftUri/rightUri sides'),
            include: z.array(z.string()).optional().describe('Optional relative-path include filters for normalized entries'),
            exclude: z.array(z.string()).optional().describe('Optional relative-path exclude filters for normalized entries'),
            maxFiles: z.number().int().positive().optional().describe('Maximum number of normalized entries to open')
        },
        async (input: OpenDiffToolInput): Promise<CallToolResult> => {
            const result = await getEditorDiffService().openDiff(input);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        }
    );

    server.tool(
        'get_editor_context_code',
        `Returns the current VS Code editor context for guided code exploration.

        WHEN TO USE: Understanding what the user is looking at, adapting to active selections,
        visible ranges, or split editors before revealing, highlighting, or explaining code.

        By default returns the active editor. Set includeSelectedText=true to include selected code,
        and includeVisibleEditors=true to include all visible editors.`,
        {
            includeSelectedText: z.boolean().optional().default(false).describe('Include selected text for active selections'),
            includeVisibleEditors: z.boolean().optional().default(false).describe('Include metadata for all visible editors'),
            maxSelectedTextCharacters: z.number().optional().default(4000).describe('Maximum selected text characters to return')
        },
        async ({
            includeSelectedText = false,
            includeVisibleEditors = false,
            maxSelectedTextCharacters = 4000
        }: GetEditorContextToolInput): Promise<CallToolResult> => {
            const context = await getEditorContext({
                includeSelectedText,
                includeVisibleEditors,
                maxSelectedTextCharacters
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(context, null, 2)
                    }
                ]
            };
        }
    );

    server.tool(
        'go_to_definition_code',
        `Navigates VS Code to the definition for a symbol position and returns the resulting location.

        WHEN TO USE: Follow a call, variable, or type visually during guided exploration. Omitting
        path targets the active editor; position defaults to the active selection when omitted.`,
        {
            path: z.string().optional().describe('Workspace-relative source path. Defaults to active editor.'),
            position: positionSchema.optional().describe('Source position using 1-based line and 0-based character'),
            range: rangeSchema.optional().describe('Source range; start is used when position is omitted')
        },
        async ({ path, position, range }: GoToDefinitionToolInput): Promise<CallToolResult> => {
            const location = await goToDefinition({ path, position, range });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(location, null, 2)
                    }
                ]
            };
        }
    );

    server.tool(
        'clear_annotations_code',
        `Clears temporary editor annotations, including highlights, inline callouts, CodeLens notes, hover notes, gutter markers, overview-ruler markers, and Guided Explanation comments.

        WHEN TO USE: Remove stale visual focus before moving to a new explanation. By default clears
        id=current. Provide id to clear one group, path to limit clearing to a file, or all=true to clear everything.`,
        {
            id: z.string().optional().describe('Annotation group id to clear. Defaults to current when id/path/uri/all are omitted.'),
            path: z.string().optional().describe('Workspace-relative path to limit clearing'),
            uri: z.string().optional().describe('Document URI to limit clearing. Mutually exclusive with path.'),
            all: z.boolean().optional().default(false).describe('Clear all annotation groups')
        },
        async ({ id, path, uri, all = false }: ClearAnnotationsToolInput): Promise<CallToolResult> => {
            const result = await getEditorAnnotationService().clearAnnotations({ id, path, uri, all });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        }
    );

    server.tool(
        'set_inline_callout_code',
        `Sets a temporary visible inline explanation beside a precise code range.

        WHEN TO USE: Attach a short explanation directly in the editor without requiring hover.
        The callout is grouped by id, defaults to current, and is attached at the end of the range's start line.`,
        {
            id: z.string().optional().default('current').describe('Annotation group id. Defaults to current.'),
            path: z.string().optional().describe('Workspace-relative path. Defaults to active editor.'),
            uri: z.string().optional().describe('Document URI. Mutually exclusive with path.'),
            range: annotationRangeSchema.describe('Precise range the callout explains'),
            title: z.string().describe('Short callout title'),
            message: z.string().describe('Short callout sentence'),
            kind: annotationKindSchema.optional().default('focus').describe('Semantic visual style for the callout'),
            mode: z.enum(['replace', 'add']).optional().default('replace').describe('Replace or add to callouts for the id')
        },
        async ({ id, path, uri, range, title, message, kind = 'focus', mode = 'replace' }: SetInlineCalloutToolInput): Promise<CallToolResult> => {
            const result = await getEditorAnnotationService().setInlineCallout({
                id,
                path,
                uri,
                range,
                title,
                message,
                kind,
                mode
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        }
    );

    server.tool(
        'set_gutter_marker_code',
        `Sets temporary gutter markers anchored to code lines or ranges.

        WHEN TO USE: Add step markers, warning/question markers, or related-location markers during
        guided explanation. Markers are grouped by id; id defaults to current. Provide lines for
        simple same-file markers or ranges for precise and multi-file markers.`,
        {
            id: z.string().optional().default('current').describe('Annotation group id. Defaults to current.'),
            path: z.string().optional().describe('Workspace-relative path for lines or ranges that omit path. Defaults to active editor.'),
            uri: z.string().optional().describe('Document URI for lines or ranges that omit uri. Mutually exclusive with path.'),
            lines: z.array(z.number()).optional().describe('One or more 1-based line numbers for same-file gutter markers'),
            ranges: z.array(annotationRangeSchema).optional().describe('One or more precise marker ranges'),
            label: z.string().optional().describe('Short marker label or hover text'),
            kind: annotationKindSchema.optional().default('focus').describe('Semantic visual style for the marker'),
            mode: z.enum(['replace', 'add']).optional().default('replace').describe('Replace or add to gutter markers for the id')
        },
        async ({ id, path, uri, lines, ranges, label, kind = 'focus', mode = 'replace' }: SetGutterMarkerToolInput): Promise<CallToolResult> => {
            const result = await getEditorAnnotationService().setGutterMarkers({
                id,
                path,
                uri,
                lines,
                ranges,
                label,
                kind,
                mode
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        }
    );

    server.tool(
        'set_codelens_note_code',
        `Sets a temporary visible CodeLens note above a precise code range.

        WHEN TO USE: Add a short walkthrough step label or role label without editing source
        text or crowding the code line. Notes are grouped by id, default to current, and are
        cleared by clear_annotations_code. Labels are visible when CodeLens is enabled in VS Code.`,
        {
            id: z.string().optional().default('current').describe('Annotation group id. Defaults to current.'),
            path: z.string().optional().describe('Workspace-relative path. Defaults to active editor.'),
            uri: z.string().optional().describe('Document URI. Mutually exclusive with path.'),
            range: annotationRangeSchema.describe('Precise range the CodeLens note labels'),
            title: z.string().describe('Short visible CodeLens label, such as "Step 1: schema" or "Caller"'),
            kind: annotationKindSchema.optional().default('focus').describe('Semantic intent for the note'),
            mode: z.enum(['replace', 'add']).optional().default('replace').describe('Replace or add to CodeLens notes for the id')
        },
        async ({ id, path, uri, range, title, kind = 'focus', mode = 'replace' }: SetCodeLensNoteToolInput): Promise<CallToolResult> => {
            const result = await getEditorAnnotationService().setCodeLensNote({
                id,
                path,
                uri,
                range,
                title,
                kind,
                mode
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        }
    );

    server.tool(
        'set_hover_note_code',
        `Sets a temporary squiggle-underlined hover note on a precise code range.

        WHEN TO USE: Add complementary word-level or expression-level information without showing
        persistent inline text. The note is visible as a wavy underline and shows sanitized markdown on hover.`,
        {
            id: z.string().optional().default('current').describe('Annotation group id. Defaults to current.'),
            path: z.string().optional().describe('Workspace-relative path. Defaults to active editor.'),
            uri: z.string().optional().describe('Document URI. Mutually exclusive with path.'),
            range: annotationRangeSchema.describe('Precise range the hover note annotates'),
            title: z.string().optional().describe('Optional short hover note title'),
            message: z.string().describe('Markdown hover note body rendered as untrusted markdown'),
            kind: annotationKindSchema.optional().default('info').describe('Semantic visual style for the squiggle underline'),
            mode: z.enum(['replace', 'add']).optional().default('replace').describe('Replace or add to hover notes for the id')
        },
        async ({ id, path, uri, range, title, message, kind = 'info', mode = 'replace' }: SetHoverNoteToolInput): Promise<CallToolResult> => {
            const result = await getEditorAnnotationService().setHoverNote({
                id,
                path,
                uri,
                range,
                title,
                message,
                kind,
                mode
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        }
    );

    server.tool(
        'set_explanation_comment_code',
        `Sets a temporary anchored Guided Explanation comment on a precise code range.

        WHEN TO USE: Attach a longer markdown explanation, teaching note, or Q&A anchor to code
        without editing source files. Comments are temporary guided-explanation notes, grouped by id,
        and cleared by clear_annotations_code.`,
        {
            id: z.string().optional().default('current').describe('Annotation group id. Defaults to current.'),
            path: z.string().optional().describe('Workspace-relative path. Defaults to active editor.'),
            uri: z.string().optional().describe('Document URI. Mutually exclusive with path.'),
            range: annotationRangeSchema.describe('Precise range the explanation comment anchors to'),
            title: z.string().describe('Short guided explanation title'),
            body: z.string().describe('Markdown explanation body rendered as untrusted markdown'),
            kind: annotationKindSchema.optional().default('info').describe('Semantic visual style for the explanation comment'),
            mode: z.enum(['replace', 'add']).optional().default('replace').describe('Replace or add to explanation comments for the id')
        },
        async ({ id, path, uri, range, title, body, kind = 'info', mode = 'replace' }: SetExplanationCommentToolInput): Promise<CallToolResult> => {
            const result = await getEditorAnnotationService().setExplanationComment({
                id,
                path,
                uri,
                range,
                title,
                body,
                kind,
                mode
            });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        }
    );

    server.tool(
        'set_highlight_code',
        `Sets temporary visual highlights over one or more precise code ranges.

        WHEN TO USE: Draw the user's attention to exact expressions, arguments, or related spans
        during guided explanation. Highlights are grouped by id; id defaults to current. Replace mode
        clears the previous highlights for that id, while add mode appends ranges to it.`,
        {
            id: z.string().optional().default('current').describe('Annotation group id. Defaults to current.'),
            path: z.string().optional().describe('Workspace-relative path for ranges that omit path. Defaults to active editor.'),
            uri: z.string().optional().describe('Document URI for ranges that omit uri. Mutually exclusive with path.'),
            ranges: z.array(annotationRangeSchema).min(1).describe('One or more precise highlight ranges'),
            kind: annotationKindSchema.optional().default('focus').describe('Semantic visual style for the highlight'),
            mode: z.enum(['replace', 'add']).optional().default('replace').describe('Replace or add to ranges for the id')
        },
        async ({ id, path, uri, ranges, kind = 'focus', mode = 'replace' }: SetHighlightToolInput): Promise<CallToolResult> => {
            const result = await getEditorAnnotationService().setHighlights({ id, path, uri, ranges, kind, mode });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        }
    );

    server.tool(
        'reveal_range_code',
        `Reveals a precise code range in VS Code without selecting text.

        WHEN TO USE: Move the user's editor view to the code being explained when no persistent
        visual annotation is necessary. Omitting path targets the active editor.`,
        {
            path: z.string().optional().describe('Workspace-relative path. Defaults to the active editor when omitted.'),
            range: rangeSchema.describe('Precise range to reveal using 1-based lines and 0-based characters')
        },
        async ({ path, range }: RevealRangeToolInput): Promise<CallToolResult> => {
            const location = await revealRange({ path, range });

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(location, null, 2)
                    }
                ]
            };
        }
    );
}
