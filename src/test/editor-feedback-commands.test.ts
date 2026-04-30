import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
    FEEDBACK_ACTIVE_CONTEXT,
    FEEDBACK_ADD_COMMAND,
    FEEDBACK_CANCEL_COMMAND,
    FEEDBACK_ITEM_COUNT_CONTEXT,
    FEEDBACK_READY_CONTEXT,
    registerFeedbackCommands
} from '../editor/feedback-commands';
import { disposeFeedbackCaptureService } from '../editor/feedback-service';

suite('Editor Feedback Commands', () => {
    let handlers: Map<string, (...args: unknown[]) => Promise<void>>;

    setup(() => {
        handlers = new Map();
        sinon.stub(vscode.window, 'onDidChangeVisibleTextEditors').returns({ dispose: sinon.spy() } as unknown as vscode.Disposable);
    });

    teardown(() => {
        disposeFeedbackCaptureService();
        sinon.restore();
    });

    function stubCommandRegistration(): sinon.SinonStub {
        sinon.stub(vscode.commands, 'executeCommand').resolves();
        return sinon.stub(vscode.commands, 'registerCommand').callsFake((command: string, callback: (...args: unknown[]) => Promise<void>) => {
            handlers.set(command, callback);
            return { dispose: sinon.spy() } as unknown as vscode.Disposable;
        });
    }

    function stubSelectedWorkspaceEditor(): void {
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
        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns({ dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);
    }

    test('adds submitted feedback and refreshes active context keys', async () => {
        stubCommandRegistration();
        stubSelectedWorkspaceEditor();
        const showInputBoxStub = sinon.stub(vscode.window, 'showInputBox').resolves('First note');
        const infoStub = sinon.stub(vscode.window, 'showInformationMessage').resolves();
        sinon.stub(vscode.window, 'showWarningMessage').resolves();
        sinon.stub(vscode.window, 'showErrorMessage').resolves();
        registerFeedbackCommands();

        await handlers.get(FEEDBACK_ADD_COMMAND)?.();

        assert.strictEqual(showInputBoxStub.calledOnce, true);
        assert.strictEqual(showInputBoxStub.firstCall.args[0]?.title, 'Add Feedback');
        assert.strictEqual(infoStub.calledWith('Captured feedback 1.'), true);
        const contextCalls = (vscode.commands.executeCommand as sinon.SinonStub).getCalls()
            .filter(call => call.args[0] === 'setContext')
            .map(call => [call.args[1], call.args[2]]);
        assert.deepStrictEqual(contextCalls.slice(-3), [
            [FEEDBACK_ACTIVE_CONTEXT, true],
            [FEEDBACK_READY_CONTEXT, false],
            [FEEDBACK_ITEM_COUNT_CONTEXT, 1]
        ]);
    });

    test('confirms before cancelling multiple captured feedback items', async () => {
        stubCommandRegistration();
        stubSelectedWorkspaceEditor();
        const showInputBoxStub = sinon.stub(vscode.window, 'showInputBox');
        showInputBoxStub.onFirstCall().resolves('First note');
        showInputBoxStub.onSecondCall().resolves('Second note');
        const warningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves('Discard Feedback' as any);
        sinon.stub(vscode.window, 'showInformationMessage').resolves();
        sinon.stub(vscode.window, 'showErrorMessage').resolves();
        registerFeedbackCommands();

        await handlers.get(FEEDBACK_ADD_COMMAND)?.();
        await handlers.get(FEEDBACK_ADD_COMMAND)?.();
        await handlers.get(FEEDBACK_CANCEL_COMMAND)?.();

        assert.strictEqual(warningStub.calledOnce, true, 'Cancel Feedback should confirm before discarding multiple items');
        assert.ok(String(warningStub.firstCall.args[0]).includes('2'), 'confirmation should include the item count');
        const contextCalls = (vscode.commands.executeCommand as sinon.SinonStub).getCalls()
            .filter(call => call.args[0] === 'setContext' && call.args[1] === FEEDBACK_ITEM_COUNT_CONTEXT)
            .map(call => call.args[2]);
        assert.strictEqual(contextCalls.at(-1), 0, 'confirmed cancel should clear the feedback count context');
    });
});
