import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { mcpRangeToVsCodeRange, resolveEditorTarget } from '../editor/location-utils';

suite('Editor Location Utilities', () => {
    teardown(() => {
        sinon.restore();
    });

    test('converts MCP ranges to precise VS Code ranges', () => {
        const precise = mcpRangeToVsCodeRange({
            start: { line: 3, character: 4 },
            end: { line: 5, character: 9 }
        });

        assert.strictEqual(precise.start.line, 2);
        assert.strictEqual(precise.start.character, 4);
        assert.strictEqual(precise.end.line, 4);
        assert.strictEqual(precise.end.character, 9);

        const withDefaults = mcpRangeToVsCodeRange({
            start: { line: 8 },
            end: { line: 9 }
        });

        assert.strictEqual(withDefaults.start.line, 7);
        assert.strictEqual(withDefaults.start.character, 0);
        assert.strictEqual(withDefaults.end.line, 8);
        assert.strictEqual(withDefaults.end.character, 0);
    });

    test('rejects workspace-relative paths that escape the workspace', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);

        await assert.rejects(
            () => resolveEditorTarget({ path: '../secret.ts' }),
            /Path must stay within the workspace: \.\.\/secret\.ts/
        );
    });

    test('resolves provided workspace-relative paths to VS Code URIs', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'visibleTextEditors').value([]);

        const resolved = await resolveEditorTarget({ path: 'src\\example.ts' });

        assert.strictEqual(resolved.uri.fsPath, '/workspace/src/example.ts');
        assert.strictEqual(resolved.path, 'src/example.ts');
        assert.strictEqual(resolved.editor, undefined);
    });

    test('resolves omitted path from the active editor and fails clearly without one', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const activeUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: {
                uri: activeUri
            }
        } as vscode.TextEditor;

        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);

        const resolved = await resolveEditorTarget({});

        assert.strictEqual(resolved.uri.toString(), activeUri.toString());
        assert.strictEqual(resolved.path, 'src/example.ts');
        assert.strictEqual(resolved.editor, activeEditor);

        sinon.restore();
        sinon.stub(vscode.window, 'activeTextEditor').value(undefined);

        await assert.rejects(
            () => resolveEditorTarget({}),
            /No active editor is available; provide a path or open an editor\./
        );
    });
});
