import * as path from 'path';
import * as vscode from 'vscode';

export interface EditorTargetInput {
    path?: string;
}

export interface ResolvedEditorTarget {
    uri: vscode.Uri;
    path: string;
    editor?: vscode.TextEditor;
}

export interface McpPosition {
    line: number;
    character?: number;
}

export interface McpRange {
    start: McpPosition;
    end?: McpPosition;
}

export interface SerializedRange {
    start: Required<McpPosition>;
    end: Required<McpPosition>;
}

function getWorkspaceFolder(): vscode.WorkspaceFolder {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No workspace folder is open.');
    }

    return workspaceFolder;
}

function workspacePathSegments(workspacePath: string): string[] {
    return workspacePath.split(/[\\/]+/).filter(segment => segment.length > 0 && segment !== '.');
}

function normalizeWorkspacePath(workspacePath: string): string {
    return workspacePathSegments(workspacePath).join('/');
}

function assertWorkspaceRelativePath(workspacePath: string): void {
    const segments = workspacePathSegments(workspacePath);
    const isWindowsAbsolutePath = /^[A-Za-z]:/.test(workspacePath);

    if (path.isAbsolute(workspacePath) || isWindowsAbsolutePath || segments.includes('..')) {
        throw new Error(`Path must stay within the workspace: ${workspacePath}`);
    }
}

export function isUriInsideWorkspace(uri: vscode.Uri): boolean {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return false;
    }

    const relativePath = path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export function uriToWorkspacePath(uri: vscode.Uri): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return uri.fsPath;
    }

    return normalizeWorkspacePath(path.relative(workspaceFolder.uri.fsPath, uri.fsPath));
}

function uriForWorkspacePath(workspacePath: string): vscode.Uri {
    assertWorkspaceRelativePath(workspacePath);
    const workspaceFolder = getWorkspaceFolder();
    return vscode.Uri.joinPath(workspaceFolder.uri, ...workspacePathSegments(workspacePath));
}

function findVisibleEditor(uri: vscode.Uri): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === uri.toString());
}

export function mcpPositionToVsCodePosition(position: McpPosition): vscode.Position {
    if (position.line < 1) {
        throw new Error(`Line numbers are 1-based and must be at least 1; received ${position.line}.`);
    }

    const character = position.character ?? 0;
    if (character < 0) {
        throw new Error(`Character positions are 0-based and must be at least 0; received ${character}.`);
    }

    return new vscode.Position(position.line - 1, character);
}

export function mcpRangeToVsCodeRange(range: McpRange): vscode.Range {
    const start = mcpPositionToVsCodePosition(range.start);
    const end = mcpPositionToVsCodePosition(range.end ?? range.start);
    return new vscode.Range(start, end);
}

export function vsCodePositionToMcpPosition(position: vscode.Position): Required<McpPosition> {
    return {
        line: position.line + 1,
        character: position.character
    };
}

export function vsCodeRangeToSerializedRange(range: vscode.Range): SerializedRange {
    return {
        start: vsCodePositionToMcpPosition(range.start),
        end: vsCodePositionToMcpPosition(range.end)
    };
}

export async function resolveEditorTarget(input: EditorTargetInput = {}): Promise<ResolvedEditorTarget> {
    if (input.path && input.path.trim().length > 0) {
        const uri = uriForWorkspacePath(input.path);
        return {
            uri,
            path: normalizeWorkspacePath(input.path),
            editor: findVisibleEditor(uri)
        };
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        throw new Error('No active editor is available; provide a path or open an editor.');
    }

    return {
        uri: editor.document.uri,
        path: uriToWorkspacePath(editor.document.uri),
        editor
    };
}
