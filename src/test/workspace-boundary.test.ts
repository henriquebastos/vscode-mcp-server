import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
    assertWorkspacePath,
    getSingleWorkspaceRoot,
    isUriInsideWorkspace,
    normalizeWorkspacePath,
    uriToWorkspacePath,
    workspacePathToUri
} from '../workspace/workspace-boundary';

suite('Workspace Boundary', () => {
    teardown(() => {
        sinon.restore();
    });

    test('resolves the first workspace root explicitly', () => {
        const first = vscode.Uri.file('/workspace-one');
        const second = vscode.Uri.file('/workspace-two');
        sinon.stub(vscode.workspace, 'workspaceFolders').value([
            { uri: first, name: 'workspace-one', index: 0 },
            { uri: second, name: 'workspace-two', index: 1 }
        ]);

        assert.strictEqual(getSingleWorkspaceRoot().toString(), first.toString());
    });

    test('accepts and normalizes workspace-relative paths', () => {
        assert.strictEqual(normalizeWorkspacePath('.'), '.');
        assert.strictEqual(normalizeWorkspacePath('./src/foo.ts'), 'src/foo.ts');
        assert.strictEqual(normalizeWorkspacePath('src\\foo.ts'), 'src/foo.ts');
        assert.strictEqual(normalizeWorkspacePath('src//nested/./foo.ts'), 'src/nested/foo.ts');
    });

    test('rejects unsafe workspace-relative paths', () => {
        for (const unsafePath of ['', '   ', '../secret.ts', '/tmp/secret.ts', 'C:\\secret.ts', 'src/../../secret.ts']) {
            assert.throws(
                () => assertWorkspacePath(unsafePath),
                /Path must stay within the workspace|Path must not be empty/,
                `expected ${unsafePath} to be rejected`
            );
        }
    });

    test('converts safe workspace paths and URIs with normalized output', () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);

        assert.strictEqual(workspacePathToUri(assertWorkspacePath('.')).fsPath, '/workspace');
        assert.strictEqual(workspacePathToUri(assertWorkspacePath('src\\foo.ts')).fsPath, '/workspace/src/foo.ts');
        assert.strictEqual(uriToWorkspacePath(vscode.Uri.file('/workspace/src/foo.ts')), 'src/foo.ts');
        assert.strictEqual(uriToWorkspacePath(vscode.Uri.file('/workspace')), '.');
    });

    test('reports whether URIs are inside the first workspace', () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);

        assert.strictEqual(isUriInsideWorkspace(vscode.Uri.file('/workspace/src/foo.ts')), true);
        assert.strictEqual(isUriInsideWorkspace(vscode.Uri.file('/workspace')), true);
        assert.strictEqual(isUriInsideWorkspace(vscode.Uri.file('/other/src/foo.ts')), false);
    });
});
