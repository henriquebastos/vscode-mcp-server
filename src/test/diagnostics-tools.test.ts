import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { collectIssues, getSeverityName, registerDiagnosticsTools, renderIssuesAsText } from '../tools/diagnostics-tools';
import type { FormattedIssue } from '../tools/diagnostics-tools';

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

    test('getSeverityName maps each severity enum to its label and falls back to Unknown', () => {
        assert.strictEqual(getSeverityName(vscode.DiagnosticSeverity.Error), 'Error');
        assert.strictEqual(getSeverityName(vscode.DiagnosticSeverity.Warning), 'Warning');
        assert.strictEqual(getSeverityName(vscode.DiagnosticSeverity.Information), 'Information');
        assert.strictEqual(getSeverityName(vscode.DiagnosticSeverity.Hint), 'Hint');
        assert.strictEqual(getSeverityName(99 as vscode.DiagnosticSeverity), 'Unknown');
    });

    test('renderIssuesAsText emits a friendly empty message and full per-issue output', () => {
        assert.strictEqual(renderIssuesAsText([], false), 'No issues found.');

        const issues: FormattedIssue[] = [
            { file: 'src/a.ts', line: 1, column: 2, severity: 'Error', message: 'boom', source: 'tsc' },
            { file: 'src/b.ts', line: 3, column: 4, severity: 'Warning', message: 'careful' },
        ];
        const withSource = renderIssuesAsText(issues, true);
        assert.match(withSource, /Found 2 issue\(s\):/);
        assert.match(withSource, /Error: src\/a\.ts:1:2/);
        assert.match(withSource, /Source: tsc/);
        assert.match(withSource, /Warning: src\/b\.ts:3:4/);

        const withoutSource = renderIssuesAsText(issues, false);
        assert.doesNotMatch(withoutSource, /Source: /);
    });

    test('collectIssues filters by severity, drops out-of-workspace URIs, and respects includeSource', () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);

        const insideUri = vscode.Uri.file('/workspace/src/inside.ts');
        const outsideUri = vscode.Uri.file('/elsewhere/src/outside.ts');
        const makeDiag = (severity: vscode.DiagnosticSeverity, message: string, source?: string): vscode.Diagnostic => {
            const range = new vscode.Range(0, 1, 0, 5);
            const diagnostic = new vscode.Diagnostic(range, message, severity);
            if (source) {
                diagnostic.source = source;
            }
            return diagnostic;
        };

        const inputs: [vscode.Uri, vscode.Diagnostic[]][] = [
            [insideUri, [
                makeDiag(vscode.DiagnosticSeverity.Error, 'boom', 'tsc'),
                makeDiag(vscode.DiagnosticSeverity.Hint, 'noisy hint'),
            ]],
            [outsideUri, [makeDiag(vscode.DiagnosticSeverity.Error, 'invisible')]],
        ];

        const filtered = collectIssues(inputs, [vscode.DiagnosticSeverity.Error], true);
        assert.deepStrictEqual(filtered, [
            { file: 'src/inside.ts', line: 1, column: 2, severity: 'Error', message: 'boom', source: 'tsc' },
        ]);

        const noSource = collectIssues(inputs, [vscode.DiagnosticSeverity.Error], false);
        assert.strictEqual(noSource[0]?.source, undefined);
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
