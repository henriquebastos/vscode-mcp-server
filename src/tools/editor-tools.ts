import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { AnnotationMode, AnnotationRangeInput, getEditorAnnotationService } from '../editor/annotation-service';
import { getEditorContext } from '../editor/context-service';
import { McpRange } from '../editor/location-utils';
import { goToDefinition, revealRange } from '../editor/navigation-service';

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
    ranges: AnnotationRangeInput[];
    mode?: AnnotationMode;
}

interface SetInlineCalloutToolInput {
    id?: string;
    path?: string;
    range: AnnotationRangeInput;
    title: string;
    message: string;
    mode?: AnnotationMode;
}

interface ClearAnnotationsToolInput {
    id?: string;
    path?: string;
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
    path: z.string().optional().describe('Workspace-relative path for this range. Defaults to the tool path or active editor.')
});

export function registerEditorTools(server: McpServer): void {
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
        `Clears temporary editor highlights and inline callouts.

        WHEN TO USE: Remove stale visual focus before moving to a new explanation. By default clears
        id=current. Provide id to clear one group, path to limit clearing to a file, or all=true to clear everything.`,
        {
            id: z.string().optional().describe('Annotation group id to clear. Defaults to current when id/path/all are omitted.'),
            path: z.string().optional().describe('Workspace-relative path to limit clearing'),
            all: z.boolean().optional().default(false).describe('Clear all annotation groups')
        },
        async ({ id, path, all = false }: ClearAnnotationsToolInput): Promise<CallToolResult> => {
            const result = await getEditorAnnotationService().clearAnnotations({ id, path, all });

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
            range: annotationRangeSchema.describe('Precise range the callout explains'),
            title: z.string().describe('Short callout title'),
            message: z.string().describe('Short callout sentence'),
            mode: z.enum(['replace', 'add']).optional().default('replace').describe('Replace or add to callouts for the id')
        },
        async ({ id, path, range, title, message, mode = 'replace' }: SetInlineCalloutToolInput): Promise<CallToolResult> => {
            const result = await getEditorAnnotationService().setInlineCallout({
                id,
                path,
                range,
                title,
                message,
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
            ranges: z.array(annotationRangeSchema).min(1).describe('One or more precise highlight ranges'),
            mode: z.enum(['replace', 'add']).optional().default('replace').describe('Replace or add to ranges for the id')
        },
        async ({ id, path, ranges, mode = 'replace' }: SetHighlightToolInput): Promise<CallToolResult> => {
            const result = await getEditorAnnotationService().setHighlights({ id, path, ranges, mode });

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
