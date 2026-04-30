import * as vscode from 'vscode';
import { DiffNormalizer, isDiffRequest, normalizeDiffRequest } from './diff-normalizer';
import { DiffRegistry } from './diff-registry';
import type {
    DiffEntryMatch,
    DiffRequest,
    EditorDiffServiceOptions,
    OpenDiffInput,
    OpenDiffResult,
    StoredDiff
} from './diff-types';

export { normalizeDiffRequest } from './diff-normalizer';
export type {
    DiffEntryMatch,
    DiffRequest,
    EditorDiffServiceOptions,
    OpenDiffInput,
    OpenDiffResult,
    StoredDiff
} from './diff-types';

export class EditorDiffService {
    private readonly normalizer: DiffNormalizer;
    private readonly registry = new DiffRegistry();

    constructor(options: EditorDiffServiceOptions = {}) {
        this.normalizer = new DiffNormalizer(options);
    }

    public async openDiff(input: OpenDiffInput | DiffRequest): Promise<OpenDiffResult> {
        const request = isDiffRequest(input) ? input : normalizeDiffRequest(input);
        const normalized = await this.normalizer.normalize(request);

        await vscode.commands.executeCommand('vscode.changes', request.title, normalized.map(entry => entry.commandEntry));

        return this.registry.add({
            title: request.title,
            entries: normalized.map(entry => entry.entry)
        });
    }

    public getDiff(diffId: string): StoredDiff | undefined {
        return this.registry.get(diffId);
    }

    // Used cross-file via getEditorDiffService().findEntryForUri(); fallow can't follow that dispatch.
    // fallow-ignore-next-line unused-class-member
    public findEntryForUri(uri: vscode.Uri): DiffEntryMatch | undefined {
        return this.registry.findEntryForUri(uri);
    }

    // Called by disposeEditorDiffService() below; fallow can't follow that dispatch.
    // fallow-ignore-next-line unused-class-member
    public dispose(): void {
        this.registry.clear();
    }
}

let defaultDiffService: EditorDiffService | undefined;

export function getEditorDiffService(): EditorDiffService {
    if (!defaultDiffService) {
        defaultDiffService = new EditorDiffService();
    }

    return defaultDiffService;
}

export function disposeEditorDiffService(): void {
    if (defaultDiffService) {
        defaultDiffService.dispose();
        defaultDiffService = undefined;
    }
}
