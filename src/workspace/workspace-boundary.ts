import * as path from 'path';
import * as vscode from 'vscode';

export type WorkspacePath = string & { readonly __brand: 'WorkspacePath' };
export type WorkspaceFileUri = vscode.Uri & { readonly __brand: 'WorkspaceFileUri' };

function workspacePathSegments(rawPath: string): string[] {
    return rawPath.split(/[\\/]+/).filter(segment => segment.length > 0 && segment !== '.');
}

function hasWindowsDriveLetter(rawPath: string): boolean {
    return /^[A-Za-z]:/.test(rawPath);
}

function isAbsoluteWorkspaceInput(rawPath: string): boolean {
    return rawPath.startsWith('/') || rawPath.startsWith('\\') || path.isAbsolute(rawPath);
}

function toWorkspacePath(normalizedPath: string): WorkspacePath {
    return normalizedPath as WorkspacePath;
}

/**
 * Returns the first workspace folder root. Multi-root behavior is intentionally
 * out of scope for the MCP tools in this extension.
 */
export function getSingleWorkspaceRoot(): vscode.Uri {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder is open.');
    }

    return workspaceFolder.uri;
}

export function normalizeWorkspacePath(rawPath: string): WorkspacePath {
    if (rawPath.trim().length === 0) {
        throw new Error('Path must not be empty.');
    }

    const segments = workspacePathSegments(rawPath);
    if (isAbsoluteWorkspaceInput(rawPath) || hasWindowsDriveLetter(rawPath) || segments.includes('..')) {
        throw new Error(`Path must stay within the workspace: ${rawPath}`);
    }

    return toWorkspacePath(segments.length === 0 ? '.' : segments.join('/'));
}

export function assertWorkspacePath(rawPath: string): WorkspacePath {
    return normalizeWorkspacePath(rawPath);
}

export function workspacePathToUri(workspacePath: WorkspacePath): WorkspaceFileUri {
    const root = getSingleWorkspaceRoot();
    const normalizedPath = normalizeWorkspacePath(workspacePath);
    if (normalizedPath === '.') {
        return root as WorkspaceFileUri;
    }

    return vscode.Uri.joinPath(root, ...workspacePathSegments(normalizedPath)) as WorkspaceFileUri;
}

export function isUriInsideWorkspace(uri: vscode.Uri): boolean {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return false;
    }

    const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export function assertInsideWorkspace(uri: vscode.Uri): WorkspaceFileUri {
    if (!isUriInsideWorkspace(uri)) {
        throw new Error(`URI must stay within the workspace: ${uri.toString()}`);
    }

    return uri as WorkspaceFileUri;
}

export function pathFromUri(uri: vscode.Uri): WorkspacePath | undefined {
    if (!isUriInsideWorkspace(uri)) {
        return undefined;
    }

    const root = getSingleWorkspaceRoot();
    const relativePath = path.relative(root.fsPath, uri.fsPath);
    return normalizeWorkspacePath(relativePath === '' ? '.' : relativePath);
}

export function uriToWorkspacePath(uri: vscode.Uri): WorkspacePath {
    const workspacePath = pathFromUri(uri);
    if (!workspacePath) {
        throw new Error(`URI must stay within the workspace: ${uri.toString()}`);
    }

    return workspacePath;
}
