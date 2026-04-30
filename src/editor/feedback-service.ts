import * as vscode from 'vscode';
import { DiffEntryMatch, getEditorDiffService } from './diff-service';
import { SerializedRange, isUriInsideWorkspace, uriToWorkspacePath, vsCodeRangeToSerializedRange } from './location-utils';

const DEFAULT_MAX_SELECTED_TEXT_CHARACTERS = 4000;

export type FeedbackSessionStatus = 'draft' | 'ready' | 'drained' | 'cancelled';

export interface FeedbackDiffMetadata {
    diffId: string;
    entryIndex: number;
    label?: string;
    side: 'left' | 'right';
}

export interface FeedbackItem {
    id: string;
    order: number;
    createdAt: string;
    uri: string;
    path?: string;
    range: SerializedRange;
    selectedText: string;
    selectedTextTruncated: boolean;
    feedback: string;
    languageId: string;
    lineCount: number;
    isDirty: boolean;
    diff?: FeedbackDiffMetadata;
}

export interface FeedbackSessionSnapshot {
    id: string;
    status: FeedbackSessionStatus;
    count: number;
    items: FeedbackItem[];
}

export interface AddFeedbackInput {
    feedbackText: string;
    editor?: vscode.TextEditor;
    maxSelectedTextCharacters?: number;
}

export type FeedbackClearScope = FeedbackSessionStatus | 'all';

export interface ClearFeedbackInput {
    scope?: FeedbackClearScope;
}

export interface ClearFeedbackResult {
    cleared: boolean;
    scope: FeedbackClearScope;
    session?: FeedbackSessionSnapshot;
}

export interface FeedbackCaptureServiceOptions {
    createSessionId?: () => string;
    createItemId?: () => string;
    now?: () => Date;
}

interface StoredFeedbackItem {
    item: FeedbackItem;
    uri: vscode.Uri;
    range: vscode.Range;
}

interface FeedbackSessionState {
    id: string;
    status: FeedbackSessionStatus;
    items: StoredFeedbackItem[];
}

function defaultId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function truncateText(text: string, maxCharacters: number): { text: string; truncated: boolean } {
    if (text.length <= maxCharacters) {
        return { text, truncated: false };
    }

    return { text: text.slice(0, maxCharacters), truncated: true };
}

function serializeDiffMetadata(match: DiffEntryMatch | undefined): FeedbackDiffMetadata | undefined {
    if (!match) {
        return undefined;
    }

    return {
        diffId: match.diffId,
        entryIndex: match.entryIndex,
        label: match.label,
        side: match.side
    };
}

function workspacePathIfAvailable(uri: vscode.Uri): string | undefined {
    return isUriInsideWorkspace(uri) ? uriToWorkspacePath(uri) : undefined;
}

function isSafeFeedbackDocument(uri: vscode.Uri): boolean {
    if (getEditorDiffService().findEntryForUri(uri)) {
        return true;
    }
    if (uri.scheme === 'file') {
        return isUriInsideWorkspace(uri);
    }
    return uri.scheme === 'git' && isUriInsideWorkspace(uri);
}

function createFeedbackMarkerDecorationOptions(): vscode.DecorationRenderOptions {
    return {
        backgroundColor: 'rgba(168, 85, 247, 0.10)',
        border: '1px dotted rgba(168, 85, 247, 0.65)',
        overviewRulerColor: new vscode.ThemeColor('symbolIcon.eventForeground'),
        overviewRulerLane: vscode.OverviewRulerLane.Right
    };
}

function escapeMarkdownText(text: string): string {
    return text.replace(/[\\`*_{}\[\]()#+\-.!|>]/g, character => `\\${character}`);
}

function createMarkerHover(item: FeedbackItem): vscode.MarkdownString {
    const hover = new vscode.MarkdownString(`**Guided Feedback ${item.order}**\n\n${escapeMarkdownText(item.feedback)}`);
    hover.isTrusted = false;
    hover.supportHtml = false;
    return hover;
}

export class FeedbackCaptureService {
    private session: FeedbackSessionState | undefined;
    private readonly markerDecorationType: vscode.TextEditorDecorationType;
    private readonly visibleEditorChangeDisposable: vscode.Disposable;
    private readonly createSessionId: () => string;
    private readonly createItemId: () => string;
    private readonly now: () => Date;

    constructor(options: FeedbackCaptureServiceOptions = {}) {
        this.createSessionId = options.createSessionId ?? (() => defaultId('feedback-session'));
        this.createItemId = options.createItemId ?? (() => defaultId('feedback-item'));
        this.now = options.now ?? (() => new Date());
        this.markerDecorationType = vscode.window.createTextEditorDecorationType(createFeedbackMarkerDecorationOptions());
        this.visibleEditorChangeDisposable = vscode.window.onDidChangeVisibleTextEditors(() => this.reapplyMarkers());
    }

    public getFeedback(): FeedbackSessionSnapshot | undefined {
        return this.session ? this.snapshot(this.session) : undefined;
    }

    public async addFeedback(input: AddFeedbackInput): Promise<FeedbackSessionSnapshot> {
        const editor = input.editor ?? vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor is available. Select code in an editor before adding feedback.');
        }
        if (editor.selection.isEmpty) {
            throw new Error('Select a non-empty range before adding feedback.');
        }
        if (!isSafeFeedbackDocument(editor.document.uri)) {
            throw new Error(`Feedback capture is not available for this document URI: ${editor.document.uri.toString()}`);
        }

        const session = this.getOrCreateDraftSession();
        const maxSelectedTextCharacters = input.maxSelectedTextCharacters ?? DEFAULT_MAX_SELECTED_TEXT_CHARACTERS;
        const selectedText = truncateText(editor.document.getText(editor.selection), maxSelectedTextCharacters);
        const item: FeedbackItem = {
            id: this.createItemId(),
            order: session.items.length + 1,
            createdAt: this.now().toISOString(),
            uri: editor.document.uri.toString(),
            path: workspacePathIfAvailable(editor.document.uri),
            range: vsCodeRangeToSerializedRange(editor.selection),
            selectedText: selectedText.text,
            selectedTextTruncated: selectedText.truncated,
            feedback: input.feedbackText,
            languageId: editor.document.languageId,
            lineCount: editor.document.lineCount,
            isDirty: editor.document.isDirty,
            diff: serializeDiffMetadata(getEditorDiffService().findEntryForUri(editor.document.uri))
        };

        session.items.push({ item, uri: editor.document.uri, range: editor.selection });
        this.reapplyMarkers();

        return this.snapshot(session);
    }

    public async finishFeedback(): Promise<FeedbackSessionSnapshot> {
        if (!this.session || this.session.items.length === 0) {
            throw new Error('No feedback has been captured yet.');
        }
        if (this.session.status === 'draft') {
            this.session.status = 'ready';
        } else if (this.session.status !== 'ready') {
            throw new Error(`Cannot finish a feedback session that is ${this.session.status}.`);
        }
        this.reapplyMarkers();

        return this.snapshot(this.session);
    }

    public async cancelFeedback(): Promise<FeedbackSessionSnapshot> {
        if (!this.session) {
            throw new Error('No feedback session is active.');
        }
        this.session.status = 'cancelled';
        this.session.items = [];
        this.clearMarkers();

        return this.snapshot(this.session);
    }

    public async drainFeedback(): Promise<FeedbackSessionSnapshot> {
        if (!this.session || this.session.status !== 'ready') {
            throw new Error('No ready feedback session is available to drain.');
        }

        const readySession = this.snapshot(this.session);
        this.session.status = 'drained';
        this.clearMarkers();

        return readySession;
    }

    public async clearFeedback(input: ClearFeedbackInput = {}): Promise<ClearFeedbackResult> {
        const scope = input.scope ?? 'all';
        if (!this.session) {
            return { cleared: false, scope };
        }

        if (scope !== 'all' && this.session.status !== scope) {
            return { cleared: false, scope, session: this.snapshot(this.session) };
        }

        this.session.status = 'cancelled';
        this.session.items = [];
        this.clearMarkers();

        return { cleared: true, scope, session: this.snapshot(this.session) };
    }

    public dispose(): void {
        this.clearMarkers();
        this.session = undefined;
        this.visibleEditorChangeDisposable.dispose();
        this.markerDecorationType.dispose();
    }

    private getOrCreateDraftSession(): FeedbackSessionState {
        if (!this.session || this.session.status === 'cancelled' || this.session.status === 'drained') {
            this.session = {
                id: this.createSessionId(),
                status: 'draft',
                items: []
            };
        }
        if (this.session.status !== 'draft') {
            throw new Error(`Cannot add feedback while the current feedback session is ${this.session.status}. Finish processing or clear it first.`);
        }

        return this.session;
    }

    private snapshot(session: FeedbackSessionState): FeedbackSessionSnapshot {
        return {
            id: session.id,
            status: session.status,
            count: session.items.length,
            items: session.items.map(entry => ({ ...entry.item }))
        };
    }

    private markerOptionsForVisibleEditors(): Map<string, vscode.DecorationOptions[]> {
        const byUri = new Map<string, vscode.DecorationOptions[]>();
        if (!this.session || (this.session.status !== 'draft' && this.session.status !== 'ready')) {
            return byUri;
        }

        for (const entry of this.session.items) {
            const options = byUri.get(entry.uri.toString()) ?? [];
            options.push({
                range: entry.range,
                hoverMessage: createMarkerHover(entry.item)
            });
            byUri.set(entry.uri.toString(), options);
        }

        return byUri;
    }

    private reapplyMarkers(): void {
        const byUri = this.markerOptionsForVisibleEditors();
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this.markerDecorationType, byUri.get(editor.document.uri.toString()) ?? []);
        }
    }

    private clearMarkers(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this.markerDecorationType, []);
        }
    }
}

let defaultFeedbackService: FeedbackCaptureService | undefined;

export function getFeedbackCaptureService(): FeedbackCaptureService {
    if (!defaultFeedbackService) {
        defaultFeedbackService = new FeedbackCaptureService();
    }

    return defaultFeedbackService;
}

export function disposeFeedbackCaptureService(): void {
    if (defaultFeedbackService) {
        defaultFeedbackService.dispose();
        defaultFeedbackService = undefined;
    }
}
