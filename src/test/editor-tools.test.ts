import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { disposeEditorAnnotationService } from '../editor/annotation-service';
import { registerEditorTools } from '../tools/editor-tools';

suite('Editor MCP Tools', () => {
    setup(() => {
        sinon.stub(vscode.window, 'onDidChangeVisibleTextEditors').returns({ dispose: sinon.spy() } as unknown as vscode.Disposable);
    });

    teardown(() => {
        disposeEditorAnnotationService();
        sinon.restore();
    });

    function createEditorToolServer() {
        const registeredTools: Array<{ name: string; handler: (args: any) => Promise<any> }> = [];
        const server = {
            tool: (name: string, _description: string, _schema: unknown, handler: (args: any) => Promise<any>) => {
                registeredTools.push({ name, handler });
            }
        };

        registerEditorTools(server as any);
        return registeredTools;
    }

    test('registers get_editor_context_code and returns serialized editor context', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const selection = new vscode.Selection(0, 1, 0, 4);
        const activeEditor = {
            document: {
                uri: documentUri,
                languageId: 'typescript',
                lineCount: 3,
                isDirty: false,
                getText: sinon.stub().withArgs(selection).returns('foo')
            },
            selection,
            selections: [selection],
            visibleRanges: [new vscode.Range(0, 0, 2, 0)]
        } as unknown as vscode.TextEditor;

        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'get_editor_context_code');
        assert.ok(tool, 'get_editor_context_code was not registered');

        const result = await tool.handler({ includeSelectedText: true });
        const payload = JSON.parse(result.content[0].text);

        assert.strictEqual(payload.activeEditor.path, 'src/example.ts');
        assert.strictEqual(payload.activeEditor.selection.selectedText, 'foo');
    });

    test('registers go_to_definition_code and returns navigated location', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const sourceUri = vscode.Uri.file('/workspace/src/source.ts');
        const definitionUri = vscode.Uri.file('/workspace/src/definition.ts');
        const definitionRange = new vscode.Range(2, 1, 2, 8);
        const definitionEditor = {
            document: { uri: definitionUri },
            revealRange: sinon.spy()
        } as unknown as vscode.TextEditor;

        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'visibleTextEditors').value([]);
        sinon.stub(vscode.commands, 'executeCommand').resolves([new vscode.Location(definitionUri, definitionRange)]);
        (sinon.stub(vscode.workspace, 'openTextDocument') as sinon.SinonStub).resolves({ uri: definitionUri } as vscode.TextDocument);
        sinon.stub(vscode.window, 'showTextDocument').resolves(definitionEditor);

        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'go_to_definition_code');
        assert.ok(tool, 'go_to_definition_code was not registered');

        const result = await tool.handler({
            path: 'src/source.ts',
            position: { line: 1, character: 3 }
        });
        const payload = JSON.parse(result.content[0].text);

        assert.strictEqual(payload.path, 'src/definition.ts');
        assert.deepStrictEqual(payload.range, {
            start: { line: 3, character: 1 },
            end: { line: 3, character: 8 }
        });
        assert.strictEqual((vscode.commands.executeCommand as sinon.SinonStub).firstCall.args[1].toString(), sourceUri.toString());
    });

    test('registers clear_annotations_code and returns clear summary', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const registeredTools = createEditorToolServer();
        const setHighlight = registeredTools.find(registered => registered.name === 'set_highlight_code');
        const clear = registeredTools.find(registered => registered.name === 'clear_annotations_code');
        assert.ok(setHighlight, 'set_highlight_code was not registered');
        assert.ok(clear, 'clear_annotations_code was not registered');

        await setHighlight.handler({
            ranges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }]
        });
        const result = await clear.handler({});
        const payload = JSON.parse(result.content[0].text);

        assert.strictEqual(payload.clearedIds, 1);
        assert.deepStrictEqual(payload.clearedPaths, ['src/example.ts']);
    });

    test('registers set_inline_callout_code and returns annotation summary', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: {
                uri: documentUri,
                lineAt: sinon.stub().withArgs(0).returns({ range: new vscode.Range(0, 0, 0, 20) })
            },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'set_inline_callout_code');
        assert.ok(tool, 'set_inline_callout_code was not registered');

        const result = await tool.handler({
            title: 'Factory',
            message: 'Builds the server instance.',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }
        });
        const payload = JSON.parse(result.content[0].text);

        assert.strictEqual(payload.id, 'current');
        assert.deepStrictEqual(payload.paths, ['src/example.ts']);
        assert.strictEqual(payload.rangeCount, 1);
    });

    test('registers set_hover_note_code and returns hover note summary', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'set_hover_note_code');
        assert.ok(tool, 'set_hover_note_code was not registered');

        const result = await tool.handler({
            title: 'Word note',
            message: 'Complementary hover information.',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }
        });
        const payload = JSON.parse(result.content[0].text);

        assert.strictEqual(payload.id, 'current');
        assert.deepStrictEqual(payload.paths, ['src/example.ts']);
        assert.strictEqual(payload.rangeCount, 1);
    });

    test('registers set_codelens_note_code and returns note summary', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const codeLensProviderDisposable = { dispose: sinon.spy() } as unknown as vscode.Disposable;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.languages, 'registerCodeLensProvider').returns(codeLensProviderDisposable);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'set_codelens_note_code');
        assert.ok(tool, 'set_codelens_note_code was not registered');

        const result = await tool.handler({
            title: 'Step 1: schema',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }
        });
        const payload = JSON.parse(result.content[0].text);

        assert.strictEqual(payload.id, 'current');
        assert.deepStrictEqual(payload.paths, ['src/example.ts']);
        assert.strictEqual(payload.rangeCount, 1);
    });

    test('registers set_explanation_comment_code and returns comment summary', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const thread = { dispose: sinon.spy(), canReply: true } as unknown as vscode.CommentThread;
        const controller = {
            id: 'guided-explanation',
            label: 'Guided Explanation',
            createCommentThread: sinon.stub().returns(thread),
            dispose: sinon.spy()
        } as unknown as vscode.CommentController;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.comments, 'createCommentController').returns(controller);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'set_explanation_comment_code');
        assert.ok(tool, 'set_explanation_comment_code was not registered');

        const result = await tool.handler({
            title: 'Guided note',
            body: 'Longer **markdown** note.',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }
        });
        const payload = JSON.parse(result.content[0].text);

        assert.strictEqual(payload.id, 'current');
        assert.deepStrictEqual(payload.paths, ['src/example.ts']);
        assert.strictEqual(payload.rangeCount, 1);
    });

    test('registers set_gutter_marker_code and returns marker summary', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'set_gutter_marker_code');
        assert.ok(tool, 'set_gutter_marker_code was not registered');

        const result = await tool.handler({
            kind: 'warning',
            label: 'Risky branch',
            lines: [1, 2]
        });
        const payload = JSON.parse(result.content[0].text);

        assert.strictEqual(payload.id, 'current');
        assert.deepStrictEqual(payload.paths, ['src/example.ts']);
        assert.strictEqual(payload.rangeCount, 2);
    });

    test('registers set_highlight_code and returns annotation summary', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'set_highlight_code');
        assert.ok(tool, 'set_highlight_code was not registered');

        const result = await tool.handler({
            ranges: [
                { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
                { start: { line: 2, character: 1 }, end: { line: 2, character: 5 } }
            ]
        });
        const payload = JSON.parse(result.content[0].text);

        assert.strictEqual(payload.id, 'current');
        assert.deepStrictEqual(payload.paths, ['src/example.ts']);
        assert.strictEqual(payload.rangeCount, 2);
    });

    test('registers reveal_range_code and returns revealed location', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            revealRange: sinon.spy()
        } as unknown as vscode.TextEditor;

        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'reveal_range_code');
        assert.ok(tool, 'reveal_range_code was not registered');

        const result = await tool.handler({
            range: {
                start: { line: 1, character: 2 },
                end: { line: 1, character: 5 }
            }
        });
        const payload = JSON.parse(result.content[0].text);

        assert.strictEqual(payload.path, 'src/example.ts');
        assert.deepStrictEqual(payload.range, {
            start: { line: 1, character: 2 },
            end: { line: 1, character: 5 }
        });
    });
});
