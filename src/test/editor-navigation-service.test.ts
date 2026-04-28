import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { goToDefinition, revealRange } from '../editor/navigation-service';

suite('Editor Navigation Service', () => {
    teardown(() => {
        sinon.restore();
    });

    test('navigates to the first definition and returns its location', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const sourceUri = vscode.Uri.file('/workspace/src/source.ts');
        const definitionUri = vscode.Uri.file('/workspace/src/definition.ts');
        const definitionRange = new vscode.Range(4, 2, 4, 12);
        const definitionRevealRangeSpy = sinon.spy();
        const definitionEditor = {
            document: { uri: definitionUri },
            revealRange: definitionRevealRangeSpy
        } as unknown as vscode.TextEditor;

        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'visibleTextEditors').value([]);
        sinon.stub(vscode.commands, 'executeCommand').withArgs(
            'vscode.executeDefinitionProvider',
            sourceUri,
            sinon.match.instanceOf(vscode.Position)
        ).resolves([new vscode.Location(definitionUri, definitionRange)]);
        (sinon.stub(vscode.workspace, 'openTextDocument') as sinon.SinonStub).callsFake(async (uriOrFileName: vscode.Uri | string) => {
            assert.strictEqual((uriOrFileName as vscode.Uri).toString(), definitionUri.toString());
            return { uri: definitionUri } as vscode.TextDocument;
        });
        sinon.stub(vscode.window, 'showTextDocument').resolves(definitionEditor);

        const location = await goToDefinition({
            path: 'src/source.ts',
            position: { line: 3, character: 5 }
        });

        assert.strictEqual(location.path, 'src/definition.ts');
        assert.deepStrictEqual(location.range, {
            start: { line: 5, character: 2 },
            end: { line: 5, character: 12 }
        });
        assert.strictEqual(definitionRevealRangeSpy.calledOnce, true, 'definition range was not revealed');
    });

    test('reveals a precise range in the active editor without changing selection', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const originalSelection = new vscode.Selection(0, 0, 0, 0);
        const revealRangeSpy = sinon.spy();
        const activeEditor = {
            document: { uri: documentUri },
            selection: originalSelection,
            revealRange: revealRangeSpy
        } as unknown as vscode.TextEditor;

        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const location = await revealRange({
            range: {
                start: { line: 2, character: 3 },
                end: { line: 2, character: 8 }
            }
        });

        assert.strictEqual(location.path, 'src/example.ts');
        assert.deepStrictEqual(location.range, {
            start: { line: 2, character: 3 },
            end: { line: 2, character: 8 }
        });
        assert.strictEqual(activeEditor.selection, originalSelection);
        assert.strictEqual(revealRangeSpy.calledOnce, true, 'revealRange was not called');
        const revealedRange = revealRangeSpy.firstCall.args[0] as vscode.Range;
        assert.strictEqual(revealedRange.start.line, 1);
        assert.strictEqual(revealedRange.start.character, 3);
        assert.strictEqual(revealedRange.end.line, 1);
        assert.strictEqual(revealedRange.end.character, 8);
    });
});
