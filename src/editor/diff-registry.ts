import type * as vscode from 'vscode';
import { toDiffId } from './ids';
import type { DiffId } from './ids';
import type { DiffEntryMatch, NormalizedDiffEntry, OpenDiffResult, StoredDiff } from './diff-types';

export interface AddDiffInput {
    title: string;
    entries: NormalizedDiffEntry[];
}

export class DiffRegistry {
    private readonly diffs = new Map<DiffId, StoredDiff>();
    private nextDiffNumber = 1;

    public add(input: AddDiffInput): OpenDiffResult {
        const result: OpenDiffResult = {
            diffId: this.createDiffId(),
            title: input.title,
            count: input.entries.length,
            entries: input.entries
        };
        this.diffs.set(result.diffId, { ...result });

        return result;
    }

    public get(diffId: string): StoredDiff | undefined {
        return this.diffs.get(toDiffId(diffId));
    }

    public list(): StoredDiff[] {
        return Array.from(this.diffs.values());
    }

    public findEntryForUri(uri: vscode.Uri): DiffEntryMatch | undefined {
        const uriKey = uri.toString();
        for (const diff of this.diffs.values()) {
            for (const [entryIndex, entry] of diff.entries.entries()) {
                if (entry.leftUri === uriKey) {
                    return this.buildMatch(diff, entryIndex, entry, 'left');
                }
                if (entry.rightUri === uriKey) {
                    return this.buildMatch(diff, entryIndex, entry, 'right');
                }
            }
        }

        return undefined;
    }

    private buildMatch(
        diff: StoredDiff,
        entryIndex: number,
        entry: { label?: string },
        side: 'left' | 'right'
    ): DiffEntryMatch {
        const match: DiffEntryMatch = { diffId: diff.diffId, title: diff.title, entryIndex, side };
        if (entry.label !== undefined) {
            match.label = entry.label;
        }
        return match;
    }

    public clear(): void {
        this.diffs.clear();
    }

    private createDiffId(): DiffId {
        const diffId = toDiffId(`diff-${this.nextDiffNumber}`);
        this.nextDiffNumber += 1;
        return diffId;
    }
}
