import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { registerDiagnosticsTools } from '../tools/diagnostics-tools';

suite('Diagnostics MCP Tools', () => {
    teardown(() => {
        sinon.restore();
    });

    function createDiagnosticsToolServer() {
        const registeredTools: Array<{ name: string; handler: (args: any) => Promise<any> }> = [];
        const server = {
            tool: (name: string, _description: string, _schema: unknown, handler: (args: any) => Promise<any>) => {
                registeredTools.push({ name, handler });
            }
        };

        registerDiagnosticsTools(server as any);
        return registeredTools;
    }

    test('rejects traversal before looking up file diagnostics', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const getDiagnosticsStub = sinon.stub(vscode.languages, 'getDiagnostics').returns([]);

        const registeredTools = createDiagnosticsToolServer();
        const tool = registeredTools.find(registered => registered.name === 'get_diagnostics_code');
        assert.ok(tool, 'get_diagnostics_code was not registered');

        await assert.rejects(
            () => tool.handler({ path: '../secret.ts' }),
            /Path must stay within the workspace: \.\.\/secret\.ts/
        );
        assert.strictEqual(getDiagnosticsStub.notCalled, true, 'diagnostics lookup should not run for unsafe paths');
    });

    test('requires a workspace before workspace-wide diagnostics lookup', async () => {
        sinon.stub(vscode.workspace, 'workspaceFolders').value(undefined);
        const getDiagnosticsStub = sinon.stub(vscode.languages, 'getDiagnostics').returns([]);

        const registeredTools = createDiagnosticsToolServer();
        const tool = registeredTools.find(registered => registered.name === 'get_diagnostics_code');
        assert.ok(tool, 'get_diagnostics_code was not registered');

        await assert.rejects(
            () => tool.handler({}),
            /No workspace folder is open\./
        );
        assert.strictEqual(getDiagnosticsStub.notCalled, true, 'workspace diagnostics should not run without a workspace boundary');
    });
});
