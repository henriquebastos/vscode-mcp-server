import type * as vscode from 'vscode';
import type { DiffId } from './ids';

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

export interface EditorDiffServiceOptions {
    fileSystem?: DiffFileSystem;
    gitApi?: GitApi;
}
