import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { getSymbolHoverInfo, registerSymbolTools } from '../tools/symbol-tools';

suite('Symbol MCP Tools', () => {
    teardown(() => {
        sinon.restore();
    });

    function createSymbolToolServer() {
        const registeredTools: Array<{ name: string; handler: (args: any) => Promise<any> }> = [];
        const server = {
            tool: (name: string, _description: string, _schema: unknown, handler: (args: any) => Promise<any>) => {
                registeredTools.push({ name, handler });
            }
        };

        registerSymbolTools(server as any);
        return registeredTools;
    }

    test('converts unknown hover content values to strings', async () => {
        const uri = vscode.Uri.file('/workspace/src/example.ts');
        sinon.stub(vscode.commands, 'executeCommand').resolves([
            { contents: [{ value: 42 }] } as unknown as vscode.Hover
        ]);

        const result = await getSymbolHoverInfo(uri, new vscode.Position(0, 0));

        assert.deepStrictEqual(result.hovers[0].contents, ['42']);
    });

    test('rejects traversal before document symbol filesystem lookup', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const statStub = sinon.stub().resolves({
            type: vscode.FileType.File,
            ctime: 0,
            mtime: 0,
            size: 1
        });
        sinon.stub(vscode.workspace, 'fs').value({ stat: statStub });
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves([]);

        const registeredTools = createSymbolToolServer();
        const tool = registeredTools.find(registered => registered.name === 'get_document_symbols_code');
        assert.ok(tool, 'get_document_symbols_code was not registered');

        await assert.rejects(
            () => tool.handler({ path: '../secret.ts' }),
            /Path must stay within the workspace: \.\.\/secret\.ts/
        );
        assert.strictEqual(statStub.notCalled, true, 'filesystem stat should not run for unsafe paths');
        assert.strictEqual(executeCommandStub.notCalled, true, 'symbol provider should not run for unsafe paths');
    });

    test('requires a workspace before workspace symbol search', async () => {
        sinon.stub(vscode.workspace, 'workspaceFolders').value(undefined);
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves([]);

        const registeredTools = createSymbolToolServer();
        const tool = registeredTools.find(registered => registered.name === 'search_symbols_code');
        assert.ok(tool, 'search_symbols_code was not registered');

        await assert.rejects(
            () => tool.handler({ query: 'create' }),
            /No workspace folder is open\./
        );
        assert.strictEqual(executeCommandStub.notCalled, true, 'workspace symbol provider should not run without a workspace boundary');
    });

    test('rejects traversal before symbol definition document open', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const statStub = sinon.stub().resolves({
            type: vscode.FileType.File,
            ctime: 0,
            mtime: 0,
            size: 1
        });
        sinon.stub(vscode.workspace, 'fs').value({ stat: statStub });
        const openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves({} as vscode.TextDocument);

        const registeredTools = createSymbolToolServer();
        const tool = registeredTools.find(registered => registered.name === 'get_symbol_definition_code');
        assert.ok(tool, 'get_symbol_definition_code was not registered');

        await assert.rejects(
            () => tool.handler({ path: '../secret.ts', line: 1, symbol: 'secret' }),
            /Path must stay within the workspace: \.\.\/secret\.ts/
        );
        assert.strictEqual(statStub.notCalled, true, 'filesystem stat should not run for unsafe paths');
        assert.strictEqual(openTextDocumentStub.notCalled, true, 'document open should not run for unsafe paths');
    });
});
