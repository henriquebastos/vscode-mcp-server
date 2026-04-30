import * as vscode from 'vscode';
import type { AnnotationKind, AnnotationStore, CalloutEntry, GutterMarkerEntry, HighlightEntry, HoverNoteEntry } from './annotation-store';
import { createUntrustedMarkdown, escapeMarkdownText, sanitizeGuidedMarkdown } from './markdown-utils';

interface EntriesForUri<TEntry> {
    uri: vscode.Uri;
    entries: TEntry[];
}

type KindedUriEntry = { uri: vscode.Uri; kind: AnnotationKind };

function groupEntriesByKindAndUri<TEntry extends KindedUriEntry>(
    entries: Iterable<TEntry>,
): Map<AnnotationKind, Map<string, EntriesForUri<TEntry>>> {
    const byKindAndUri = new Map<AnnotationKind, Map<string, EntriesForUri<TEntry>>>();
    for (const entry of entries) {
        const byUri = byKindAndUri.get(entry.kind) ?? new Map<string, EntriesForUri<TEntry>>();
        const key = entry.uri.toString();
        const combined = byUri.get(key) ?? { uri: entry.uri, entries: [] };
        combined.entries.push(entry);
        byUri.set(key, combined);
        byKindAndUri.set(entry.kind, byUri);
    }
    return byKindAndUri;
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
    const options: vscode.DecorationRenderOptions = {
        backgroundColor: kindBackgroundColor(kind),
        overviewRulerColor: kindOverviewColor(kind),
        overviewRulerLane: vscode.OverviewRulerLane.Right
    };
    if (kind === 'previous') {
        options.opacity = '0.65';
    }
    return options;
}

function createCalloutDecorationOptions(kind: AnnotationKind): vscode.DecorationRenderOptions {
    const after: vscode.ThemableDecorationAttachmentRenderOptions = {
        margin: '0 0 0 1rem',
        color: kindThemeColor(kind)
    };
    if (kind === 'focus' || kind === 'question' || kind === 'warning') {
        after.fontWeight = '600';
    }
    if (kind === 'previous') {
        after.fontStyle = 'italic';
    }
    return { after };
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

function createInlineCalloutOption(editor: vscode.TextEditor, entry: CalloutEntry): vscode.DecorationOptions {
    const lineEnd = editor.document.lineAt(entry.range.start.line).range.end;

    return {
        range: new vscode.Range(lineEnd, lineEnd),
        renderOptions: {
            after: {
                contentText: `  ${entry.title}: ${entry.message}`
            }
        }
    };
}

function createGutterMarkerOption(entry: GutterMarkerEntry): vscode.DecorationOptions {
    const option: vscode.DecorationOptions = { range: entry.range };
    if (entry.label) {
        option.hoverMessage = createUntrustedMarkdown(escapeMarkdownText(entry.label));
    }

    return option;
}

function createHoverNoteOption(entry: HoverNoteEntry): vscode.DecorationOptions {
    const hoverBody = entry.title
        ? `**${escapeMarkdownText(entry.title)}**\n\n${sanitizeGuidedMarkdown(entry.message)}`
        : sanitizeGuidedMarkdown(entry.message);

    return {
        range: entry.range,
        hoverMessage: createUntrustedMarkdown(hoverBody)
    };
}

type RenderedAnnotationSurface = 'highlights' | 'callouts' | 'gutterMarkers' | 'hoverNotes';

const ALL_RENDERED_SURFACES: RenderedAnnotationSurface[] = ['highlights', 'callouts', 'gutterMarkers', 'hoverNotes'];

export class VsCodeAnnotationRenderer {
    private readonly highlightDecorationTypes = new Map<AnnotationKind, vscode.TextEditorDecorationType>();
    private readonly calloutDecorationTypes = new Map<AnnotationKind, vscode.TextEditorDecorationType>();
    private readonly gutterMarkerDecorationTypes = new Map<AnnotationKind, vscode.TextEditorDecorationType>();
    private readonly hoverNoteDecorationTypes = new Map<AnnotationKind, vscode.TextEditorDecorationType>();
    private readonly visibleEditorChangeDisposable: vscode.Disposable;
    private currentStore: AnnotationStore | undefined;

    constructor(defaultKind: AnnotationKind) {
        this.getHighlightDecorationType(defaultKind);
        this.getCalloutDecorationType(defaultKind);
        this.visibleEditorChangeDisposable = vscode.window.onDidChangeVisibleTextEditors(() => this.reapply());
    }

    public apply(store: AnnotationStore, surfaces: RenderedAnnotationSurface[] = ALL_RENDERED_SURFACES): void {
        this.currentStore = store;
        if (surfaces.includes('highlights')) {
            this.applyHighlights(store);
        }
        if (surfaces.includes('callouts')) {
            this.applyCallouts(store);
        }
        if (surfaces.includes('gutterMarkers')) {
            this.applyGutterMarkers(store);
        }
        if (surfaces.includes('hoverNotes')) {
            this.applyHoverNotes(store);
        }
    }

    public dispose(): void {
        this.visibleEditorChangeDisposable.dispose();
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
    }

    private reapply(): void {
        if (this.currentStore) {
            this.apply(this.currentStore);
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

    private applySurface<TEntry extends KindedUriEntry>(
        entries: Iterable<TEntry>,
        decorationCache: Map<AnnotationKind, vscode.TextEditorDecorationType>,
        ensureDecorationType: (kind: AnnotationKind) => vscode.TextEditorDecorationType,
        toDecorations: (editor: vscode.TextEditor, entries: TEntry[]) => readonly (vscode.Range | vscode.DecorationOptions)[],
    ): void {
        const byKindAndUri = groupEntriesByKindAndUri(entries);
        for (const kind of byKindAndUri.keys()) {
            ensureDecorationType(kind);
        }
        for (const [kind, decorationType] of decorationCache) {
            const byUri = byKindAndUri.get(kind);
            for (const editor of vscode.window.visibleTextEditors) {
                const found = byUri?.get(editor.document.uri.toString());
                const options = found ? toDecorations(editor, found.entries) : [];
                editor.setDecorations(decorationType, options as vscode.Range[]);
            }
        }
    }

    private *flattenSurface<TEntry>(store: AnnotationStore, pick: (group: { highlights: HighlightEntry[]; callouts: CalloutEntry[]; gutterMarkers: GutterMarkerEntry[]; hoverNotes: HoverNoteEntry[] }) => TEntry[]): Iterable<TEntry> {
        for (const group of store.groups()) {
            yield* pick(group);
        }
    }

    private applyHighlights(store: AnnotationStore): void {
        this.applySurface<HighlightEntry>(
            this.flattenSurface(store, g => g.highlights),
            this.highlightDecorationTypes,
            kind => this.getHighlightDecorationType(kind),
            (_editor, entries) => entries.map(entry => entry.range),
        );
    }

    private applyCallouts(store: AnnotationStore): void {
        this.applySurface<CalloutEntry>(
            this.flattenSurface(store, g => g.callouts),
            this.calloutDecorationTypes,
            kind => this.getCalloutDecorationType(kind),
            (editor, entries) => entries.map(entry => createInlineCalloutOption(editor, entry)),
        );
    }

    private applyGutterMarkers(store: AnnotationStore): void {
        this.applySurface<GutterMarkerEntry>(
            this.flattenSurface(store, g => g.gutterMarkers),
            this.gutterMarkerDecorationTypes,
            kind => this.getGutterMarkerDecorationType(kind),
            (_editor, entries) => entries.map(createGutterMarkerOption),
        );
    }

    private applyHoverNotes(store: AnnotationStore): void {
        this.applySurface<HoverNoteEntry>(
            this.flattenSurface(store, g => g.hoverNotes),
            this.hoverNoteDecorationTypes,
            kind => this.getHoverNoteDecorationType(kind),
            (_editor, entries) => entries.map(createHoverNoteOption),
        );
    }
}
