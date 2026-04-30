import * as path from 'path';
import * as vscode from 'vscode';
import { DiffId, toDiffId } from './ids';
import { isUriInsideWorkspace } from './location-utils';

export interface DiffEntryInput {
    label?: string;
    leftUri?: string;
    rightUri?: string;
}

export interface OpenDiffInput {
    title?: string;
    leftUri?: string;
    rightUri?: string;
    entries?: DiffEntryInput[];
    include?: string[];
    exclude?: string[];
    maxFiles?: number;
}

export type NonEmptyArray<T> = [T, ...T[]];

export type DiffRequest =
    | {
        mode: 'source';
        title: string;
        leftUri: string;
        rightUri: string;
        include: string[];
        exclude: string[];
        maxFiles?: number;
    }
    | {
        mode: 'entries';
        title: string;
        entries: NonEmptyArray<DiffEntryInput>;
        include: string[];
        exclude: string[];
        maxFiles?: number;
    };

export interface NormalizedDiffEntry {
    label?: string;
    leftUri?: string;
    rightUri?: string;
}

export interface OpenDiffResult {
    diffId: DiffId;
    title: string;
    count: number;
    entries: NormalizedDiffEntry[];
}

export interface StoredDiff extends OpenDiffResult {}

export interface DiffEntryMatch {
    diffId: DiffId;
    title: string;
    entryIndex: number;
    label?: string;
    side: 'left' | 'right';
}

export interface DiffFileSystem {
    stat(uri: vscode.Uri): Thenable<vscode.FileStat>;
    readDirectory(uri: vscode.Uri): Thenable<[string, vscode.FileType][]>;
    readFile(uri: vscode.Uri): Thenable<Uint8Array>;
}

export interface GitChange {
    uri: vscode.Uri;
    originalUri: vscode.Uri;
    renameUri?: vscode.Uri;
    status?: number;
}

export interface GitRepository {
    rootUri: vscode.Uri;
    diffBetween?(ref1: string, ref2: string): Promise<GitChange[]>;
    diffWith?(ref: string): Promise<GitChange[]>;
}

export interface GitApi {
    toGitUri(uri: vscode.Uri, ref: string): vscode.Uri;
    getRepository(uri: vscode.Uri): GitRepository | null;
}

interface GitExtension {
    enabled: boolean;
    getAPI(version: 1): GitApi;
}

export interface EditorDiffServiceOptions {
    fileSystem?: DiffFileSystem;
    gitApi?: GitApi;
}

type ChangesEntry = [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined];

interface NormalizedCommandEntry {
    entry: NormalizedDiffEntry;
    commandEntry: ChangesEntry;
}

interface ParsedSourceUri {
    documentUri: vscode.Uri;
    fileUri: vscode.Uri;
    gitRef?: string;
    kind: 'file' | 'gitSnapshot' | 'gitDocument';
}

function hasSourceMode(input: OpenDiffInput): boolean {
    return Boolean(input.leftUri || input.rightUri);
}

function hasExplicitEntryMode(input: OpenDiffInput): boolean {
    return Array.isArray(input.entries);
}

export function normalizeDiffRequest(input: OpenDiffInput): DiffRequest {
    const sourceMode = hasSourceMode(input);
    const explicitEntryMode = hasExplicitEntryMode(input);

    if (sourceMode === explicitEntryMode) {
        throw new Error('Provide exactly one diff mode: either leftUri/rightUri source mode or entries explicit mode.');
    }

    const title = input.title ?? 'Code Diff';
    const include = input.include ?? [];
    const exclude = input.exclude ?? [];

    if (sourceMode) {
        if (!input.leftUri || !input.rightUri) {
            throw new Error('Source-mode diffs require both leftUri and rightUri.');
        }

        const request: Extract<DiffRequest, { mode: 'source' }> = {
            mode: 'source',
            title,
            leftUri: input.leftUri,
            rightUri: input.rightUri,
            include,
            exclude
        };
        if (input.maxFiles !== undefined) {
            request.maxFiles = input.maxFiles;
        }

        return request;
    }

    const entries = input.entries ?? [];
    if (entries.length === 0) {
        throw new Error('Explicit diff entry mode requires at least one entry.');
    }

    const request: Extract<DiffRequest, { mode: 'entries' }> = {
        mode: 'entries',
        title,
        entries: entries as NonEmptyArray<DiffEntryInput>,
        include,
        exclude
    };
    if (input.maxFiles !== undefined) {
        request.maxFiles = input.maxFiles;
    }

    return request;
}

function isDiffRequest(input: OpenDiffInput | DiffRequest): input is DiffRequest {
    return 'mode' in input;
}

function parseDocumentUri(uri: string, fieldName: string): vscode.Uri {
    try {
        return vscode.Uri.parse(uri, true);
    } catch (error) {
        throw new Error(`Invalid ${fieldName}: ${uri}`);
    }
}

function gitRefFromQuery(uri: vscode.Uri): string | undefined {
    const ref = new URLSearchParams(uri.query).get('ref');
    return ref && ref.trim().length > 0 ? ref : undefined;
}

function fileUriFromSourceUri(uri: vscode.Uri): vscode.Uri {
    return uri.with({ scheme: 'file', query: '', fragment: '' });
}

function parseSourceUri(uriString: string, fieldName: string): ParsedSourceUri {
    const uri = parseDocumentUri(uriString, fieldName);

    if (uri.scheme === 'file') {
        assertSafeWorkspaceFileUri(uri, fieldName);
        return { documentUri: uri, fileUri: uri, kind: 'file' };
    }

    if (uri.scheme === 'git+file') {
        const gitRef = gitRefFromQuery(uri);
        if (!gitRef) {
            throw new Error(`${fieldName} git+file URI requires a ref query parameter.`);
        }
        const fileUri = fileUriFromSourceUri(uri);
        assertSafeWorkspaceFileUri(fileUri, fieldName);
        return { documentUri: uri, fileUri, gitRef, kind: 'gitSnapshot' };
    }

    if (uri.scheme === 'git') {
        const fileUri = fileUriFromSourceUri(uri);
        assertSafeWorkspaceFileUri(fileUri, fieldName);
        return { documentUri: uri, fileUri, kind: 'gitDocument' };
    }

    throw new Error(`${fieldName} must be a file:, git+file:, or git: URI; received ${uri.scheme}:`);
}

function normalizeUriEntry(label: string | undefined, left: vscode.Uri | undefined, right: vscode.Uri | undefined, index: number): NormalizedCommandEntry {
    if (!left && !right) {
        throw new Error(`Diff entry ${index + 1} must include at least one of leftUri or rightUri.`);
    }

    const entry: NormalizedDiffEntry = {};
    if (label) {
        entry.label = label;
    }
    if (left) {
        entry.leftUri = left.toString();
    }
    if (right) {
        entry.rightUri = right.toString();
    }

    const resource = right ?? left;
    if (!resource) {
        throw new Error(`Diff entry ${index + 1} must include at least one of leftUri or rightUri.`);
    }

    return {
        entry,
        commandEntry: [resource, left, right]
    };
}

function hasWorkspaceFolder(): boolean {
    return Boolean(vscode.workspace.workspaceFolders?.length);
}

function validateExplicitDocumentUri(uri: vscode.Uri, fieldName: string): void {
    if (uri.scheme === 'file') {
        if (hasWorkspaceFolder() && !isUriInsideWorkspace(uri)) {
            throw new Error(`${fieldName} must stay within the workspace: ${uri.toString()}`);
        }
        return;
    }

    if (uri.scheme === 'git') {
        const fileUri = fileUriFromSourceUri(uri);
        if (hasWorkspaceFolder() && !isUriInsideWorkspace(fileUri)) {
            throw new Error(`${fieldName} must stay within the workspace: ${uri.toString()}`);
        }
        return;
    }

    throw new Error(`${fieldName} must be a file: or git: document URI in explicit entry mode; received ${uri.scheme}:`);
}

function normalizeExplicitEntry(input: DiffEntryInput, index: number): NormalizedCommandEntry {
    const left = input.leftUri ? parseDocumentUri(input.leftUri, `entries[${index}].leftUri`) : undefined;
    const right = input.rightUri ? parseDocumentUri(input.rightUri, `entries[${index}].rightUri`) : undefined;
    if (left) {
        validateExplicitDocumentUri(left, `entries[${index}].leftUri`);
    }
    if (right) {
        validateExplicitDocumentUri(right, `entries[${index}].rightUri`);
    }

    return normalizeUriEntry(input.label, left, right, index);
}

function assertSafeWorkspaceFileUri(uri: vscode.Uri, fieldName: string): void {
    if (uri.scheme !== 'file') {
        throw new Error(`${fieldName} must be a file: URI for workspace source diffs; received ${uri.scheme}:`);
    }
    if (!isUriInsideWorkspace(uri)) {
        throw new Error(`${fieldName} must stay within the workspace: ${uri.toString()}`);
    }
}

function isDirectory(stat: vscode.FileStat): boolean {
    return (stat.type & vscode.FileType.Directory) !== 0;
}

function isFile(stat: vscode.FileStat): boolean {
    return (stat.type & vscode.FileType.File) !== 0;
}

function normalizeRelativePath(relativePath: string): string {
    return relativePath.split(path.sep).join('/');
}

function uriForRelativePath(root: vscode.Uri, relativePath: string): vscode.Uri {
    const segments = relativePath.split('/').filter(segment => segment.length > 0);
    return vscode.Uri.joinPath(root, ...segments);
}

function relativePathForUri(root: vscode.Uri, uri: vscode.Uri): string {
    return normalizeRelativePath(path.relative(root.fsPath, uri.fsPath));
}

function escapeRegExp(value: string): string {
    return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(pattern: string, basenameOnly: boolean): RegExp {
    const normalized = normalizeRelativePath(pattern);
    let source = '';

    for (let index = 0; index < normalized.length; index += 1) {
        const character = normalized[index];
        if (character === '*') {
            if (normalized[index + 1] === '*') {
                source += '.*';
                index += 1;
            } else {
                source += '[^/]*';
            }
        } else {
            source += escapeRegExp(character);
        }
    }

    return new RegExp(basenameOnly ? `(^|/)${source}$` : `^${source}$`);
}

function matchesFilter(relativePath: string, pattern: string): boolean {
    const normalizedPattern = normalizeRelativePath(pattern).replace(/^\.\//, '');
    if (normalizedPattern.length === 0) {
        return false;
    }
    if (relativePath === normalizedPattern || relativePath.startsWith(`${normalizedPattern.replace(/\/$/, '')}/`)) {
        return true;
    }

    return globToRegExp(normalizedPattern, !normalizedPattern.includes('/')).test(relativePath);
}

function passesFilters(relativePath: string, include: string[] = [], exclude: string[] = []): boolean {
    if (include.length > 0 && !include.some(pattern => matchesFilter(relativePath, pattern))) {
        return false;
    }

    return !exclude.some(pattern => matchesFilter(relativePath, pattern));
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.byteLength !== right.byteLength) {
        return false;
    }

    for (let index = 0; index < left.byteLength; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }

    return true;
}

function isDescendantUri(root: vscode.Uri, uri: vscode.Uri): boolean {
    const relativePath = path.relative(root.fsPath, uri.fsPath);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function relativePathWithinAnyRoot(leftRoot: vscode.Uri, rightRoot: vscode.Uri, leftUri: vscode.Uri, rightUri: vscode.Uri): string | undefined {
    if (isDescendantUri(rightRoot, rightUri)) {
        return relativePathForUri(rightRoot, rightUri);
    }
    if (isDescendantUri(leftRoot, leftUri)) {
        return relativePathForUri(leftRoot, leftUri);
    }
    return undefined;
}

const ADDED_GIT_STATUSES = new Set([1, 4, 7]);
const DELETED_GIT_STATUSES = new Set([2, 6]);

function isAddedGitChange(change: GitChange): boolean {
    return change.status !== undefined && ADDED_GIT_STATUSES.has(change.status);
}

function isDeletedGitChange(change: GitChange): boolean {
    return change.status !== undefined && DELETED_GIT_STATUSES.has(change.status);
}

async function collectFilePaths(fileSystem: DiffFileSystem, root: vscode.Uri, current: vscode.Uri = root): Promise<string[]> {
    const entries = await fileSystem.readDirectory(current);
    const files: string[] = [];

    for (const [name, type] of entries) {
        const child = vscode.Uri.joinPath(current, name);
        if ((type & vscode.FileType.Directory) !== 0) {
            files.push(...await collectFilePaths(fileSystem, root, child));
        } else if ((type & vscode.FileType.File) !== 0) {
            files.push(relativePathForUri(root, child));
        }
    }

    return files.sort();
}

export class EditorDiffService {
    private readonly diffs = new Map<DiffId, StoredDiff>();
    private readonly fileSystem: DiffFileSystem;
    private readonly injectedGitApi?: GitApi;
    private nextDiffNumber = 1;

    constructor(options: EditorDiffServiceOptions = {}) {
        this.fileSystem = options.fileSystem ?? vscode.workspace.fs;
        this.injectedGitApi = options.gitApi;
    }

    public async openDiff(input: OpenDiffInput | DiffRequest): Promise<OpenDiffResult> {
        const request = isDiffRequest(input) ? input : normalizeDiffRequest(input);
        const normalized = request.mode === 'source'
            ? await this.normalizeSourceEntries(request)
            : this.normalizeExplicitEntries(request.entries);
        this.assertCanOpenEntryCount(normalized.length, request.maxFiles);

        await vscode.commands.executeCommand('vscode.changes', request.title, normalized.map(entry => entry.commandEntry));

        const result: OpenDiffResult = {
            diffId: this.createDiffId(),
            title: request.title,
            count: normalized.length,
            entries: normalized.map(entry => entry.entry)
        };
        this.diffs.set(result.diffId, { ...result });

        return result;
    }

    public getDiff(diffId: string): StoredDiff | undefined {
        return this.diffs.get(toDiffId(diffId));
    }

    public listDiffs(): StoredDiff[] {
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

    public dispose(): void {
        this.diffs.clear();
    }

    private normalizeExplicitEntries(entries: NonEmptyArray<DiffEntryInput>): NormalizedCommandEntry[] {
        if (entries.length === 0) {
            throw new Error('Explicit diff entry mode requires at least one entry.');
        }

        return entries.map(normalizeExplicitEntry);
    }

    private async normalizeSourceEntries(input: Extract<DiffRequest, { mode: 'source' }>): Promise<NormalizedCommandEntry[]> {
        const left = parseSourceUri(input.leftUri, 'leftUri');
        const right = parseSourceUri(input.rightUri, 'rightUri');
        const leftStat = await this.fileSystem.stat(left.fileUri);
        const rightStat = await this.fileSystem.stat(right.fileUri);

        if (isFile(leftStat) && isFile(rightStat)) {
            const relativePath = path.basename(right.fileUri.fsPath);
            if (!passesFilters(relativePath, input.include, input.exclude)) {
                throw new Error('No diff entries matched the provided include/exclude filters.');
            }
            const leftDocument = await this.documentUriForSource(left);
            const rightDocument = await this.documentUriForSource(right);
            return [normalizeUriEntry(undefined, leftDocument, rightDocument, 0)];
        }

        if (isDirectory(leftStat) && isDirectory(rightStat)) {
            if (left.kind === 'gitDocument' || right.kind === 'gitDocument') {
                throw new Error('git: source mode is only supported for exact file document URIs; use git+file:?ref=... for folder or tree sources.');
            }
            if (left.kind !== 'file' || right.kind !== 'file') {
                return this.normalizeGitFolderEntries(left, right, input);
            }
            return this.normalizeFolderEntries(left.fileUri, right.fileUri, input);
        }

        throw new Error('Source-mode URI diffs require both sources to be files or both sources to be folders.');
    }

    private async documentUriForSource(source: ParsedSourceUri): Promise<vscode.Uri> {
        if (source.kind === 'gitSnapshot') {
            const gitApi = await this.getGitApi();
            const repository = gitApi.getRepository(source.fileUri);
            if (!repository) {
                throw new Error(`No Git repository found for ${source.fileUri.toString()}.`);
            }
            return gitApi.toGitUri(source.fileUri, source.gitRef!);
        }

        return source.documentUri;
    }

    private async getGitApi(): Promise<GitApi> {
        if (this.injectedGitApi) {
            return this.injectedGitApi;
        }

        const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
        if (!extension) {
            throw new Error('VS Code Git extension is unavailable; cannot open git+file diffs.');
        }

        const gitExtension = extension.isActive ? extension.exports : await extension.activate();
        if (!gitExtension.enabled) {
            throw new Error('VS Code Git extension is disabled; cannot open git+file diffs.');
        }

        return gitExtension.getAPI(1);
    }

    private async normalizeGitFolderEntries(left: ParsedSourceUri, right: ParsedSourceUri, input: DiffRequest): Promise<NormalizedCommandEntry[]> {
        const gitApi = await this.getGitApi();
        const repository = gitApi.getRepository(left.fileUri) ?? gitApi.getRepository(right.fileUri);
        if (!repository) {
            throw new Error(`No Git repository found for ${left.fileUri.toString()}.`);
        }

        const changes = await this.gitChangesForSources(repository, left, right);
        const entries: NormalizedCommandEntry[] = [];
        const normalizedChanges = changes
            .map(change => {
                const leftFileUri = change.originalUri ?? change.uri;
                const rightFileUri = change.renameUri ?? change.uri;
                const relativePath = relativePathWithinAnyRoot(left.fileUri, right.fileUri, leftFileUri, rightFileUri);
                return relativePath ? { change, leftFileUri, rightFileUri, relativePath } : undefined;
            })
            .filter((change): change is { change: GitChange; leftFileUri: vscode.Uri; rightFileUri: vscode.Uri; relativePath: string } => Boolean(change))
            .filter(({ relativePath }) => passesFilters(relativePath, input.include, input.exclude))
            .sort((first, second) => first.relativePath.localeCompare(second.relativePath));

        for (const { change, leftFileUri, rightFileUri, relativePath } of normalizedChanges) {
            let leftDocument: vscode.Uri | undefined = await this.documentUriForGitSide(left, leftFileUri, gitApi);
            let rightDocument: vscode.Uri | undefined = await this.documentUriForGitSide(right, rightFileUri, gitApi);
            const rightSideIsGitSnapshot = right.kind === 'gitSnapshot' && left.kind === 'file';

            if (isAddedGitChange(change)) {
                if (rightSideIsGitSnapshot) {
                    rightDocument = undefined;
                } else {
                    leftDocument = undefined;
                }
            } else if (isDeletedGitChange(change)) {
                if (rightSideIsGitSnapshot) {
                    leftDocument = undefined;
                } else {
                    rightDocument = undefined;
                }
            }

            entries.push(normalizeUriEntry(relativePath, leftDocument, rightDocument, entries.length));
        }

        if (entries.length === 0) {
            throw new Error('No changed diff entries found for the provided Git source URIs and filters.');
        }

        return entries;
    }

    private async gitChangesForSources(repository: GitRepository, left: ParsedSourceUri, right: ParsedSourceUri): Promise<GitChange[]> {
        if (left.kind === 'gitSnapshot' && right.kind === 'gitSnapshot') {
            if (!repository.diffBetween) {
                throw new Error('The VS Code Git repository API cannot diff between refs.');
            }
            return repository.diffBetween(left.gitRef!, right.gitRef!);
        }

        const ref = left.kind === 'gitSnapshot' ? left.gitRef : right.gitRef;
        if (!ref || !repository.diffWith) {
            throw new Error('The VS Code Git repository API cannot diff a ref with the working tree.');
        }

        return repository.diffWith(ref);
    }

    private async documentUriForGitSide(source: ParsedSourceUri, fileUri: vscode.Uri, gitApi: GitApi): Promise<vscode.Uri> {
        if (source.kind === 'gitSnapshot') {
            return gitApi.toGitUri(fileUri, source.gitRef!);
        }

        if (source.kind === 'gitDocument') {
            return source.documentUri;
        }

        return fileUri;
    }

    private async normalizeFolderEntries(leftRoot: vscode.Uri, rightRoot: vscode.Uri, input: DiffRequest): Promise<NormalizedCommandEntry[]> {
        const leftPaths = new Set(await collectFilePaths(this.fileSystem, leftRoot));
        const rightPaths = new Set(await collectFilePaths(this.fileSystem, rightRoot));
        const allPaths = Array.from(new Set([...leftPaths, ...rightPaths])).sort();
        const entries: NormalizedCommandEntry[] = [];

        for (const relativePath of allPaths) {
            if (!passesFilters(relativePath, input.include, input.exclude)) {
                continue;
            }

            const left = leftPaths.has(relativePath) ? uriForRelativePath(leftRoot, relativePath) : undefined;
            const right = rightPaths.has(relativePath) ? uriForRelativePath(rightRoot, relativePath) : undefined;
            if (left && right) {
                const [leftBytes, rightBytes] = await Promise.all([
                    this.fileSystem.readFile(left),
                    this.fileSystem.readFile(right)
                ]);
                if (bytesEqual(leftBytes, rightBytes)) {
                    continue;
                }
            }

            entries.push(normalizeUriEntry(relativePath, left, right, entries.length));
        }

        if (entries.length === 0) {
            throw new Error('No changed diff entries found for the provided source URIs and filters.');
        }

        return entries;
    }

    private assertCanOpenEntryCount(count: number, maxFiles?: number): void {
        if (maxFiles !== undefined) {
            if (!Number.isInteger(maxFiles) || maxFiles < 1) {
                throw new Error('maxFiles must be a positive integer.');
            }
            if (count > maxFiles) {
                throw new Error(`Diff contains ${count} files, which exceeds maxFiles=${maxFiles}. Refine the include/exclude filters or raise the guard.`);
            }
        }
    }

    private createDiffId(): DiffId {
        const diffId = toDiffId(`diff-${this.nextDiffNumber}`);
        this.nextDiffNumber += 1;
        return diffId;
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
