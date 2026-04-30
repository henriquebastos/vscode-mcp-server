import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { z } from 'zod';
import { disposeEditorAnnotationService } from '../editor/annotation-service';
import { disposeEditorDiffService } from '../editor/diff-service';
import { FEEDBACK_ITEM_COUNT_CONTEXT, FEEDBACK_READY_CONTEXT } from '../editor/feedback-commands';
import { disposeFeedbackCaptureService, getFeedbackCaptureService } from '../editor/feedback-service';
import { registerEditorTools } from '../tools/editor-tools';

suite('Editor MCP Tools', () => {
    setup(() => {
        sinon.stub(vscode.window, 'onDidChangeVisibleTextEditors').returns({ dispose: sinon.spy() } as unknown as vscode.Disposable);
    });

    teardown(() => {
        disposeEditorAnnotationService();
        disposeEditorDiffService();
        disposeFeedbackCaptureService();
        sinon.restore();
    });

    function createEditorToolServer() {
        const registeredTools: Array<{ name: string; schema: unknown; handler: (args: any) => Promise<any> }> = [];
        const server = {
            tool: (name: string, _description: string, schema: unknown, handler: (args: any) => Promise<any>) => {
                registeredTools.push({ name, schema, handler });
            },
            registerTool: (name: string, config: { inputSchema?: unknown }, handler: (args: any) => Promise<any>) => {
                registeredTools.push({ name, schema: config.inputSchema ?? {}, handler });
            }
        };

        registerEditorTools(server as any);
        return registeredTools;
    }

    function parseToolInput(schema: unknown, input: unknown): z.SafeParseReturnType<unknown, unknown> {
        if (schema && typeof schema === 'object' && 'safeParse' in schema && typeof schema.safeParse === 'function') {
            return (schema as z.ZodTypeAny).safeParse(input);
        }

        return z.object(schema as z.ZodRawShape).safeParse(input);
    }

    test('rejects path and uri together at the MCP schema edge', () => {
        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'set_highlight_code');
        assert.ok(tool, 'set_highlight_code was not registered');

        const parsed = parseToolInput(tool.schema, {
            path: 'src/example.ts',
            uri: vscode.Uri.file('/workspace/src/example.ts').toString(),
            ranges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }]
        });

        assert.strictEqual(parsed.success, false);
        if (!parsed.success) {
            assert.ok(parsed.error.issues.some(issue => issue.message === 'Provide either path or uri, not both.'));
        }
    });

    test('rejects path and uri together on nested annotation ranges at the MCP schema edge', () => {
        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'set_highlight_code');
        assert.ok(tool, 'set_highlight_code was not registered');

        const parsed = parseToolInput(tool.schema, {
            ranges: [{
                path: 'src/example.ts',
                uri: vscode.Uri.file('/workspace/src/example.ts').toString(),
                start: { line: 1, character: 0 },
                end: { line: 1, character: 4 }
            }]
        });

        assert.strictEqual(parsed.success, false);
        if (!parsed.success) {
            assert.ok(parsed.error.issues.some(issue => issue.message === 'Provide either path or uri for an annotation range, not both.'));
        }
    });

    test('rejects invalid annotation kind and line numbers at the MCP schema edge', () => {
        const registeredTools = createEditorToolServer();
        const highlight = registeredTools.find(registered => registered.name === 'set_highlight_code');
        const gutter = registeredTools.find(registered => registered.name === 'set_gutter_marker_code');
        assert.ok(highlight, 'set_highlight_code was not registered');
        assert.ok(gutter, 'set_gutter_marker_code was not registered');

        assert.strictEqual(parseToolInput(highlight.schema, {
            kind: 'invalid',
            ranges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }]
        }).success, false);
        assert.strictEqual(parseToolInput(highlight.schema, {
            ranges: [{ start: { line: 0, character: 0 }, end: { line: 1, character: 4 } }]
        }).success, false);
        assert.strictEqual(parseToolInput(gutter.schema, { lines: [0] }).success, false);
    });

    test('rejects ambiguous diff source and entries modes at the MCP schema edge', () => {
        const leftUri = vscode.Uri.file('/workspace/src/old.ts');
        const rightUri = vscode.Uri.file('/workspace/src/new.ts');
        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'open_diff_code');
        assert.ok(tool, 'open_diff_code was not registered');

        const parsed = parseToolInput(tool.schema, {
            leftUri: leftUri.toString(),
            rightUri: rightUri.toString(),
            entries: [{ rightUri: rightUri.toString() }]
        });

        assert.strictEqual(parsed.success, false);
        if (!parsed.success) {
            assert.ok(parsed.error.issues.some(issue => issue.message === 'Provide exactly one diff mode: either leftUri/rightUri source mode or entries explicit mode.'));
        }
    });

    test('rejects incomplete diff modes at the MCP schema edge', () => {
        const leftUri = vscode.Uri.file('/workspace/src/old.ts');
        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'open_diff_code');
        assert.ok(tool, 'open_diff_code was not registered');

        assert.strictEqual(parseToolInput(tool.schema, { leftUri: leftUri.toString() }).success, false);
        assert.strictEqual(parseToolInput(tool.schema, { entries: [] }).success, false);
        assert.strictEqual(parseToolInput(tool.schema, { entries: [{ label: 'empty entry' }] }).success, false);
    });

    test('accepts one-sided explicit diff entries at the MCP schema edge', () => {
        const rightUri = vscode.Uri.file('/workspace/src/added.ts');
        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'open_diff_code');
        assert.ok(tool, 'open_diff_code was not registered');

        const parsed = parseToolInput(tool.schema, {
            entries: [{ label: 'Added file', rightUri: rightUri.toString() }]
        });

        assert.strictEqual(parsed.success, true);
    });

    test('registers open_diff_code and returns a native changes editor diff result', async () => {
        const leftUri = vscode.Uri.file('/workspace/src/old.ts');
        const rightUri = vscode.Uri.file('/workspace/src/new.ts');
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();

        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'open_diff_code');
        assert.ok(tool, 'open_diff_code was not registered');

        const result = await tool.handler({
            title: 'Review diff',
            entries: [{ label: 'old vs new', leftUri: leftUri.toString(), rightUri: rightUri.toString() }]
        });
        const payload = JSON.parse(result.content[0].text);

        assert.ok(payload.diffId.startsWith('diff-'));
        assert.strictEqual(payload.title, 'Review diff');
        assert.strictEqual(payload.count, 1);
        assert.deepStrictEqual(payload.entries, [{ label: 'old vs new', leftUri: leftUri.toString(), rightUri: rightUri.toString() }]);
        assert.strictEqual(executeCommandStub.firstCall.args[0], 'vscode.changes');
    });

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

    test('registers get_feedback_code and returns ready feedback without clearing it', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const selection = new vscode.Selection(0, 0, 0, 6);
        const activeEditor = {
            document: {
                uri: documentUri,
                languageId: 'typescript',
                lineCount: 1,
                isDirty: false,
                getText: sinon.stub().withArgs(selection).returns('sample')
            },
            selection,
            selections: [selection],
            visibleRanges: [new vscode.Range(0, 0, 0, 6)],
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);
        await getFeedbackCaptureService().addFeedback({ feedbackText: 'Please check this.' });
        await getFeedbackCaptureService().finishFeedback();

        const registeredTools = createEditorToolServer();
        const tool = registeredTools.find(registered => registered.name === 'get_feedback_code');
        assert.ok(tool, 'get_feedback_code was not registered');

        const firstResult = await tool.handler({});
        const secondResult = await tool.handler({});
        const firstPayload = JSON.parse(firstResult.content[0].text);
        const secondPayload = JSON.parse(secondResult.content[0].text);

        assert.strictEqual(firstPayload.status, 'ready');
        assert.strictEqual(firstPayload.count, 1);
        assert.strictEqual(firstPayload.items[0].feedback, 'Please check this.');
        assert.deepStrictEqual(secondPayload, firstPayload);
    });

    test('registers drain_feedback_code and prevents duplicate ready-session processing', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const selection = new vscode.Selection(0, 0, 0, 6);
        const activeEditor = {
            document: {
                uri: documentUri,
                languageId: 'typescript',
                lineCount: 1,
                isDirty: false,
                getText: sinon.stub().withArgs(selection).returns('sample')
            },
            selection,
            selections: [selection],
            visibleRanges: [new vscode.Range(0, 0, 0, 6)],
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);
        await getFeedbackCaptureService().addFeedback({ feedbackText: 'Please check this.' });
        await getFeedbackCaptureService().finishFeedback();

        const registeredTools = createEditorToolServer();
        const drain = registeredTools.find(registered => registered.name === 'drain_feedback_code');
        const get = registeredTools.find(registered => registered.name === 'get_feedback_code');
        assert.ok(drain, 'drain_feedback_code was not registered');
        assert.ok(get, 'get_feedback_code was not registered');

        const result = await drain.handler({});
        const payload = JSON.parse(result.content[0].text);
        const getAfterDrain = JSON.parse((await get.handler({})).content[0].text);

        assert.strictEqual(payload.status, 'ready');
        assert.strictEqual(payload.count, 1);
        assert.strictEqual(payload.items[0].feedback, 'Please check this.');
        assert.strictEqual(getAfterDrain.status, 'drained');
        const markerClearCall = (activeEditor.setDecorations as sinon.SinonSpy).getCalls()
            .filter(call => call.args[0] === decorationType)
            .at(-1);
        assert.ok(markerClearCall, 'drain should clear feedback markers');
        assert.strictEqual(markerClearCall.args[1].length, 0);
        const feedbackReadyCalls = executeCommandStub.getCalls()
            .filter(call => call.args[0] === 'setContext' && call.args[1] === FEEDBACK_READY_CONTEXT)
            .map(call => call.args[2]);
        const feedbackCountCalls = executeCommandStub.getCalls()
            .filter(call => call.args[0] === 'setContext' && call.args[1] === FEEDBACK_ITEM_COUNT_CONTEXT)
            .map(call => call.args[2]);
        assert.strictEqual(feedbackReadyCalls.at(-1), false, 'drain should clear the ready context key');
        assert.strictEqual(feedbackCountCalls.at(-1), 0, 'drain should clear the feedback count context key');
        await assert.rejects(
            () => drain.handler({}),
            /No ready feedback session/
        );
    });

    test('registers clear_feedback_code and clears draft feedback state', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const selection = new vscode.Selection(0, 0, 0, 6);
        const activeEditor = {
            document: {
                uri: documentUri,
                languageId: 'typescript',
                lineCount: 1,
                isDirty: false,
                getText: sinon.stub().withArgs(selection).returns('sample')
            },
            selection,
            selections: [selection],
            visibleRanges: [new vscode.Range(0, 0, 0, 6)],
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);
        await getFeedbackCaptureService().addFeedback({ feedbackText: 'Please check this.' });

        const registeredTools = createEditorToolServer();
        const clear = registeredTools.find(registered => registered.name === 'clear_feedback_code');
        const get = registeredTools.find(registered => registered.name === 'get_feedback_code');
        assert.ok(clear, 'clear_feedback_code was not registered');
        assert.ok(get, 'get_feedback_code was not registered');

        const clearResult = await clear.handler({ scope: 'draft' });
        const getResult = await get.handler({});
        const clearPayload = JSON.parse(clearResult.content[0].text);
        const getPayload = JSON.parse(getResult.content[0].text);

        assert.strictEqual(clearPayload.cleared, true);
        assert.strictEqual(clearPayload.session.status, 'cancelled');
        assert.strictEqual(clearPayload.session.count, 0);
        assert.strictEqual(getPayload.status, 'cancelled');
        assert.strictEqual(getPayload.count, 0);
        const feedbackReadyCalls = executeCommandStub.getCalls()
            .filter(call => call.args[0] === 'setContext' && call.args[1] === FEEDBACK_READY_CONTEXT)
            .map(call => call.args[2]);
        const feedbackCountCalls = executeCommandStub.getCalls()
            .filter(call => call.args[0] === 'setContext' && call.args[1] === FEEDBACK_ITEM_COUNT_CONTEXT)
            .map(call => call.args[2]);
        assert.strictEqual(feedbackReadyCalls.at(-1), false, 'clear should clear the ready context key');
        assert.strictEqual(feedbackCountCalls.at(-1), 0, 'clear should clear the feedback count context key');
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
