import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getEditorContext } from '../editor/context-service';
import { disposeEditorDiffService, getEditorDiffService } from '../editor/diff-service';
import { assertDefined } from './testUtils';

suite('Editor Context Service', () => {
    teardown(() => {
        disposeEditorDiffService();
        sinon.restore();
    });

    test('associates visible editors with opened diff registry entries and sides', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const leftUri = vscode.Uri.parse('git:/workspace/src/example.ts?%7B%22ref%22%3A%22main%22%7D');
        const rightUri = vscode.Uri.file('/workspace/src/example.ts');
        const selection = new vscode.Selection(0, 0, 0, 7);
        const leftEditor = {
            document: {
                uri: leftUri,
                languageId: 'typescript',
                lineCount: 3,
                isDirty: false,
                getText: sinon.stub().withArgs(selection).returns('oldCode')
            },
            selection,
            selections: [selection],
            visibleRanges: [new vscode.Range(0, 0, 2, 0)]
        } as unknown as vscode.TextEditor;
        const rightEditor = {
            document: {
                uri: rightUri,
                languageId: 'typescript',
                lineCount: 4,
                isDirty: true,
                getText: sinon.stub().withArgs(selection).returns('newCode')
            },
            selection,
            selections: [selection],
            visibleRanges: [new vscode.Range(0, 0, 3, 0)]
        } as unknown as vscode.TextEditor;
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(rightEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([leftEditor, rightEditor]);
        sinon.stub(vscode.commands, 'executeCommand').resolves();
        const opened = await getEditorDiffService().openDiff({
            title: 'Review diff',
            entries: [{ label: 'example.ts', leftUri: leftUri.toString(), rightUri: rightUri.toString() }]
        });

        const context = await getEditorContext({ includeSelectedText: true, includeVisibleEditors: true });

        assert.strictEqual(context.activeEditor?.uri, rightUri.toString());
        assert.deepStrictEqual(context.activeEditor?.diff, {
            diffId: opened.diffId,
            entryIndex: 0,
            label: 'example.ts',
            side: 'right'
        });
        assert.deepStrictEqual(context.visibleEditors?.map(editor => editor.diff), [
            { diffId: opened.diffId, entryIndex: 0, label: 'example.ts', side: 'left' },
            { diffId: opened.diffId, entryIndex: 0, label: 'example.ts', side: 'right' }
        ]);
        assert.strictEqual(assertDefined(context.visibleEditors?.[0]).selection.selectedText, 'oldCode');
    });

    test('does not expose arbitrary non-file virtual editors outside the diff registry', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const virtualUri = vscode.Uri.parse('output:/extension/secrets.log');
        const selection = new vscode.Selection(0, 0, 0, 6);
        const activeEditor = {
            document: {
                uri: virtualUri,
                languageId: 'log',
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
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const context = await getEditorContext({ includeSelectedText: true, includeVisibleEditors: true });

        assert.strictEqual(context.activeEditor, undefined);
        assert.deepStrictEqual(context.visibleEditors, []);
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
