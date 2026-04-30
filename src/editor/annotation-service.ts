import * as vscode from 'vscode';
import { AnnotationStore } from './annotation-store';
import type {
    AnnotationClearFilter,
    AnnotationEntry,
    AnnotationKind,
    AnnotationMode,
    CodeLensNoteEntry,
    ExplanationCommentEntry,
    GutterMarkerEntry,
    HighlightEntry,
    HoverNoteEntry
} from './annotation-store';
import { VsCodeAnnotationRenderer } from './annotation-renderer';
import { createUntrustedMarkdown, escapeMarkdownText, sanitizeGuidedMarkdown } from './markdown-utils';
import type { AnnotationId } from './ids';
import { toAnnotationId } from './ids';
import type { McpRange } from './location-utils';
import { mcpRangeToVsCodeRange, resolveEditorTarget, isUriInsideWorkspace, uriToWorkspacePath } from './location-utils';

export type { AnnotationKind, AnnotationMode } from './annotation-store';

export interface AnnotationRangeInput extends McpRange {
    path?: string | undefined;
    uri?: string | undefined;
}

interface AnnotationTargetInput {
    path?: string | undefined;
    uri?: string | undefined;
}

export interface SetHighlightsInput extends AnnotationTargetInput {
    id?: string | undefined;
    ranges: AnnotationRangeInput[];
    mode?: AnnotationMode | undefined;
    kind?: AnnotationKind | undefined;
}

export interface SetInlineCalloutInput extends AnnotationTargetInput {
    id?: string | undefined;
    range: AnnotationRangeInput;
    title: string;
    message: string;
    mode?: AnnotationMode | undefined;
    kind?: AnnotationKind | undefined;
}

export interface SetGutterMarkersInput extends AnnotationTargetInput {
    id?: string | undefined;
    ranges?: AnnotationRangeInput[] | undefined;
    lines?: number[] | undefined;
    mode?: AnnotationMode | undefined;
    kind?: AnnotationKind | undefined;
    label?: string | undefined;
}

export interface SetExplanationCommentInput extends AnnotationTargetInput {
    id?: string | undefined;
    range: AnnotationRangeInput;
    title: string;
    body: string;
    mode?: AnnotationMode | undefined;
    kind?: AnnotationKind | undefined;
}

export interface SetHoverNoteInput extends AnnotationTargetInput {
    id?: string | undefined;
    range: AnnotationRangeInput;
    title?: string | undefined;
    message: string;
    mode?: AnnotationMode | undefined;
    kind?: AnnotationKind | undefined;
}

export interface SetCodeLensNoteInput extends AnnotationTargetInput {
    id?: string | undefined;
    range: AnnotationRangeInput;
    title: string;
    mode?: AnnotationMode | undefined;
    kind?: AnnotationKind | undefined;
}

export interface AnnotationOperationResult {
    id: AnnotationId;
    paths: string[];
    uris: string[];
    rangeCount: number;
}

export interface ClearAnnotationsInput extends AnnotationTargetInput {
    id?: string | undefined;
    all?: boolean | undefined;
}

export interface ClearAnnotationsResult {
    clearedIds: number;
    clearedPaths: string[];
    clearedUris: string[];
}

const DEFAULT_ANNOTATION_ID = toAnnotationId('current');
const DEFAULT_ANNOTATION_KIND: AnnotationKind = 'focus';

interface AnnotationOptionsInput {
    id?: string | undefined;
    mode?: AnnotationMode | undefined;
    kind?: AnnotationKind | undefined;
}

function resolveAnnotationOptions(
    input: AnnotationOptionsInput,
    defaultKind: AnnotationKind = DEFAULT_ANNOTATION_KIND,
): { id: AnnotationId; mode: AnnotationMode; kind: AnnotationKind } {
    return {
        id: input.id !== undefined ? toAnnotationId(input.id) : DEFAULT_ANNOTATION_ID,
        mode: input.mode ?? 'replace',
        kind: input.kind ?? defaultKind,
    };
}
const CODELENS_NOTE_NOOP_COMMAND = 'vscode-mcp-server.codelensNote.noop';

let codeLensNoteNoopCommandDisposable: vscode.Disposable | undefined;
let codeLensNoteNoopCommandRefCount = 0;

function acquireCodeLensNoteNoopCommand(): vscode.Disposable {
    if (!codeLensNoteNoopCommandDisposable) {
        codeLensNoteNoopCommandDisposable = vscode.commands.registerCommand(CODELENS_NOTE_NOOP_COMMAND, () => undefined);
    }
    codeLensNoteNoopCommandRefCount += 1;
    let disposed = false;

    return {
        dispose: () => {
            if (disposed) {
                return;
            }
            disposed = true;
            codeLensNoteNoopCommandRefCount -= 1;
            if (codeLensNoteNoopCommandRefCount === 0) {
                codeLensNoteNoopCommandDisposable?.dispose();
                codeLensNoteNoopCommandDisposable = undefined;
            }
        }
    };
}

function getVisibleEditor(uri: vscode.Uri): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === uri.toString());
}

function workspacePathIfAvailable(uri: vscode.Uri): string | undefined {
    return isUriInsideWorkspace(uri) ? uriToWorkspacePath(uri) : undefined;
}

function operationResult(id: AnnotationId, entries: AnnotationEntry[]): AnnotationOperationResult {
    const paths = new Set<string>();
    const uris = new Set<string>();
    for (const entry of entries) {
        const workspacePath = workspacePathIfAvailable(entry.uri);
        if (workspacePath) {
            paths.add(workspacePath);
        }
        uris.add(entry.uri.toString());
    }
    return { id, paths: Array.from(paths), uris: Array.from(uris), rangeCount: entries.length };
}

function pickAnnotationTarget(input: AnnotationTargetInput): AnnotationTargetInput {
    const target: AnnotationTargetInput = {};
    if (input.path !== undefined) {
        target.path = input.path;
    }
    if (input.uri !== undefined) {
        target.uri = input.uri;
    }
    return target;
}

function annotationTargetForRange(input: AnnotationTargetInput, range: AnnotationRangeInput): AnnotationTargetInput {
    if (range.path && range.uri) {
        throw new Error('Provide either path or uri for an annotation range, not both.');
    }
    if (range.uri) {
        return { uri: range.uri };
    }
    if (range.path) {
        return { path: range.path };
    }
    return pickAnnotationTarget(input);
}

function createGutterMarkerEntry(
    uri: vscode.Uri,
    range: vscode.Range,
    kind: AnnotationKind,
    label: string | undefined
): GutterMarkerEntry {
    const entry: GutterMarkerEntry = { uri, range, kind };
    if (label !== undefined) {
        entry.label = label;
    }
    return entry;
}

function createHoverNoteEntry(
    uri: vscode.Uri,
    range: vscode.Range,
    message: string,
    kind: AnnotationKind,
    title: string | undefined
): HoverNoteEntry {
    const entry: HoverNoteEntry = { uri, range, message, kind };
    if (title !== undefined) {
        entry.title = title;
    }
    return entry;
}

export class EditorAnnotationService {
    private readonly store = new AnnotationStore({ workspacePathForUri: workspacePathIfAvailable });
    private readonly renderer = new VsCodeAnnotationRenderer(DEFAULT_ANNOTATION_KIND);
    private readonly codeLensChangeEmitter = new vscode.EventEmitter<void>();
    private readonly codeLensProviderDisposable: vscode.Disposable;
    private readonly codeLensCommandDisposable: vscode.Disposable;
    private commentController: vscode.CommentController | undefined;

    constructor() {
        this.codeLensCommandDisposable = acquireCodeLensNoteNoopCommand();
        this.codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
            { scheme: '*' },
            {
                onDidChangeCodeLenses: this.codeLensChangeEmitter.event,
                provideCodeLenses: document => this.provideCodeLensNotes(document.uri)
            }
        );
    }

    public async setHighlights(input: SetHighlightsInput): Promise<AnnotationOperationResult> {
        const { id, mode, kind } = resolveAnnotationOptions(input);
        const newEntries: HighlightEntry[] = [];

        for (const inputRange of input.ranges) {
            const target = await resolveEditorTarget(annotationTargetForRange(input, inputRange));
            newEntries.push({ uri: target.uri, range: mcpRangeToVsCodeRange(inputRange), kind });
        }

        const group = this.store.setSurfaceEntries(id, 'highlights', newEntries, mode);
        this.renderer.apply(this.store, ['highlights']);

        return operationResult(id, group.highlights);
    }

    public async setInlineCallout(input: SetInlineCalloutInput): Promise<AnnotationOperationResult> {
        const { id, mode, kind } = resolveAnnotationOptions(input);
        const target = await resolveEditorTarget(annotationTargetForRange(input, input.range));
        const editor = target.editor ?? getVisibleEditor(target.uri);

        if (!editor) {
            throw new Error(`No visible editor is available for ${uriToWorkspacePath(target.uri)}; reveal the file before adding an inline callout.`);
        }

        const range = mcpRangeToVsCodeRange(input.range);
        editor.document.lineAt(range.start.line);

        const group = this.store.setSurfaceEntries(id, 'callouts', [{ uri: target.uri, range, title: input.title, message: input.message, kind }], mode);
        this.renderer.apply(this.store, ['callouts']);

        return operationResult(id, group.callouts);
    }

    public async setGutterMarkers(input: SetGutterMarkersInput): Promise<AnnotationOperationResult> {
        const { id, mode, kind } = resolveAnnotationOptions(input);
        const newEntries: GutterMarkerEntry[] = [];

        for (const line of input.lines ?? []) {
            const target = await resolveEditorTarget(pickAnnotationTarget(input));
            const range = mcpRangeToVsCodeRange({ start: { line, character: 0 }, end: { line, character: 0 } });
            newEntries.push(createGutterMarkerEntry(target.uri, range, kind, input.label));
        }

        for (const inputRange of input.ranges ?? []) {
            const target = await resolveEditorTarget(annotationTargetForRange(input, inputRange));
            const range = mcpRangeToVsCodeRange(inputRange);
            newEntries.push(createGutterMarkerEntry(target.uri, range, kind, input.label));
        }

        if (newEntries.length === 0) {
            throw new Error('Provide at least one line or range for a gutter marker.');
        }

        const group = this.store.setSurfaceEntries(id, 'gutterMarkers', newEntries, mode);
        this.renderer.apply(this.store, ['gutterMarkers']);

        return operationResult(id, group.gutterMarkers);
    }

    public async setHoverNote(input: SetHoverNoteInput): Promise<AnnotationOperationResult> {
        const { id, mode, kind } = resolveAnnotationOptions(input, 'info');
        const target = await resolveEditorTarget(annotationTargetForRange(input, input.range));
        const range = mcpRangeToVsCodeRange(input.range);

        const group = this.store.setSurfaceEntries(id, 'hoverNotes', [createHoverNoteEntry(target.uri, range, input.message, kind, input.title)], mode);
        this.renderer.apply(this.store, ['hoverNotes']);

        return operationResult(id, group.hoverNotes);
    }

    public async setCodeLensNote(input: SetCodeLensNoteInput): Promise<AnnotationOperationResult> {
        const { id, mode, kind } = resolveAnnotationOptions(input);
        const target = await resolveEditorTarget(annotationTargetForRange(input, input.range));
        const range = mcpRangeToVsCodeRange(input.range);

        const group = this.store.setSurfaceEntries(id, 'codeLensNotes', [{ uri: target.uri, range, title: input.title, kind }], mode);
        this.codeLensChangeEmitter.fire();

        return operationResult(id, group.codeLensNotes);
    }

    public async setExplanationComment(input: SetExplanationCommentInput): Promise<AnnotationOperationResult> {
        const { id, mode, kind } = resolveAnnotationOptions(input, 'info');
        const existingGroup = this.store.getGroup(id);
        const target = await resolveEditorTarget(annotationTargetForRange(input, input.range));
        const range = mcpRangeToVsCodeRange(input.range);
        const thread = this.createExplanationCommentThread(target.uri, range, input.title, input.body, kind);

        if (mode === 'replace' && existingGroup) {
            this.disposeCommentEntries(existingGroup.explanationComments);
        }

        const group = this.store.setSurfaceEntries(id, 'explanationComments', [{ uri: target.uri, thread, kind }], mode);

        return operationResult(id, group.explanationComments);
    }

    public async clearAnnotations(input: ClearAnnotationsInput = {}): Promise<ClearAnnotationsResult> {
        const targetFilter = input.path || input.uri ? await resolveEditorTarget(pickAnnotationTarget(input)) : undefined;
        const targetId = input.id !== undefined ? toAnnotationId(input.id) : (targetFilter ? undefined : DEFAULT_ANNOTATION_ID);
        const clearFilter: AnnotationClearFilter = {};
        if (input.all !== undefined) {
            clearFilter.all = input.all;
        }
        if (targetId !== undefined) {
            clearFilter.id = targetId;
        }
        if (targetFilter) {
            clearFilter.targetUri = targetFilter.uri;
            const targetPath = workspacePathIfAvailable(targetFilter.uri);
            if (targetPath !== undefined) {
                clearFilter.targetPath = targetPath;
            }
        }
        const clearResult = this.store.clear(clearFilter);
        this.disposeCommentEntries(clearResult.removedCommentEntries);

        this.renderer.apply(this.store);
        this.codeLensChangeEmitter.fire();

        return {
            clearedIds: clearResult.clearedIds,
            clearedPaths: clearResult.clearedPaths,
            clearedUris: clearResult.clearedUris
        };
    }

    private getCommentController(): vscode.CommentController {
        if (!this.commentController) {
            this.commentController = vscode.comments.createCommentController('vscode-mcp-server.guided-explanation', 'Guided Explanation');
            this.commentController.options = {
                prompt: 'Guided explanation comments are temporary teaching notes.',
                placeHolder: 'Guided explanation'
            };
        }

        return this.commentController;
    }

    private createExplanationCommentThread(uri: vscode.Uri, range: vscode.Range, title: string, body: string, kind: AnnotationKind): vscode.CommentThread {
        const markdown = createUntrustedMarkdown(`**Guided Explanation: ${escapeMarkdownText(title)}**\n\n${sanitizeGuidedMarkdown(body)}`);
        const comment: vscode.Comment = {
            body: markdown,
            mode: vscode.CommentMode.Preview,
            author: { name: 'Guided Explanation' },
            label: kind
        };
        const thread = this.getCommentController().createCommentThread(uri, range, [comment]);
        thread.label = `Guided Explanation: ${title}`;
        thread.canReply = false;
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
        thread.contextValue = 'guidedExplanation';

        return thread;
    }

    private disposeCommentEntries(entries: ExplanationCommentEntry[]): void {
        for (const entry of entries) {
            entry.thread.dispose();
        }
    }

    private provideCodeLensNotes(uri: vscode.Uri): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];
        const uriKey = uri.toString();

        for (const group of this.store.groups()) {
            for (const entry of group.codeLensNotes) {
                if (entry.uri.toString() === uriKey) {
                    codeLenses.push(new vscode.CodeLens(entry.range, {
                        title: entry.title,
                        command: CODELENS_NOTE_NOOP_COMMAND,
                        tooltip: `Guided explanation ${entry.kind} note`
                    }));
                }
            }
        }

        return codeLenses;
    }

    public dispose(): void {
        for (const group of this.store.groups()) {
            this.disposeCommentEntries(group.explanationComments);
        }
        if (this.commentController) {
            this.commentController.dispose();
            this.commentController = undefined;
        }
        this.renderer.dispose();
        this.codeLensProviderDisposable.dispose();
        this.codeLensCommandDisposable.dispose();
        this.codeLensChangeEmitter.dispose();
        this.store.clearAll();
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
