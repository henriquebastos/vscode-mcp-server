import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { createWorkspaceFile, replaceWorkspaceFileLines } from '../tools/edit-tools';

suite('Edit Tools', () => {
    teardown(() => {
        sinon.restore();
    });

    test('rejects traversal before creating files', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const applyEditStub = sinon.stub(vscode.workspace, 'applyEdit').resolves(true);
        const openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves({} as vscode.TextDocument);
        const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves({} as vscode.TextEditor);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);

        await assert.rejects(
            () => createWorkspaceFile('../secret.ts', 'secret'),
            /Path must stay within the workspace: \.\.\/secret\.ts/
        );
        assert.strictEqual(applyEditStub.notCalled, true, 'unsafe create should not apply edits');
        assert.strictEqual(openTextDocumentStub.notCalled, true, 'unsafe create should not open documents');
        assert.strictEqual(showTextDocumentStub.notCalled, true, 'unsafe create should not show documents');
    });

    test('rejects traversal before replacing file lines', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves({} as vscode.TextDocument);
        const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves({} as vscode.TextEditor);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);

        await assert.rejects(
            () => replaceWorkspaceFileLines('../secret.ts', 0, 0, 'next', 'old'),
            /Path must stay within the workspace: \.\.\/secret\.ts/
        );
        assert.strictEqual(openTextDocumentStub.notCalled, true, 'unsafe replace should not open documents');
        assert.strictEqual(showTextDocumentStub.notCalled, true, 'unsafe replace should not show documents');
    });

    test('keeps original-code mismatch failure clear', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const document = {
            uri: vscode.Uri.file('/workspace/src/file.ts'),
            lineCount: 1,
            lineAt: sinon.stub().withArgs(0).returns({ text: 'current', range: new vscode.Range(0, 0, 0, 7) }),
            save: sinon.stub().resolves(true)
        } as unknown as vscode.TextDocument;
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.workspace, 'openTextDocument').resolves(document);
        sinon.stub(vscode.window, 'activeTextEditor').value(undefined);
        const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves({} as vscode.TextEditor);

        await assert.rejects(
            () => replaceWorkspaceFileLines('src/file.ts', 0, 0, 'next', 'expected'),
            /Original code validation failed\. The current content does not match the provided original code\./
        );
        assert.strictEqual(showTextDocumentStub.notCalled, true, 'mismatch should fail before showing the document');
    });
});
