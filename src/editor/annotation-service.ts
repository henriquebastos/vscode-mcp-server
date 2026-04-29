import * as vscode from 'vscode';
import { McpRange, mcpRangeToVsCodeRange, resolveEditorTarget, uriToWorkspacePath } from './location-utils';

export type AnnotationMode = 'replace' | 'add';
export type AnnotationKind = 'focus' | 'related' | 'previous' | 'question' | 'warning' | 'info';

export interface AnnotationRangeInput extends McpRange {
    path?: string;
}

export interface SetHighlightsInput {
    id?: string;
    path?: string;
    ranges: AnnotationRangeInput[];
    mode?: AnnotationMode;
    kind?: AnnotationKind;
}

export interface SetInlineCalloutInput {
    id?: string;
    path?: string;
    range: AnnotationRangeInput;
    title: string;
    message: string;
    mode?: AnnotationMode;
    kind?: AnnotationKind;
}

export interface SetGutterMarkersInput {
    id?: string;
    path?: string;
    ranges?: AnnotationRangeInput[];
    lines?: number[];
    mode?: AnnotationMode;
    kind?: AnnotationKind;
    label?: string;
}

export interface SetExplanationCommentInput {
    id?: string;
    path?: string;
    range: AnnotationRangeInput;
    title: string;
    body: string;
    mode?: AnnotationMode;
    kind?: AnnotationKind;
}

export interface SetHoverNoteInput {
    id?: string;
    path?: string;
    range: AnnotationRangeInput;
    title?: string;
    message: string;
    mode?: AnnotationMode;
    kind?: AnnotationKind;
}

export interface SetCodeLensNoteInput {
    id?: string;
    path?: string;
    range: AnnotationRangeInput;
    title: string;
    mode?: AnnotationMode;
    kind?: AnnotationKind;
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

interface HighlightEntry {
    uri: vscode.Uri;
    range: vscode.Range;
    kind: AnnotationKind;
}

interface CalloutEntry {
    uri: vscode.Uri;
    option: vscode.DecorationOptions;
    kind: AnnotationKind;
}

interface GutterMarkerEntry {
    uri: vscode.Uri;
    option: vscode.DecorationOptions;
    kind: AnnotationKind;
}

interface HoverNoteEntry {
    uri: vscode.Uri;
    option: vscode.DecorationOptions;
    kind: AnnotationKind;
}

interface CodeLensNoteEntry {
    uri: vscode.Uri;
    range: vscode.Range;
    title: string;
    kind: AnnotationKind;
}

interface ExplanationCommentEntry {
    uri: vscode.Uri;
    thread: vscode.CommentThread;
    kind: AnnotationKind;
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
    highlights: HighlightEntry[];
    callouts: CalloutEntry[];
    gutterMarkers: GutterMarkerEntry[];
    hoverNotes: HoverNoteEntry[];
    codeLensNotes: CodeLensNoteEntry[];
    explanationComments: ExplanationCommentEntry[];
}

const DEFAULT_ANNOTATION_ID = 'current';
const DEFAULT_ANNOTATION_KIND: AnnotationKind = 'focus';
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

function getOrCreateGroup(groups: Map<string, AnnotationGroup>, id: string): AnnotationGroup {
    let group = groups.get(id);
    if (!group) {
        group = { highlights: [], callouts: [], gutterMarkers: [], hoverNotes: [], codeLensNotes: [], explanationComments: [] };
        groups.set(id, group);
    }

    return group;
}

function getVisibleEditor(uri: vscode.Uri): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === uri.toString());
}

function hasEntries(group: AnnotationGroup): boolean {
    return group.highlights.length > 0 || group.callouts.length > 0 || group.gutterMarkers.length > 0 || group.hoverNotes.length > 0 || group.codeLensNotes.length > 0 || group.explanationComments.length > 0;
}

function addEntryPaths(paths: Set<string>, group: AnnotationGroup): void {
    for (const entry of group.highlights) {
        paths.add(uriToWorkspacePath(entry.uri));
    }
    for (const entry of group.callouts) {
        paths.add(uriToWorkspacePath(entry.uri));
    }
    for (const entry of group.gutterMarkers) {
        paths.add(uriToWorkspacePath(entry.uri));
    }
    for (const entry of group.hoverNotes) {
        paths.add(uriToWorkspacePath(entry.uri));
    }
    for (const entry of group.codeLensNotes) {
        paths.add(uriToWorkspacePath(entry.uri));
    }
    for (const entry of group.explanationComments) {
        paths.add(uriToWorkspacePath(entry.uri));
    }
}

function operationResult(id: string, entries: Array<HighlightEntry | CalloutEntry | GutterMarkerEntry | HoverNoteEntry | CodeLensNoteEntry | ExplanationCommentEntry>): AnnotationOperationResult {
    const paths = new Set(entries.map(entry => uriToWorkspacePath(entry.uri)));
    return { id, paths: Array.from(paths), rangeCount: entries.length };
}

function kindThemeColor(kind: AnnotationKind): vscode.ThemeColor {
    switch (kind) {
        case 'related':
            return new vscode.ThemeColor('editorInfo.foreground');
        case 'previous':
            return new vscode.ThemeColor('editorLineNumber.foreground');
        case 'question':
            return new vscode.ThemeColor('symbolIcon.eventForeground');
        case 'warning':
            return new vscode.ThemeColor('editorWarning.foreground');
        case 'info':
            return new vscode.ThemeColor('editorInfo.foreground');
        case 'focus':
        default:
            return new vscode.ThemeColor('editor.findMatchBorder');
    }
}

function kindBackgroundColor(kind: AnnotationKind): string | vscode.ThemeColor {
    switch (kind) {
        case 'related':
            return 'rgba(96, 165, 250, 0.10)';
        case 'previous':
            return 'rgba(156, 163, 175, 0.10)';
        case 'question':
            return 'rgba(168, 85, 247, 0.10)';
        case 'warning':
            return 'rgba(245, 158, 11, 0.14)';
        case 'info':
            return 'rgba(56, 189, 248, 0.08)';
        case 'focus':
        default:
            return new vscode.ThemeColor('editor.findMatchHighlightBackground');
    }
}

function kindOverviewColor(kind: AnnotationKind): vscode.ThemeColor {
    switch (kind) {
        case 'warning':
            return new vscode.ThemeColor('editorOverviewRuler.warningForeground');
        case 'info':
            return new vscode.ThemeColor('editorOverviewRuler.infoForeground');
        case 'previous':
            return new vscode.ThemeColor('editorOverviewRuler.rangeHighlightForeground');
        case 'related':
        case 'question':
            return new vscode.ThemeColor('editorOverviewRuler.wordHighlightForeground');
        case 'focus':
        default:
            return new vscode.ThemeColor('editorOverviewRuler.findMatchForeground');
    }
}

function createHighlightDecorationOptions(kind: AnnotationKind): vscode.DecorationRenderOptions {
    return {
        backgroundColor: kindBackgroundColor(kind),
        opacity: kind === 'previous' ? '0.65' : undefined,
        overviewRulerColor: kindOverviewColor(kind),
        overviewRulerLane: vscode.OverviewRulerLane.Right
    };
}

function createCalloutDecorationOptions(kind: AnnotationKind): vscode.DecorationRenderOptions {
    return {
        after: {
            margin: '0 0 0 1rem',
            color: kindThemeColor(kind),
            fontWeight: kind === 'focus' || kind === 'question' || kind === 'warning' ? '600' : undefined,
            fontStyle: kind === 'previous' ? 'italic' : undefined
        }
    };
}

function markerIconColor(kind: AnnotationKind): string {
    switch (kind) {
        case 'warning':
            return '#f59e0b';
        case 'question':
            return '#a855f7';
        case 'related':
            return '#60a5fa';
        case 'previous':
            return '#9ca3af';
        case 'info':
            return '#38bdf8';
        case 'focus':
        default:
            return '#facc15';
    }
}

function createGutterIconUri(kind: AnnotationKind): vscode.Uri {
    const color = markerIconColor(kind);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4" fill="${color}"/></svg>`;
    return vscode.Uri.parse(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
}

function createGutterMarkerDecorationOptions(kind: AnnotationKind): vscode.DecorationRenderOptions {
    return {
        gutterIconPath: createGutterIconUri(kind),
        gutterIconSize: 'contain',
        overviewRulerColor: kindOverviewColor(kind),
        overviewRulerLane: vscode.OverviewRulerLane.Right
    };
}

function createHoverNoteDecorationOptions(kind: AnnotationKind): vscode.DecorationRenderOptions {
    return {
        textDecoration: `underline wavy ${markerIconColor(kind)}`
    };
}

function escapeMarkdownText(text: string): string {
    return text.replace(/[\\`*_{}\[\]()#+\-.!|>]/g, character => `\\${character}`);
}

function sanitizeGuidedMarkdown(markdown: string): string {
    return markdown
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, (_match, altText: string) => altText ? `[image omitted: ${escapeMarkdownText(altText)}]` : '[image omitted]')
        .replace(/\[([^\]]+)\]\(\s*(?:file|data|command|vscode|javascript):[^)]*\)/gi, (_match, linkText: string) => escapeMarkdownText(linkText));
}

function createUntrustedMarkdown(value: string): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString(value);
    markdown.isTrusted = false;
    markdown.supportHtml = false;
    return markdown;
}

export class EditorAnnotationService {
    private groups = new Map<string, AnnotationGroup>();
    private readonly highlightDecorationTypes = new Map<AnnotationKind, vscode.TextEditorDecorationType>();
    private readonly calloutDecorationTypes = new Map<AnnotationKind, vscode.TextEditorDecorationType>();
    private readonly gutterMarkerDecorationTypes = new Map<AnnotationKind, vscode.TextEditorDecorationType>();
    private readonly hoverNoteDecorationTypes = new Map<AnnotationKind, vscode.TextEditorDecorationType>();
    private readonly visibleEditorChangeDisposable: vscode.Disposable;
    private readonly codeLensChangeEmitter = new vscode.EventEmitter<void>();
    private readonly codeLensProviderDisposable: vscode.Disposable;
    private readonly codeLensCommandDisposable: vscode.Disposable;
    private commentController: vscode.CommentController | undefined;

    constructor() {
        this.getHighlightDecorationType(DEFAULT_ANNOTATION_KIND);
        this.getCalloutDecorationType(DEFAULT_ANNOTATION_KIND);
        this.visibleEditorChangeDisposable = vscode.window.onDidChangeVisibleTextEditors(() => this.reapplyDecorations());
        this.codeLensCommandDisposable = acquireCodeLensNoteNoopCommand();
        this.codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(
            { scheme: 'file' },
            {
                onDidChangeCodeLenses: this.codeLensChangeEmitter.event,
                provideCodeLenses: document => this.provideCodeLensNotes(document.uri)
            }
        );
    }

    public async setHighlights(input: SetHighlightsInput): Promise<AnnotationOperationResult> {
        const id = input.id ?? DEFAULT_ANNOTATION_ID;
        const mode = input.mode ?? 'replace';
        const kind = input.kind ?? DEFAULT_ANNOTATION_KIND;
        const existingGroup = this.groups.get(id);
        const nextHighlights = mode === 'add' && existingGroup ? [...existingGroup.highlights] : [];
        const newEntries: HighlightEntry[] = [];

        for (const inputRange of input.ranges) {
            const target = await resolveEditorTarget({ path: inputRange.path ?? input.path });
            newEntries.push({ uri: target.uri, range: mcpRangeToVsCodeRange(inputRange), kind });
        }

        const group = getOrCreateGroup(this.groups, id);
        group.highlights = [...nextHighlights, ...newEntries];
        this.getHighlightDecorationType(kind);
        this.applyHighlights();

        return operationResult(id, group.highlights);
    }

    public async setInlineCallout(input: SetInlineCalloutInput): Promise<AnnotationOperationResult> {
        const id = input.id ?? DEFAULT_ANNOTATION_ID;
        const mode = input.mode ?? 'replace';
        const kind = input.kind ?? DEFAULT_ANNOTATION_KIND;
        const existingGroup = this.groups.get(id);
        const nextCallouts = mode === 'add' && existingGroup ? [...existingGroup.callouts] : [];
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

        const group = getOrCreateGroup(this.groups, id);
        group.callouts = [...nextCallouts, { uri: target.uri, option, kind }];
        this.getCalloutDecorationType(kind);
        this.applyCallouts();

        return operationResult(id, group.callouts);
    }

    public async setGutterMarkers(input: SetGutterMarkersInput): Promise<AnnotationOperationResult> {
        const id = input.id ?? DEFAULT_ANNOTATION_ID;
        const mode = input.mode ?? 'replace';
        const kind = input.kind ?? DEFAULT_ANNOTATION_KIND;
        const existingGroup = this.groups.get(id);
        const nextMarkers = mode === 'add' && existingGroup ? [...existingGroup.gutterMarkers] : [];
        const newEntries: GutterMarkerEntry[] = [];

        for (const line of input.lines ?? []) {
            const target = await resolveEditorTarget({ path: input.path });
            const range = mcpRangeToVsCodeRange({ start: { line, character: 0 }, end: { line, character: 0 } });
            newEntries.push({ uri: target.uri, option: this.createGutterMarkerOption(range, input.label), kind });
        }

        for (const inputRange of input.ranges ?? []) {
            const target = await resolveEditorTarget({ path: inputRange.path ?? input.path });
            const range = mcpRangeToVsCodeRange(inputRange);
            newEntries.push({ uri: target.uri, option: this.createGutterMarkerOption(range, input.label), kind });
        }

        if (newEntries.length === 0) {
            throw new Error('Provide at least one line or range for a gutter marker.');
        }

        const group = getOrCreateGroup(this.groups, id);
        group.gutterMarkers = [...nextMarkers, ...newEntries];
        this.getGutterMarkerDecorationType(kind);
        this.applyGutterMarkers();

        return operationResult(id, group.gutterMarkers);
    }

    public async setHoverNote(input: SetHoverNoteInput): Promise<AnnotationOperationResult> {
        const id = input.id ?? DEFAULT_ANNOTATION_ID;
        const mode = input.mode ?? 'replace';
        const kind = input.kind ?? 'info';
        const existingGroup = this.groups.get(id);
        const nextHoverNotes = mode === 'add' && existingGroup ? [...existingGroup.hoverNotes] : [];
        const target = await resolveEditorTarget({ path: input.range.path ?? input.path });
        const range = mcpRangeToVsCodeRange(input.range);
        const option = this.createHoverNoteOption(range, input.message, input.title);

        const group = getOrCreateGroup(this.groups, id);
        group.hoverNotes = [...nextHoverNotes, { uri: target.uri, option, kind }];
        this.getHoverNoteDecorationType(kind);
        this.applyHoverNotes();

        return operationResult(id, group.hoverNotes);
    }

    public async setCodeLensNote(input: SetCodeLensNoteInput): Promise<AnnotationOperationResult> {
        const id = input.id ?? DEFAULT_ANNOTATION_ID;
        const mode = input.mode ?? 'replace';
        const kind = input.kind ?? DEFAULT_ANNOTATION_KIND;
        const existingGroup = this.groups.get(id);
        const nextCodeLensNotes = mode === 'add' && existingGroup ? [...existingGroup.codeLensNotes] : [];
        const target = await resolveEditorTarget({ path: input.range.path ?? input.path });
        const range = mcpRangeToVsCodeRange(input.range);

        const group = getOrCreateGroup(this.groups, id);
        group.codeLensNotes = [...nextCodeLensNotes, { uri: target.uri, range, title: input.title, kind }];
        this.codeLensChangeEmitter.fire();

        return operationResult(id, group.codeLensNotes);
    }

    public async setExplanationComment(input: SetExplanationCommentInput): Promise<AnnotationOperationResult> {
        const id = input.id ?? DEFAULT_ANNOTATION_ID;
        const mode = input.mode ?? 'replace';
        const kind = input.kind ?? 'info';
        const existingGroup = this.groups.get(id);
        const nextComments = mode === 'add' && existingGroup ? [...existingGroup.explanationComments] : [];
        const target = await resolveEditorTarget({ path: input.range.path ?? input.path });
        const range = mcpRangeToVsCodeRange(input.range);
        const thread = this.createExplanationCommentThread(target.uri, range, input.title, input.body, kind);

        if (mode === 'replace' && existingGroup) {
            this.disposeCommentEntries(existingGroup.explanationComments);
        }

        const group = getOrCreateGroup(this.groups, id);
        group.explanationComments = [...nextComments, { uri: target.uri, thread, kind }];

        return operationResult(id, group.explanationComments);
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
                addEntryPaths(clearedPaths, group);
                this.disposeCommentEntries(group.explanationComments);
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
                    const beforeCount = group.highlights.length + group.callouts.length + group.gutterMarkers.length + group.hoverNotes.length + group.codeLensNotes.length + group.explanationComments.length;
                    group.highlights = group.highlights.filter(entry => entry.uri.toString() !== pathKey);
                    group.callouts = group.callouts.filter(entry => entry.uri.toString() !== pathKey);
                    group.gutterMarkers = group.gutterMarkers.filter(entry => entry.uri.toString() !== pathKey);
                    group.hoverNotes = group.hoverNotes.filter(entry => entry.uri.toString() !== pathKey);
                    group.codeLensNotes = group.codeLensNotes.filter(entry => entry.uri.toString() !== pathKey);
                    const removedComments = group.explanationComments.filter(entry => entry.uri.toString() === pathKey);
                    this.disposeCommentEntries(removedComments);
                    group.explanationComments = group.explanationComments.filter(entry => entry.uri.toString() !== pathKey);
                    const afterCount = group.highlights.length + group.callouts.length + group.gutterMarkers.length + group.hoverNotes.length + group.codeLensNotes.length + group.explanationComments.length;

                    if (beforeCount !== afterCount) {
                        if (pathLabel) {
                            clearedPaths.add(pathLabel);
                        }
                        clearedIds += 1;
                    }
                    if (!hasEntries(group)) {
                        this.groups.delete(id);
                    }
                } else if (this.groups.delete(id)) {
                    clearedIds += 1;
                    addEntryPaths(clearedPaths, group);
                    this.disposeCommentEntries(group.explanationComments);
                }
            }
        }

        this.applyHighlights();
        this.applyCallouts();
        this.applyGutterMarkers();
        this.applyHoverNotes();
        this.codeLensChangeEmitter.fire();

        return { clearedIds, clearedPaths: Array.from(clearedPaths) };
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

    private getHighlightDecorationType(kind: AnnotationKind): vscode.TextEditorDecorationType {
        let decorationType = this.highlightDecorationTypes.get(kind);
        if (!decorationType) {
            decorationType = vscode.window.createTextEditorDecorationType(createHighlightDecorationOptions(kind));
            this.highlightDecorationTypes.set(kind, decorationType);
        }

        return decorationType;
    }

    private getCalloutDecorationType(kind: AnnotationKind): vscode.TextEditorDecorationType {
        let decorationType = this.calloutDecorationTypes.get(kind);
        if (!decorationType) {
            decorationType = vscode.window.createTextEditorDecorationType(createCalloutDecorationOptions(kind));
            this.calloutDecorationTypes.set(kind, decorationType);
        }

        return decorationType;
    }

    private getGutterMarkerDecorationType(kind: AnnotationKind): vscode.TextEditorDecorationType {
        let decorationType = this.gutterMarkerDecorationTypes.get(kind);
        if (!decorationType) {
            decorationType = vscode.window.createTextEditorDecorationType(createGutterMarkerDecorationOptions(kind));
            this.gutterMarkerDecorationTypes.set(kind, decorationType);
        }

        return decorationType;
    }

    private getHoverNoteDecorationType(kind: AnnotationKind): vscode.TextEditorDecorationType {
        let decorationType = this.hoverNoteDecorationTypes.get(kind);
        if (!decorationType) {
            decorationType = vscode.window.createTextEditorDecorationType(createHoverNoteDecorationOptions(kind));
            this.hoverNoteDecorationTypes.set(kind, decorationType);
        }

        return decorationType;
    }

    private createGutterMarkerOption(range: vscode.Range, label?: string): vscode.DecorationOptions {
        const option: vscode.DecorationOptions = { range };
        if (label) {
            option.hoverMessage = createUntrustedMarkdown(escapeMarkdownText(label));
        }

        return option;
    }

    private createHoverNoteOption(range: vscode.Range, message: string, title?: string): vscode.DecorationOptions {
        const hoverBody = title
            ? `**${escapeMarkdownText(title)}**\n\n${sanitizeGuidedMarkdown(message)}`
            : sanitizeGuidedMarkdown(message);

        return {
            range,
            hoverMessage: createUntrustedMarkdown(hoverBody)
        };
    }

    private provideCodeLensNotes(uri: vscode.Uri): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];
        const uriKey = uri.toString();

        for (const group of this.groups.values()) {
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

    private applyHighlights(): void {
        const rangesByKindAndUri = new Map<AnnotationKind, Map<string, RangesForUri>>();

        for (const group of this.groups.values()) {
            for (const entry of group.highlights) {
                const rangesByUri = rangesByKindAndUri.get(entry.kind) ?? new Map<string, RangesForUri>();
                const key = entry.uri.toString();
                const combined = rangesByUri.get(key) ?? { uri: entry.uri, ranges: [] };
                combined.ranges.push(entry.range);
                rangesByUri.set(key, combined);
                rangesByKindAndUri.set(entry.kind, rangesByUri);
            }
        }

        for (const [kind, decorationType] of this.highlightDecorationTypes) {
            const rangesByUri = rangesByKindAndUri.get(kind) ?? new Map<string, RangesForUri>();
            for (const editor of vscode.window.visibleTextEditors) {
                const ranges = rangesByUri.get(editor.document.uri.toString())?.ranges ?? [];
                editor.setDecorations(decorationType, ranges);
            }
        }
    }

    private applyCallouts(): void {
        const calloutsByKindAndUri = new Map<AnnotationKind, Map<string, CalloutsForUri>>();

        for (const group of this.groups.values()) {
            for (const entry of group.callouts) {
                const calloutsByUri = calloutsByKindAndUri.get(entry.kind) ?? new Map<string, CalloutsForUri>();
                const key = entry.uri.toString();
                const combined = calloutsByUri.get(key) ?? { uri: entry.uri, options: [] };
                combined.options.push(entry.option);
                calloutsByUri.set(key, combined);
                calloutsByKindAndUri.set(entry.kind, calloutsByUri);
            }
        }

        for (const [kind, decorationType] of this.calloutDecorationTypes) {
            const calloutsByUri = calloutsByKindAndUri.get(kind) ?? new Map<string, CalloutsForUri>();
            for (const editor of vscode.window.visibleTextEditors) {
                const options = calloutsByUri.get(editor.document.uri.toString())?.options ?? [];
                editor.setDecorations(decorationType, options);
            }
        }
    }

    private reapplyDecorations(): void {
        this.applyHighlights();
        this.applyCallouts();
        this.applyGutterMarkers();
        this.applyHoverNotes();
    }

    private applyGutterMarkers(): void {
        const markersByKindAndUri = new Map<AnnotationKind, Map<string, CalloutsForUri>>();

        for (const group of this.groups.values()) {
            for (const entry of group.gutterMarkers) {
                const markersByUri = markersByKindAndUri.get(entry.kind) ?? new Map<string, CalloutsForUri>();
                const key = entry.uri.toString();
                const combined = markersByUri.get(key) ?? { uri: entry.uri, options: [] };
                combined.options.push(entry.option);
                markersByUri.set(key, combined);
                markersByKindAndUri.set(entry.kind, markersByUri);
            }
        }

        for (const [kind, decorationType] of this.gutterMarkerDecorationTypes) {
            const markersByUri = markersByKindAndUri.get(kind) ?? new Map<string, CalloutsForUri>();
            for (const editor of vscode.window.visibleTextEditors) {
                const options = markersByUri.get(editor.document.uri.toString())?.options ?? [];
                editor.setDecorations(decorationType, options);
            }
        }
    }

    private applyHoverNotes(): void {
        const notesByKindAndUri = new Map<AnnotationKind, Map<string, CalloutsForUri>>();

        for (const group of this.groups.values()) {
            for (const entry of group.hoverNotes) {
                const notesByUri = notesByKindAndUri.get(entry.kind) ?? new Map<string, CalloutsForUri>();
                const key = entry.uri.toString();
                const combined = notesByUri.get(key) ?? { uri: entry.uri, options: [] };
                combined.options.push(entry.option);
                notesByUri.set(key, combined);
                notesByKindAndUri.set(entry.kind, notesByUri);
            }
        }

        for (const [kind, decorationType] of this.hoverNoteDecorationTypes) {
            const notesByUri = notesByKindAndUri.get(kind) ?? new Map<string, CalloutsForUri>();
            for (const editor of vscode.window.visibleTextEditors) {
                const options = notesByUri.get(editor.document.uri.toString())?.options ?? [];
                editor.setDecorations(decorationType, options);
            }
        }
    }

    public dispose(): void {
        for (const group of this.groups.values()) {
            this.disposeCommentEntries(group.explanationComments);
        }
        if (this.commentController) {
            this.commentController.dispose();
            this.commentController = undefined;
        }
        this.visibleEditorChangeDisposable.dispose();
        this.codeLensProviderDisposable.dispose();
        this.codeLensCommandDisposable.dispose();
        this.codeLensChangeEmitter.dispose();
        for (const decorationType of this.highlightDecorationTypes.values()) {
            decorationType.dispose();
        }
        for (const decorationType of this.calloutDecorationTypes.values()) {
            decorationType.dispose();
        }
        for (const decorationType of this.gutterMarkerDecorationTypes.values()) {
            decorationType.dispose();
        }
        for (const decorationType of this.hoverNoteDecorationTypes.values()) {
            decorationType.dispose();
        }
        this.highlightDecorationTypes.clear();
        this.calloutDecorationTypes.clear();
        this.gutterMarkerDecorationTypes.clear();
        this.hoverNoteDecorationTypes.clear();
        this.groups.clear();
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
