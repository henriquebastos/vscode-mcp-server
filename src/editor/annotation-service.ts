import * as vscode from 'vscode';
import { McpRange, mcpRangeToVsCodeRange, resolveEditorTarget, uriToWorkspacePath } from './location-utils';

export type AnnotationMode = 'replace' | 'add';

export interface AnnotationRangeInput extends McpRange {
    path?: string;
}

export interface SetHighlightsInput {
    id?: string;
    path?: string;
    ranges: AnnotationRangeInput[];
    mode?: AnnotationMode;
}

export interface SetInlineCalloutInput {
    id?: string;
    path?: string;
    range: AnnotationRangeInput;
    title: string;
    message: string;
    mode?: AnnotationMode;
}

export interface AnnotationOperationResult {
    id: string;
    paths: string[];
    rangeCount: number;
}

export interface ClearAnnotationsInput {
    id?: string;
    path?: string;
    all?: boolean;
}

export interface ClearAnnotationsResult {
    clearedIds: number;
    clearedPaths: string[];
}

interface RangesForUri {
    uri: vscode.Uri;
    ranges: vscode.Range[];
}

interface CalloutsForUri {
    uri: vscode.Uri;
    options: vscode.DecorationOptions[];
}

interface AnnotationGroup {
    highlights: Map<string, RangesForUri>;
    callouts: Map<string, CalloutsForUri>;
}

const DEFAULT_ANNOTATION_ID = 'current';

function getOrCreateGroup(groups: Map<string, AnnotationGroup>, id: string): AnnotationGroup {
    let group = groups.get(id);
    if (!group) {
        group = { highlights: new Map(), callouts: new Map() };
        groups.set(id, group);
    }

    return group;
}

function getVisibleEditor(uri: vscode.Uri): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === uri.toString());
}

export class EditorAnnotationService {
    private groups = new Map<string, AnnotationGroup>();
    private readonly highlightDecorationType: vscode.TextEditorDecorationType;
    private readonly calloutDecorationType: vscode.TextEditorDecorationType;

    constructor() {
        this.highlightDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            border: '1px solid',
            borderColor: new vscode.ThemeColor('editor.findMatchBorder')
        });
        this.calloutDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 1rem',
                color: new vscode.ThemeColor('editorCodeLens.foreground')
            }
        });
    }

    public async setHighlights(input: SetHighlightsInput): Promise<AnnotationOperationResult> {
        const id = input.id ?? DEFAULT_ANNOTATION_ID;
        const mode = input.mode ?? 'replace';
        const group = getOrCreateGroup(this.groups, id);
        const nextHighlights = mode === 'add'
            ? new Map(Array.from(group.highlights, ([key, entry]) => [key, { uri: entry.uri, ranges: [...entry.ranges] }]))
            : new Map<string, RangesForUri>();

        for (const inputRange of input.ranges) {
            const target = await resolveEditorTarget({ path: inputRange.path ?? input.path });
            const key = target.uri.toString();
            const existing = nextHighlights.get(key) ?? { uri: target.uri, ranges: [] };
            existing.ranges.push(mcpRangeToVsCodeRange(inputRange));
            nextHighlights.set(key, existing);
        }

        group.highlights = nextHighlights;
        this.applyHighlights();

        const paths = Array.from(nextHighlights.values()).map(entry => uriToWorkspacePath(entry.uri));
        const rangeCount = Array.from(nextHighlights.values()).reduce((total, entry) => total + entry.ranges.length, 0);

        return { id, paths, rangeCount };
    }

    public async setInlineCallout(input: SetInlineCalloutInput): Promise<AnnotationOperationResult> {
        const id = input.id ?? DEFAULT_ANNOTATION_ID;
        const mode = input.mode ?? 'replace';
        const group = getOrCreateGroup(this.groups, id);
        const nextCallouts = mode === 'add'
            ? new Map(Array.from(group.callouts, ([key, entry]) => [key, { uri: entry.uri, options: [...entry.options] }]))
            : new Map<string, CalloutsForUri>();
        const target = await resolveEditorTarget({ path: input.range.path ?? input.path });
        const editor = target.editor ?? getVisibleEditor(target.uri);

        if (!editor) {
            throw new Error(`No visible editor is available for ${uriToWorkspacePath(target.uri)}; reveal the file before adding an inline callout.`);
        }

        const range = mcpRangeToVsCodeRange(input.range);
        const lineEnd = editor.document.lineAt(range.start.line).range.end;
        const option: vscode.DecorationOptions = {
            range: new vscode.Range(lineEnd, lineEnd),
            renderOptions: {
                after: {
                    contentText: `  ${input.title}: ${input.message}`
                }
            }
        };

        const key = target.uri.toString();
        const existing = nextCallouts.get(key) ?? { uri: target.uri, options: [] };
        existing.options.push(option);
        nextCallouts.set(key, existing);
        group.callouts = nextCallouts;

        this.applyCallouts();

        const paths = Array.from(nextCallouts.values()).map(entry => uriToWorkspacePath(entry.uri));
        const rangeCount = Array.from(nextCallouts.values()).reduce((total, entry) => total + entry.options.length, 0);

        return { id, paths, rangeCount };
    }

    public async clearAnnotations(input: ClearAnnotationsInput = {}): Promise<ClearAnnotationsResult> {
        const clearedPaths = new Set<string>();
        let clearedIds = 0;
        const pathFilter = input.path ? await resolveEditorTarget({ path: input.path }) : undefined;
        const pathKey = pathFilter?.uri.toString();
        const pathLabel = pathFilter ? uriToWorkspacePath(pathFilter.uri) : undefined;

        if (input.all) {
            clearedIds = this.groups.size;
            for (const group of this.groups.values()) {
                for (const entry of group.highlights.values()) {
                    clearedPaths.add(uriToWorkspacePath(entry.uri));
                }
                for (const entry of group.callouts.values()) {
                    clearedPaths.add(uriToWorkspacePath(entry.uri));
                }
            }
            this.groups.clear();
        } else {
            const targetId = input.id ?? (input.path ? undefined : DEFAULT_ANNOTATION_ID);
            const groupsToClear = targetId ? [[targetId, this.groups.get(targetId)] as const] : Array.from(this.groups.entries());

            for (const [id, group] of groupsToClear) {
                if (!group) {
                    continue;
                }

                if (pathKey) {
                    const removedHighlights = group.highlights.delete(pathKey);
                    const removedCallouts = group.callouts.delete(pathKey);
                    if (removedHighlights || removedCallouts) {
                        if (pathLabel) {
                            clearedPaths.add(pathLabel);
                        }
                        clearedIds += 1;
                    }
                    if (group.highlights.size === 0 && group.callouts.size === 0) {
                        this.groups.delete(id);
                    }
                } else if (this.groups.delete(id)) {
                    clearedIds += 1;
                    for (const entry of group.highlights.values()) {
                        clearedPaths.add(uriToWorkspacePath(entry.uri));
                    }
                    for (const entry of group.callouts.values()) {
                        clearedPaths.add(uriToWorkspacePath(entry.uri));
                    }
                }
            }
        }

        this.applyHighlights();
        this.applyCallouts();

        return { clearedIds, clearedPaths: Array.from(clearedPaths) };
    }

    private applyHighlights(): void {
        const rangesByUri = new Map<string, RangesForUri>();

        for (const group of this.groups.values()) {
            for (const [key, entry] of group.highlights) {
                const combined = rangesByUri.get(key) ?? { uri: entry.uri, ranges: [] };
                combined.ranges.push(...entry.ranges);
                rangesByUri.set(key, combined);
            }
        }

        const visibleUris = new Set(vscode.window.visibleTextEditors.map(editor => editor.document.uri.toString()));
        for (const [key, entry] of rangesByUri) {
            const editor = getVisibleEditor(entry.uri);
            if (editor) {
                editor.setDecorations(this.highlightDecorationType, entry.ranges);
            }
            visibleUris.delete(key);
        }

        for (const editor of vscode.window.visibleTextEditors) {
            if (visibleUris.has(editor.document.uri.toString())) {
                editor.setDecorations(this.highlightDecorationType, []);
            }
        }
    }

    private applyCallouts(): void {
        const calloutsByUri = new Map<string, CalloutsForUri>();

        for (const group of this.groups.values()) {
            for (const [key, entry] of group.callouts) {
                const combined = calloutsByUri.get(key) ?? { uri: entry.uri, options: [] };
                combined.options.push(...entry.options);
                calloutsByUri.set(key, combined);
            }
        }

        const visibleUris = new Set(vscode.window.visibleTextEditors.map(editor => editor.document.uri.toString()));
        for (const [key, entry] of calloutsByUri) {
            const editor = getVisibleEditor(entry.uri);
            if (editor) {
                editor.setDecorations(this.calloutDecorationType, entry.options);
            }
            visibleUris.delete(key);
        }

        for (const editor of vscode.window.visibleTextEditors) {
            if (visibleUris.has(editor.document.uri.toString())) {
                editor.setDecorations(this.calloutDecorationType, []);
            }
        }
    }

    public dispose(): void {
        this.highlightDecorationType.dispose();
        this.calloutDecorationType.dispose();
    }
}

let defaultAnnotationService: EditorAnnotationService | undefined;

export function getEditorAnnotationService(): EditorAnnotationService {
    if (!defaultAnnotationService) {
        defaultAnnotationService = new EditorAnnotationService();
    }

    return defaultAnnotationService;
}

export function disposeEditorAnnotationService(): void {
    if (defaultAnnotationService) {
        defaultAnnotationService.dispose();
        defaultAnnotationService = undefined;
    }
}
