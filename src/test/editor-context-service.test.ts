import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getEditorContext } from '../editor/context-service';

suite('Editor Context Service', () => {
    teardown(() => {
        sinon.restore();
    });

    test('does not expose selected text for active editors outside the workspace', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/tmp/secret.ts');
        const selection = new vscode.Selection(0, 0, 0, 6);
        const activeEditor = {
            document: {
                uri: documentUri,
                languageId: 'typescript',
                lineCount: 1,
                isDirty: false,
                getText: sinon.stub().withArgs(selection).returns('secret')
            },
            selection,
            selections: [selection],
            visibleRanges: [new vscode.Range(0, 0, 0, 6)]
        } as unknown as vscode.TextEditor;

        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);

        const context = await getEditorContext({ includeSelectedText: true });

        assert.strictEqual(context.activeEditor, undefined);
    });

    test('serializes active editor metadata, selection, visible ranges, and selected text', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const selection = new vscode.Selection(1, 2, 1, 8);
        const visibleRange = new vscode.Range(0, 0, 4, 20);
        const activeEditor = {
            document: {
                uri: documentUri,
                languageId: 'typescript',
                lineCount: 12,
                isDirty: true,
                getText: sinon.stub().withArgs(selection).returns('sample')
            },
            selection,
            selections: [selection],
            visibleRanges: [visibleRange]
        } as unknown as vscode.TextEditor;

        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const context = await getEditorContext({ includeSelectedText: true });

        assert.strictEqual(context.activeEditor?.path, 'src/example.ts');
        assert.strictEqual(context.activeEditor?.languageId, 'typescript');
        assert.strictEqual(context.activeEditor?.lineCount, 12);
        assert.strictEqual(context.activeEditor?.isDirty, true);
        assert.deepStrictEqual(context.activeEditor?.selection, {
            start: { line: 2, character: 2 },
            end: { line: 2, character: 8 },
            isEmpty: false,
            selectedText: 'sample'
        });
        assert.deepStrictEqual(context.activeEditor?.visibleRanges, [
            {
                start: { line: 1, character: 0 },
                end: { line: 5, character: 20 }
            }
        ]);
    });
});
