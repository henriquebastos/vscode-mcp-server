import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { listWorkspaceFiles, readWorkspaceFile, registerFileTools } from '../tools/file-tools';

suite('File Tools', () => {
    teardown(() => {
        sinon.restore();
    });

    function stubWorkspaceFs(fs: Partial<typeof vscode.workspace.fs>) {
        sinon.stub(vscode.workspace, 'fs').value(fs);
    }

    function createFileToolServer() {
        const registeredTools: Array<{ name: string; handler: (args: any) => Promise<any> }> = [];
        const server = {
            tool: (name: string, _description: string, _schema: unknown, handler: (args: any) => Promise<any>) => {
                registeredTools.push({ name, handler });
            }
        };

        registerFileTools(server as any, async () => []);
        return registeredTools;
    }

    test('rejects traversal before listing workspace files', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const readDirectoryStub = sinon.stub().resolves([]);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        stubWorkspaceFs({ readDirectory: readDirectoryStub } as Partial<typeof vscode.workspace.fs>);

        await assert.rejects(
            () => listWorkspaceFiles('../secret.ts'),
            /Path must stay within the workspace: \.\.\/secret\.ts/
        );
        assert.strictEqual(readDirectoryStub.notCalled, true, 'directory reads should not run for unsafe paths');
    });

    test('rejects recursive root listing before reading directories', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const readDirectoryStub = sinon.stub().resolves([]);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        stubWorkspaceFs({ readDirectory: readDirectoryStub } as Partial<typeof vscode.workspace.fs>);

        await assert.rejects(
            () => listWorkspaceFiles('.', true),
            /Recursive root listing is not allowed/
        );
        assert.strictEqual(readDirectoryStub.notCalled, true, 'root recursive guard should run before directory reads');
    });

    test('bounds recursive listing output', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const entries: [string, vscode.FileType][] = Array.from({ length: 1001 }, (_value, index) => [`file-${index}.ts`, vscode.FileType.File]);
        const readDirectoryStub = sinon.stub().resolves(entries);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        stubWorkspaceFs({ readDirectory: readDirectoryStub } as Partial<typeof vscode.workspace.fs>);

        await assert.rejects(
            () => listWorkspaceFiles('src', true),
            /Recursive listing exceeds the maximum of 1000 entries/
        );
    });

    test('rejects traversal before reading workspace files', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const readFileStub = sinon.stub().resolves(Buffer.from('secret'));
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        stubWorkspaceFs({ readFile: readFileStub } as Partial<typeof vscode.workspace.fs>);

        await assert.rejects(
            () => readWorkspaceFile('../secret.ts'),
            /Path must stay within the workspace: \.\.\/secret\.ts/
        );
        assert.strictEqual(readFileStub.notCalled, true, 'file reads should not run for unsafe paths');
    });

    test('rejects invalid read bounds before reading files', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const readFileStub = sinon.stub().resolves(Buffer.from('first\nsecond'));
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        stubWorkspaceFs({ readFile: readFileStub } as Partial<typeof vscode.workspace.fs>);

        await assert.rejects(
            () => readWorkspaceFile('src/file.ts', 'utf-8', 0),
            /maxCharacters must be a positive integer/
        );
        await assert.rejects(
            () => readWorkspaceFile('src/file.ts', 'utf-8', 100001),
            /maxCharacters cannot exceed 100000/
        );
        await assert.rejects(
            () => readWorkspaceFile('src/file.ts', 'utf-8', 100, 0.5, 1),
            /Line ranges must use integer line numbers/
        );
        await assert.rejects(
            () => readWorkspaceFile('src/file.ts', 'utf-16le', 100),
            /Unsupported encoding/
        );
        assert.strictEqual(readFileStub.notCalled, true, 'invalid read bounds should fail before file reads');
    });

    test('rejects out-of-range read line ranges instead of clamping', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const readFileStub = sinon.stub().resolves(Buffer.from('first\nsecond'));
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        stubWorkspaceFs({ readFile: readFileStub } as Partial<typeof vscode.workspace.fs>);

        await assert.rejects(
            () => readWorkspaceFile('src/file.ts', 'utf-8', 100, 0, 2),
            /End line 3 is out of range \(1-2\)/
        );
    });

    test('read_file_code rejects invalid 1-based line numbers before reading', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const readFileStub = sinon.stub().resolves(Buffer.from('first\nsecond'));
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        stubWorkspaceFs({ readFile: readFileStub } as Partial<typeof vscode.workspace.fs>);

        const registeredTools = createFileToolServer();
        const read = registeredTools.find(registered => registered.name === 'read_file_code');
        assert.ok(read, 'read_file_code was not registered');

        await assert.rejects(
            () => read.handler({ path: 'src/file.ts', startLine: 0 }),
            /startLine must be -1 or a positive integer/
        );
        assert.strictEqual(readFileStub.notCalled, true, 'invalid tool line numbers should fail before file reads');
    });

    test('enforces read size guards for text and base64 output', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const readFileStub = sinon.stub();
        readFileStub.onFirstCall().resolves(new Uint8Array(401));
        readFileStub.onSecondCall().resolves(new Uint8Array(4));
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        stubWorkspaceFs({ readFile: readFileStub } as Partial<typeof vscode.workspace.fs>);

        await assert.rejects(
            () => readWorkspaceFile('src/large.txt', 'utf-8', 100),
            /exceeds the safe decode limit/
        );
        await assert.rejects(
            () => readWorkspaceFile('src/image.bin', 'base64', 4),
            /Base64 content exceeds the maximum character limit/
        );
    });

    test('rejects unsafe move, copy, and rename inputs before edits or filesystem operations', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const applyEditStub = sinon.stub(vscode.workspace, 'applyEdit').resolves(true);
        const statStub = sinon.stub().rejects(vscode.FileSystemError.FileNotFound());
        const readFileStub = sinon.stub().resolves(Buffer.from('content'));
        const writeFileStub = sinon.stub().resolves();
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        stubWorkspaceFs({ stat: statStub, readFile: readFileStub, writeFile: writeFileStub } as Partial<typeof vscode.workspace.fs>);

        const registeredTools = createFileToolServer();
        const move = registeredTools.find(registered => registered.name === 'move_file_code');
        const copy = registeredTools.find(registered => registered.name === 'copy_file_code');
        const rename = registeredTools.find(registered => registered.name === 'rename_file_code');
        assert.ok(move, 'move_file_code was not registered');
        assert.ok(copy, 'copy_file_code was not registered');
        assert.ok(rename, 'rename_file_code was not registered');

        await assert.rejects(
            () => move.handler({ sourcePath: '../secret.ts', targetPath: 'src/secret.ts' }),
            /Path must stay within the workspace: \.\.\/secret\.ts/
        );
        await assert.rejects(
            () => move.handler({ sourcePath: 'src/file.ts', targetPath: '../secret.ts' }),
            /Path must stay within the workspace: \.\.\/secret\.ts/
        );
        await assert.rejects(
            () => copy.handler({ sourcePath: '../secret.ts', targetPath: 'src/copy.ts' }),
            /Path must stay within the workspace: \.\.\/secret\.ts/
        );
        await assert.rejects(
            () => copy.handler({ sourcePath: 'src/file.ts', targetPath: '/tmp/secret.ts' }),
            /Path must stay within the workspace: \/tmp\/secret\.ts/
        );
        await assert.rejects(
            () => rename.handler({ filePath: 'C:\\secret.ts', newName: 'safe.ts' }),
            /Path must stay within the workspace: C:\\secret\.ts/
        );
        await assert.rejects(
            () => rename.handler({ filePath: 'src/file.ts', newName: '../evil.ts' }),
            /newName must be a basename/
        );

        assert.strictEqual(applyEditStub.notCalled, true, 'unsafe move/rename should not apply edits');
        assert.strictEqual(statStub.notCalled, true, 'unsafe copy should not stat the target');
        assert.strictEqual(readFileStub.notCalled, true, 'unsafe copy should not read the source');
        assert.strictEqual(writeFileStub.notCalled, true, 'unsafe copy should not write the target');
    });
});
