import * as vscode from 'vscode';
import {
    WorkspacePath,
    assertWorkspacePath,
    getSingleWorkspaceRoot,
    isUriInsideWorkspace,
    uriToWorkspacePath,
    workspacePathToUri
} from '../workspace/workspace-boundary';

export { isUriInsideWorkspace, uriToWorkspacePath } from '../workspace/workspace-boundary';

export interface EditorTargetInput {
    path?: string;
    uri?: string;
}

export type EditorTarget =
    | { kind: 'activeEditor' }
    | { kind: 'workspacePath'; path: WorkspacePath }
    | { kind: 'documentUri'; uri: vscode.Uri };

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

function findVisibleEditor(uri: vscode.Uri): vscode.TextEditor | undefined {
    return vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === uri.toString());
}

function hasWorkspaceRoot(): boolean {
    return Boolean(vscode.workspace.workspaceFolders?.[0]);
}

function assertSafeEditorUri(uri: vscode.Uri, rawUri: string): void {
    if (!hasWorkspaceRoot()) {
        if (uri.scheme === 'file') {
            getSingleWorkspaceRoot();
        }
        return;
    }

    if ((uri.scheme === 'file' || uri.scheme === 'git') && !isUriInsideWorkspace(uri)) {
        throw new Error(`URI must stay within the workspace: ${rawUri}`);
    }
}

function editorUriPath(uri: vscode.Uri): string {
    return isUriInsideWorkspace(uri) ? uriToWorkspacePath(uri) : uri.fsPath;
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

export function normalizeEditorTargetInput(input: EditorTargetInput = {}): EditorTarget {
    const hasPath = input.path !== undefined;
    const hasUri = input.uri !== undefined;

    if (hasPath && hasUri) {
        throw new Error('Provide either path or uri, not both.');
    }

    if (hasPath) {
        return { kind: 'workspacePath', path: assertWorkspacePath(input.path ?? '') };
    }

    if (hasUri) {
        return { kind: 'documentUri', uri: vscode.Uri.parse(input.uri ?? '', true) };
    }

    return { kind: 'activeEditor' };
}

function isEditorTarget(input: EditorTargetInput | EditorTarget): input is EditorTarget {
    return 'kind' in input;
}

export async function resolveEditorTarget(input: EditorTargetInput | EditorTarget = { kind: 'activeEditor' }): Promise<ResolvedEditorTarget> {
    const target = isEditorTarget(input) ? input : normalizeEditorTargetInput(input);

    if (target.kind === 'documentUri') {
        assertSafeEditorUri(target.uri, target.uri.toString());
        return {
            uri: target.uri,
            path: editorUriPath(target.uri),
            editor: findVisibleEditor(target.uri)
        };
    }

    if (target.kind === 'workspacePath') {
        const uri = workspacePathToUri(target.path);
        return {
            uri,
            path: target.path,
            editor: findVisibleEditor(uri)
        };
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        throw new Error('No active editor is available; provide a path or open an editor.');
    }

    assertSafeEditorUri(editor.document.uri, editor.document.uri.toString());

    return {
        uri: editor.document.uri,
        path: editorUriPath(editor.document.uri),
        editor
    };
}
