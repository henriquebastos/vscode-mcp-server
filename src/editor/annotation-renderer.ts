import * as vscode from 'vscode';
import type { AnnotationKind, AnnotationStore, CalloutEntry, GutterMarkerEntry, HoverNoteEntry } from './annotation-store';

interface RangesForUri {
    uri: vscode.Uri;
    ranges: vscode.Range[];
}

interface EntriesForUri<TEntry> {
    uri: vscode.Uri;
    entries: TEntry[];
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

    private applyHighlights(store: AnnotationStore): void {
        const rangesByKindAndUri = new Map<AnnotationKind, Map<string, RangesForUri>>();

        for (const group of store.groups()) {
            for (const entry of group.highlights) {
                const rangesByUri = rangesByKindAndUri.get(entry.kind) ?? new Map<string, RangesForUri>();
                const key = entry.uri.toString();
                const combined = rangesByUri.get(key) ?? { uri: entry.uri, ranges: [] };
                combined.ranges.push(entry.range);
                rangesByUri.set(key, combined);
                rangesByKindAndUri.set(entry.kind, rangesByUri);
            }
        }

        for (const kind of rangesByKindAndUri.keys()) {
            this.getHighlightDecorationType(kind);
        }
        for (const [kind, decorationType] of this.highlightDecorationTypes) {
            const rangesByUri = rangesByKindAndUri.get(kind) ?? new Map<string, RangesForUri>();
            for (const editor of vscode.window.visibleTextEditors) {
                const ranges = rangesByUri.get(editor.document.uri.toString())?.ranges ?? [];
                editor.setDecorations(decorationType, ranges);
            }
        }
    }

    private applyCallouts(store: AnnotationStore): void {
        const calloutsByKindAndUri = new Map<AnnotationKind, Map<string, EntriesForUri<CalloutEntry>>>();

        for (const group of store.groups()) {
            for (const entry of group.callouts) {
                const calloutsByUri = calloutsByKindAndUri.get(entry.kind) ?? new Map<string, EntriesForUri<CalloutEntry>>();
                const key = entry.uri.toString();
                const combined = calloutsByUri.get(key) ?? { uri: entry.uri, entries: [] };
                combined.entries.push(entry);
                calloutsByUri.set(key, combined);
                calloutsByKindAndUri.set(entry.kind, calloutsByUri);
            }
        }

        for (const kind of calloutsByKindAndUri.keys()) {
            this.getCalloutDecorationType(kind);
        }
        for (const [kind, decorationType] of this.calloutDecorationTypes) {
            const calloutsByUri = calloutsByKindAndUri.get(kind) ?? new Map<string, EntriesForUri<CalloutEntry>>();
            for (const editor of vscode.window.visibleTextEditors) {
                const options = calloutsByUri.get(editor.document.uri.toString())?.entries.map(entry => createInlineCalloutOption(editor, entry)) ?? [];
                editor.setDecorations(decorationType, options);
            }
        }
    }

    private applyGutterMarkers(store: AnnotationStore): void {
        const markersByKindAndUri = new Map<AnnotationKind, Map<string, EntriesForUri<GutterMarkerEntry>>>();

        for (const group of store.groups()) {
            for (const entry of group.gutterMarkers) {
                const markersByUri = markersByKindAndUri.get(entry.kind) ?? new Map<string, EntriesForUri<GutterMarkerEntry>>();
                const key = entry.uri.toString();
                const combined = markersByUri.get(key) ?? { uri: entry.uri, entries: [] };
                combined.entries.push(entry);
                markersByUri.set(key, combined);
                markersByKindAndUri.set(entry.kind, markersByUri);
            }
        }

        for (const kind of markersByKindAndUri.keys()) {
            this.getGutterMarkerDecorationType(kind);
        }
        for (const [kind, decorationType] of this.gutterMarkerDecorationTypes) {
            const markersByUri = markersByKindAndUri.get(kind) ?? new Map<string, EntriesForUri<GutterMarkerEntry>>();
            for (const editor of vscode.window.visibleTextEditors) {
                const options = markersByUri.get(editor.document.uri.toString())?.entries.map(createGutterMarkerOption) ?? [];
                editor.setDecorations(decorationType, options);
            }
        }
    }

    private applyHoverNotes(store: AnnotationStore): void {
        const notesByKindAndUri = new Map<AnnotationKind, Map<string, EntriesForUri<HoverNoteEntry>>>();

        for (const group of store.groups()) {
            for (const entry of group.hoverNotes) {
                const notesByUri = notesByKindAndUri.get(entry.kind) ?? new Map<string, EntriesForUri<HoverNoteEntry>>();
                const key = entry.uri.toString();
                const combined = notesByUri.get(key) ?? { uri: entry.uri, entries: [] };
                combined.entries.push(entry);
                notesByUri.set(key, combined);
                notesByKindAndUri.set(entry.kind, notesByUri);
            }
        }

        for (const kind of notesByKindAndUri.keys()) {
            this.getHoverNoteDecorationType(kind);
        }
        for (const [kind, decorationType] of this.hoverNoteDecorationTypes) {
            const notesByUri = notesByKindAndUri.get(kind) ?? new Map<string, EntriesForUri<HoverNoteEntry>>();
            for (const editor of vscode.window.visibleTextEditors) {
                const options = notesByUri.get(editor.document.uri.toString())?.entries.map(createHoverNoteOption) ?? [];
                editor.setDecorations(decorationType, options);
            }
        }
    }
}
