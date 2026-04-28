import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { EditorAnnotationService } from '../editor/annotation-service';

suite('Editor Annotation Service', () => {
    teardown(() => {
        sinon.restore();
    });

    test('path-limited clear removes both highlights and callouts for the id', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: {
                uri: documentUri,
                lineAt: sinon.stub().withArgs(0).returns({ range: new vscode.Range(0, 0, 0, 18) })
            },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const highlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const calloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(highlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(calloutDecorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = new EditorAnnotationService();
        await service.setHighlights({
            id: 'current',
            ranges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }]
        });
        await service.setInlineCallout({
            id: 'current',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Note',
            message: 'Same path.'
        });

        await service.clearAnnotations({ id: 'current', path: 'src/example.ts' });

        const lastHighlightCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === highlightDecorationType).at(-1);
        const lastCalloutCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === calloutDecorationType).at(-1);
        assert.ok(lastHighlightCall, 'highlight decorations were not cleared');
        assert.ok(lastCalloutCall, 'callout decorations were not cleared');
        assert.strictEqual(lastHighlightCall.args[1].length, 0);
        assert.strictEqual(lastCalloutCall.args[1].length, 0);
    });

    test('clears one annotation id while preserving other groups', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const highlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const calloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(highlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(calloutDecorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = new EditorAnnotationService();
        await service.setHighlights({
            id: 'current',
            ranges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }]
        });
        await service.setHighlights({
            id: 'related',
            ranges: [{ start: { line: 2, character: 0 }, end: { line: 2, character: 4 } }]
        });

        const result = await service.clearAnnotations({ id: 'current' });

        assert.strictEqual(result.clearedIds, 1);
        const lastHighlightCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === highlightDecorationType).at(-1);
        assert.ok(lastHighlightCall, 'highlight decorations were not reapplied');
        assert.strictEqual(lastHighlightCall.args[1].length, 1);
        const remainingRange = lastHighlightCall.args[1][0] as vscode.Range;
        assert.strictEqual(remainingRange.start.line, 1);
    });

    test('sets visible inline callouts by id without changing selection', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const originalSelection = new vscode.Selection(0, 0, 0, 0);
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: {
                uri: documentUri,
                lineAt: sinon.stub().withArgs(1).returns({ range: new vscode.Range(1, 0, 1, 24) })
            },
            selection: originalSelection,
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const highlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const calloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(highlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(calloutDecorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = new EditorAnnotationService();

        await service.setInlineCallout({
            range: { start: { line: 2, character: 4 }, end: { line: 2, character: 10 } },
            title: 'Factory',
            message: 'Builds the server instance.'
        });

        const calloutOptions = setDecorationsSpy.lastCall.args[1] as vscode.DecorationOptions[];
        assert.strictEqual(setDecorationsSpy.lastCall.args[0], calloutDecorationType);
        assert.strictEqual(calloutOptions.length, 1);
        assert.strictEqual(calloutOptions[0].range.start.line, 1);
        assert.strictEqual(calloutOptions[0].range.start.character, 24);
        assert.strictEqual(calloutOptions[0].renderOptions?.after?.contentText, '  Factory: Builds the server instance.');
        assert.strictEqual(activeEditor.selection, originalSelection);
    });

    test('sets multi-range highlights by id and replaces that id by default without changing selection', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const originalSelection = new vscode.Selection(0, 0, 0, 0);
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: { uri: documentUri },
            selection: originalSelection,
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = new EditorAnnotationService();

        await service.setHighlights({
            ranges: [
                { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
                { start: { line: 2, character: 2 }, end: { line: 2, character: 8 } }
            ]
        });

        assert.strictEqual(setDecorationsSpy.calledOnce, true, 'highlight decorations were not applied');
        assert.strictEqual(setDecorationsSpy.firstCall.args[0], decorationType);
        assert.strictEqual(setDecorationsSpy.firstCall.args[1].length, 2);
        assert.strictEqual(activeEditor.selection, originalSelection);

        await service.setHighlights({
            ranges: [
                { start: { line: 3, character: 1 }, end: { line: 3, character: 5 } }
            ]
        });

        assert.strictEqual(setDecorationsSpy.lastCall.args[1].length, 1, 'replacement did not narrow the current highlight group');
        const replacementRange = setDecorationsSpy.lastCall.args[1][0] as vscode.Range;
        assert.strictEqual(replacementRange.start.line, 2);
        assert.strictEqual(replacementRange.start.character, 1);
        assert.strictEqual(activeEditor.selection, originalSelection);
    });
});
