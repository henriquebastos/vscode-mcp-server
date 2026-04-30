import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { FeedbackCaptureService, disposeFeedbackCaptureService } from '../editor/feedback-service';
import { disposeEditorDiffService, getEditorDiffService } from '../editor/diff-service';

suite('Editor Feedback Capture Service', () => {
    let services: FeedbackCaptureService[] = [];

    setup(() => {
        services = [];
        sinon.stub(vscode.window, 'onDidChangeVisibleTextEditors').returns({ dispose: sinon.spy() } as unknown as vscode.Disposable);
    });

    teardown(() => {
        for (const service of [...services].reverse()) {
            service.dispose();
        }
        services = [];
        disposeFeedbackCaptureService();
        disposeEditorDiffService();
        sinon.restore();
    });

    function createFeedbackService(): FeedbackCaptureService {
        const service = new FeedbackCaptureService({
            createSessionId: () => 'feedback-session-1',
            createItemId: () => 'feedback-item-1',
            now: () => new Date('2026-04-29T21:30:00.000Z')
        });
        services.push(service);
        return service;
    }

    function stubWorkspaceEditor(selectedText = 'sample') {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const selection = new vscode.Selection(1, 2, 1, 8);
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: {
                uri: documentUri,
                languageId: 'typescript',
                lineCount: 12,
                isDirty: true,
                getText: sinon.stub().withArgs(selection).returns(selectedText)
            },
            selection,
            selections: [selection],
            visibleRanges: [new vscode.Range(0, 0, 4, 20)],
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        return { activeEditor, decorationType, documentUri, selection, setDecorationsSpy };
    }

    test('captures a workspace editor selection as a draft feedback item with a temporary marker', async () => {
        const { activeEditor, decorationType, documentUri, selection, setDecorationsSpy } = stubWorkspaceEditor();

        const service = createFeedbackService();
        const session = await service.addFeedback({ feedbackText: 'Please rename this variable.' });

        assert.strictEqual(session.id, 'feedback-session-1');
        assert.strictEqual(session.status, 'draft');
        assert.strictEqual(session.count, 1);
        assert.strictEqual(session.items[0].id, 'feedback-item-1');
        assert.strictEqual(session.items[0].order, 1);
        assert.strictEqual(session.items[0].createdAt, '2026-04-29T21:30:00.000Z');
        assert.strictEqual(session.items[0].uri, documentUri.toString());
        assert.strictEqual(session.items[0].path, 'src/example.ts');
        assert.deepStrictEqual(session.items[0].range, {
            start: { line: 2, character: 2 },
            end: { line: 2, character: 8 }
        });
        assert.strictEqual(session.items[0].selectedText, 'sample');
        assert.strictEqual(session.items[0].selectedTextTruncated, false);
        assert.strictEqual(session.items[0].feedback, 'Please rename this variable.');
        assert.strictEqual(session.items[0].languageId, 'typescript');
        assert.strictEqual(session.items[0].lineCount, 12);
        assert.strictEqual(session.items[0].isDirty, true);

        const markerCall = setDecorationsSpy.getCalls().find(call => call.args[0] === decorationType && call.args[1].length === 1);
        assert.ok(markerCall, 'feedback marker decoration was not applied');
        assert.strictEqual(markerCall.args[1][0].range.start.line, 1);
        assert.strictEqual(markerCall.args[1][0].range.start.character, 2);
        assert.strictEqual(markerCall.args[1][0].range.end.character, 8);
        assert.strictEqual(markerCall.args[1][0].hoverMessage.value.includes('Please rename this variable'), true);
        assert.strictEqual(activeEditor.selection, selection, 'feedback capture should not mutate the selection');
    });

    test('preserves multiple feedback item ids and capture order in one draft session', async () => {
        const { decorationType, setDecorationsSpy } = stubWorkspaceEditor();
        const ids = ['feedback-item-1', 'feedback-item-2'];
        const service = new FeedbackCaptureService({
            createSessionId: () => 'feedback-session-1',
            createItemId: () => ids.shift() ?? 'unexpected-id',
            now: () => new Date('2026-04-29T21:30:00.000Z')
        });
        services.push(service);

        await service.addFeedback({ feedbackText: 'First note.' });
        const session = await service.addFeedback({ feedbackText: 'Second note.' });

        assert.strictEqual(session.count, 2);
        assert.deepStrictEqual(session.items.map(item => item.id), ['feedback-item-1', 'feedback-item-2']);
        assert.deepStrictEqual(session.items.map(item => item.order), [1, 2]);
        assert.deepStrictEqual(session.items.map(item => item.feedback), ['First note.', 'Second note.']);
        const markerCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === decorationType).at(-1);
        assert.ok(markerCall, 'feedback markers were not applied');
        assert.strictEqual(markerCall.args[1].length, 2);
    });

    test('finishes a draft session while preserving items and visible markers', async () => {
        const { decorationType, setDecorationsSpy } = stubWorkspaceEditor();
        const service = createFeedbackService();
        await service.addFeedback({ feedbackText: 'Please rename this variable.' });

        const ready = await service.finishFeedback();

        assert.strictEqual(ready.status, 'ready');
        assert.strictEqual(ready.count, 1);
        assert.strictEqual(ready.items[0].feedback, 'Please rename this variable.');
        const markerCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === decorationType && call.args[1].length === 1).at(-1);
        assert.ok(markerCall, 'ready feedback marker should remain visible');
    });

    test('cancels a draft session and clears feedback markers', async () => {
        const { decorationType, setDecorationsSpy } = stubWorkspaceEditor();
        const service = createFeedbackService();
        await service.addFeedback({ feedbackText: 'Please rename this variable.' });

        const cancelled = await service.cancelFeedback();

        assert.strictEqual(cancelled.status, 'cancelled');
        assert.strictEqual(cancelled.count, 0);
        assert.deepStrictEqual(cancelled.items, []);
        const clearCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === decorationType).at(-1);
        assert.ok(clearCall, 'feedback marker decoration was not cleared');
        assert.strictEqual(clearCall.args[1].length, 0);
    });

    test('truncates selected text when it exceeds the capture limit', async () => {
        stubWorkspaceEditor('abcdef');
        const service = createFeedbackService();

        const session = await service.addFeedback({
            feedbackText: 'This selection is too large.',
            maxSelectedTextCharacters: 3
        });

        assert.strictEqual(session.items[0].selectedText, 'abc');
        assert.strictEqual(session.items[0].selectedTextTruncated, true);
    });

    test('dispose clears markers and releases VS Code disposables', async () => {
        const { decorationType, setDecorationsSpy } = stubWorkspaceEditor();
        const service = new FeedbackCaptureService({
            createSessionId: () => 'feedback-session-1',
            createItemId: () => 'feedback-item-1',
            now: () => new Date('2026-04-29T21:30:00.000Z')
        });
        const visibleEditorDisposable = (vscode.window.onDidChangeVisibleTextEditors as sinon.SinonStub).firstCall.returnValue as vscode.Disposable;
        await service.addFeedback({ feedbackText: 'Temporary note.' });

        service.dispose();

        const clearCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === decorationType).at(-1);
        assert.ok(clearCall, 'dispose did not clear feedback markers');
        assert.strictEqual(clearCall.args[1].length, 0);
        assert.strictEqual((decorationType.dispose as sinon.SinonSpy).calledOnce, true);
        assert.strictEqual((visibleEditorDisposable.dispose as sinon.SinonSpy).calledOnce, true);
    });

    test('rejects missing, empty, and unsafe editor selections', async () => {
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.window, 'activeTextEditor').value(undefined);
        sinon.stub(vscode.window, 'visibleTextEditors').value([]);
        const service = createFeedbackService();

        await assert.rejects(
            () => service.addFeedback({ feedbackText: 'No editor.' }),
            /No active editor/
        );

        const emptySelection = new vscode.Selection(0, 0, 0, 0);
        const unsafeSelection = new vscode.Selection(0, 0, 0, 6);
        const emptyEditor = {
            document: {
                uri: vscode.Uri.file('/workspace/src/example.ts'),
                languageId: 'typescript',
                lineCount: 1,
                isDirty: false,
                getText: sinon.stub().returns('')
            },
            selection: emptySelection
        } as unknown as vscode.TextEditor;
        const unsafeEditor = {
            document: {
                uri: vscode.Uri.parse('output:/extension/secrets.log'),
                languageId: 'log',
                lineCount: 1,
                isDirty: false,
                getText: sinon.stub().withArgs(unsafeSelection).returns('secret')
            },
            selection: unsafeSelection
        } as unknown as vscode.TextEditor;

        await assert.rejects(
            () => service.addFeedback({ editor: emptyEditor, feedbackText: 'Empty.' }),
            /Select a non-empty range/
        );
        await assert.rejects(
            () => service.addFeedback({ editor: unsafeEditor, feedbackText: 'Unsafe.' }),
            /Feedback capture is not available/
        );
    });

    test('captures registered diff-side metadata even when no workspace path is available', async () => {
        const leftUri = vscode.Uri.file('/review/base/example.ts');
        const rightUri = vscode.Uri.file('/review/head/example.ts');
        const selection = new vscode.Selection(0, 0, 0, 7);
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: {
                uri: rightUri,
                languageId: 'typescript',
                lineCount: 2,
                isDirty: false,
                getText: sinon.stub().withArgs(selection).returns('newCode')
            },
            selection,
            selections: [selection],
            visibleRanges: [new vscode.Range(0, 0, 1, 0)],
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        sinon.stub(vscode.commands, 'executeCommand').resolves();
        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);
        const opened = await getEditorDiffService().openDiff({
            title: 'Review diff',
            entries: [{ label: 'example.ts', leftUri: leftUri.toString(), rightUri: rightUri.toString() }]
        });
        const service = createFeedbackService();

        const session = await service.addFeedback({ feedbackText: 'Check the new behavior.' });

        assert.strictEqual(session.items[0].path, undefined);
        assert.deepStrictEqual(session.items[0].diff, {
            diffId: opened.diffId,
            entryIndex: 0,
            label: 'example.ts',
            side: 'right'
        });
        assert.strictEqual(session.items[0].selectedText, 'newCode');
        assert.ok(setDecorationsSpy.called, 'diff feedback marker was not applied');
    });

    test('distinguishes feedback captured from the left side of a registered diff', async () => {
        const leftUri = vscode.Uri.file('/review/base/example.ts');
        const rightUri = vscode.Uri.file('/review/head/example.ts');
        const selection = new vscode.Selection(0, 0, 0, 7);
        const activeEditor = {
            document: {
                uri: leftUri,
                languageId: 'typescript',
                lineCount: 2,
                isDirty: false,
                getText: sinon.stub().withArgs(selection).returns('oldCode')
            },
            selection,
            selections: [selection],
            visibleRanges: [new vscode.Range(0, 0, 1, 0)],
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        sinon.stub(vscode.commands, 'executeCommand').resolves();
        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);
        const opened = await getEditorDiffService().openDiff({
            title: 'Review diff',
            entries: [{ label: 'example.ts', leftUri: leftUri.toString(), rightUri: rightUri.toString() }]
        });
        const service = createFeedbackService();

        const session = await service.addFeedback({ feedbackText: 'This old behavior matters.' });

        assert.deepStrictEqual(session.items[0].diff, {
            diffId: opened.diffId,
            entryIndex: 0,
            label: 'example.ts',
            side: 'left'
        });
        assert.strictEqual(session.items[0].selectedText, 'oldCode');
    });
});
