import type * as vscode from 'vscode';
import type { AnnotationId } from './ids';

export type AnnotationMode = 'replace' | 'add';
export type AnnotationKind = 'focus' | 'related' | 'previous' | 'question' | 'warning' | 'info';

export interface HighlightEntry {
    uri: vscode.Uri;
    range: vscode.Range;
    kind: AnnotationKind;
}

export interface CalloutEntry {
    uri: vscode.Uri;
    range: vscode.Range;
    title: string;
    message: string;
    kind: AnnotationKind;
}

export interface GutterMarkerEntry {
    uri: vscode.Uri;
    range: vscode.Range;
    kind: AnnotationKind;
    label?: string;
}

export interface HoverNoteEntry {
    uri: vscode.Uri;
    range: vscode.Range;
    message: string;
    kind: AnnotationKind;
    title?: string;
}

export interface CodeLensNoteEntry {
    uri: vscode.Uri;
    range: vscode.Range;
    title: string;
    kind: AnnotationKind;
}

export interface ExplanationCommentEntry {
    uri: vscode.Uri;
    thread: vscode.Disposable;
    kind: AnnotationKind;
}

export interface AnnotationGroup {
    highlights: HighlightEntry[];
    callouts: CalloutEntry[];
    gutterMarkers: GutterMarkerEntry[];
    hoverNotes: HoverNoteEntry[];
    codeLensNotes: CodeLensNoteEntry[];
    explanationComments: ExplanationCommentEntry[];
}

export type AnnotationSurface = keyof AnnotationGroup;

export type AnnotationEntry =
    | HighlightEntry
    | CalloutEntry
    | GutterMarkerEntry
    | HoverNoteEntry
    | CodeLensNoteEntry
    | ExplanationCommentEntry;

export interface StoredAnnotationEntry {
    id: AnnotationId;
    surface: AnnotationSurface;
    entry: AnnotationEntry;
}

export interface AnnotationClearFilter {
    id?: AnnotationId;
    all?: boolean;
    targetUri?: vscode.Uri;
    targetPath?: string;
}

export interface AnnotationStoreClearResult {
    clearedIds: number;
    clearedPaths: string[];
    clearedUris: string[];
    removedCommentEntries: ExplanationCommentEntry[];
}

export interface AnnotationStoreOptions {
    workspacePathForUri?: (uri: vscode.Uri) => string | undefined;
}

function createEmptyGroup(): AnnotationGroup {
    return {
        highlights: [],
        callouts: [],
        gutterMarkers: [],
        hoverNotes: [],
        codeLensNotes: [],
        explanationComments: []
    };
}

export function annotationGroupHasEntries(group: AnnotationGroup): boolean {
    return group.highlights.length > 0
        || group.callouts.length > 0
        || group.gutterMarkers.length > 0
        || group.hoverNotes.length > 0
        || group.codeLensNotes.length > 0
        || group.explanationComments.length > 0;
}

function groupEntries(group: AnnotationGroup): AnnotationEntry[] {
    return [
        ...group.highlights,
        ...group.callouts,
        ...group.gutterMarkers,
        ...group.hoverNotes,
        ...group.codeLensNotes,
        ...group.explanationComments
    ];
}

function groupCommentEntries(group: AnnotationGroup): ExplanationCommentEntry[] {
    return [...group.explanationComments];
}

function entriesForSurface(group: AnnotationGroup, surface: AnnotationSurface): AnnotationEntry[] {
    switch (surface) {
        case 'highlights':
            return group.highlights;
        case 'callouts':
            return group.callouts;
        case 'gutterMarkers':
            return group.gutterMarkers;
        case 'hoverNotes':
            return group.hoverNotes;
        case 'codeLensNotes':
            return group.codeLensNotes;
        case 'explanationComments':
            return group.explanationComments;
    }
}

function assignSurfaceEntries(group: AnnotationGroup, surface: AnnotationSurface, entries: AnnotationEntry[]): void {
    switch (surface) {
        case 'highlights':
            group.highlights = entries as HighlightEntry[];
            break;
        case 'callouts':
            group.callouts = entries as CalloutEntry[];
            break;
        case 'gutterMarkers':
            group.gutterMarkers = entries as GutterMarkerEntry[];
            break;
        case 'hoverNotes':
            group.hoverNotes = entries as HoverNoteEntry[];
            break;
        case 'codeLensNotes':
            group.codeLensNotes = entries as CodeLensNoteEntry[];
            break;
        case 'explanationComments':
            group.explanationComments = entries as ExplanationCommentEntry[];
            break;
    }
}

export class AnnotationStore {
    private readonly groupsById = new Map<AnnotationId, AnnotationGroup>();
    private readonly workspacePathForUri: ((uri: vscode.Uri) => string | undefined) | undefined;

    constructor(options: AnnotationStoreOptions = {}) {
        this.workspacePathForUri = options.workspacePathForUri;
    }

    public setSurfaceEntries(id: AnnotationId, surface: 'highlights', entries: HighlightEntry[], mode: AnnotationMode): AnnotationGroup;
    public setSurfaceEntries(id: AnnotationId, surface: 'callouts', entries: CalloutEntry[], mode: AnnotationMode): AnnotationGroup;
    public setSurfaceEntries(id: AnnotationId, surface: 'gutterMarkers', entries: GutterMarkerEntry[], mode: AnnotationMode): AnnotationGroup;
    public setSurfaceEntries(id: AnnotationId, surface: 'hoverNotes', entries: HoverNoteEntry[], mode: AnnotationMode): AnnotationGroup;
    public setSurfaceEntries(id: AnnotationId, surface: 'codeLensNotes', entries: CodeLensNoteEntry[], mode: AnnotationMode): AnnotationGroup;
    public setSurfaceEntries(id: AnnotationId, surface: 'explanationComments', entries: ExplanationCommentEntry[], mode: AnnotationMode): AnnotationGroup;
    public setSurfaceEntries(id: AnnotationId, surface: AnnotationSurface, entries: AnnotationEntry[], mode: AnnotationMode): AnnotationGroup {
        const group = this.getOrCreateGroup(id);
        const nextEntries = mode === 'add'
            ? [...entriesForSurface(group, surface), ...entries]
            : [...entries];
        assignSurfaceEntries(group, surface, nextEntries);

        return group;
    }

    public getGroup(id: AnnotationId): AnnotationGroup | undefined {
        return this.groupsById.get(id);
    }

    public groups(): IterableIterator<AnnotationGroup> {
        return this.groupsById.values();
    }

    public entries(): StoredAnnotationEntry[] {
        const entries: StoredAnnotationEntry[] = [];
        for (const [id, group] of this.groupsById) {
            for (const surface of Object.keys(group) as AnnotationSurface[]) {
                for (const entry of entriesForSurface(group, surface)) {
                    entries.push({ id, surface, entry });
                }
            }
        }

        return entries;
    }

    public entriesForUri(uri: vscode.Uri): StoredAnnotationEntry[] {
        const uriKey = uri.toString();
        return this.entries().filter(stored => stored.entry.uri.toString() === uriKey);
    }

    public clear(filter: AnnotationClearFilter = {}): AnnotationStoreClearResult {
        const clearedPaths = new Set<string>();
        const clearedUris = new Set<string>();
        const removedCommentEntries: ExplanationCommentEntry[] = [];
        let clearedIds = 0;

        if (filter.all) {
            clearedIds = this.groupsById.size;
            for (const group of this.groupsById.values()) {
                this.addEntryTargets(clearedPaths, clearedUris, groupEntries(group));
                removedCommentEntries.push(...groupCommentEntries(group));
            }
            this.groupsById.clear();
            return { clearedIds, clearedPaths: Array.from(clearedPaths), clearedUris: Array.from(clearedUris), removedCommentEntries };
        }

        const targetKey = filter.targetUri?.toString();
        const hasTargetFilter = targetKey !== undefined || filter.targetPath !== undefined;
        const groupsToClear = filter.id
            ? [[filter.id, this.groupsById.get(filter.id)] as const]
            : Array.from(this.groupsById.entries());

        for (const [id, group] of groupsToClear) {
            if (!group) {
                continue;
            }

            if (hasTargetFilter) {
                const removedEntries = this.removeEntriesForTarget(group, targetKey, filter.targetPath);
                if (removedEntries.length > 0) {
                    if (filter.targetPath) {
                        clearedPaths.add(filter.targetPath);
                    } else {
                        this.addEntryTargets(clearedPaths, new Set<string>(), removedEntries);
                    }
                    if (targetKey) {
                        clearedUris.add(targetKey);
                    } else {
                        this.addEntryTargets(new Set<string>(), clearedUris, removedEntries);
                    }
                    removedCommentEntries.push(...removedEntries.filter((entry): entry is ExplanationCommentEntry => 'thread' in entry));
                    clearedIds += 1;
                }
                if (!annotationGroupHasEntries(group)) {
                    this.groupsById.delete(id);
                }
            } else if (this.groupsById.delete(id)) {
                clearedIds += 1;
                this.addEntryTargets(clearedPaths, clearedUris, groupEntries(group));
                removedCommentEntries.push(...groupCommentEntries(group));
            }
        }

        return { clearedIds, clearedPaths: Array.from(clearedPaths), clearedUris: Array.from(clearedUris), removedCommentEntries };
    }

    public clearAll(): void {
        this.groupsById.clear();
    }

    private getOrCreateGroup(id: AnnotationId): AnnotationGroup {
        let group = this.groupsById.get(id);
        if (!group) {
            group = createEmptyGroup();
            this.groupsById.set(id, group);
        }

        return group;
    }

    private removeEntriesForTarget(group: AnnotationGroup, uriKey: string | undefined, workspacePath: string | undefined): AnnotationEntry[] {
        const removedEntries: AnnotationEntry[] = [];
        for (const surface of Object.keys(group) as AnnotationSurface[]) {
            const existingEntries = entriesForSurface(group, surface);
            const removedSurfaceEntries = existingEntries.filter(entry => this.entryMatchesTarget(entry, uriKey, workspacePath));
            removedEntries.push(...removedSurfaceEntries);
            assignSurfaceEntries(group, surface, existingEntries.filter(entry => !this.entryMatchesTarget(entry, uriKey, workspacePath)));
        }

        return removedEntries;
    }

    private entryMatchesTarget(entry: AnnotationEntry, uriKey: string | undefined, workspacePath: string | undefined): boolean {
        if (uriKey) {
            return entry.uri.toString() === uriKey;
        }
        if (workspacePath) {
            return this.workspacePathForUri?.(entry.uri) === workspacePath;
        }

        return false;
    }

    private addEntryTargets(paths: Set<string>, uris: Set<string>, entries: AnnotationEntry[]): void {
        for (const entry of entries) {
            const workspacePath = this.workspacePathForUri?.(entry.uri);
            if (workspacePath) {
                paths.add(workspacePath);
            }
            uris.add(entry.uri.toString());
        }
    }
}
