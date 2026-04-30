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
                    return { diffId: diff.diffId, title: diff.title, entryIndex, label: entry.label, side: 'left' };
                }
                if (entry.rightUri === uriKey) {
                    return { diffId: diff.diffId, title: diff.title, entryIndex, label: entry.label, side: 'right' };
                }
            }
        }

        return undefined;
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
