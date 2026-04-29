import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { EditorDiffService } from '../editor/diff-service';

suite('Editor Diff Service', () => {
    teardown(() => {
        sinon.restore();
    });

    test('resolves git+file source documents through the VS Code Git API', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const fileUri = vscode.Uri.file('/workspace/src/example.ts');
        const gitSourceUri = fileUri.with({ scheme: 'git+file', query: 'ref=main' });
        const gitDocumentUri = vscode.Uri.parse('git:/workspace/src/example.ts?%7B%22ref%22%3A%22main%22%7D');
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        const fileSystem = {
            stat: sinon.stub().resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 10 }),
            readDirectory: sinon.stub(),
            readFile: sinon.stub()
        };
        const gitApi = {
            toGitUri: sinon.stub().withArgs(fileUri, 'main').returns(gitDocumentUri),
            getRepository: sinon.stub().returns({ rootUri: workspaceUri })
        };
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const service = new EditorDiffService({ fileSystem, gitApi });

        const result = await service.openDiff({
            title: 'Git vs working tree',
            leftUri: gitSourceUri.toString(),
            rightUri: fileUri.toString()
        });

        assert.strictEqual(gitApi.toGitUri.calledOnce, true);
        assert.strictEqual(gitApi.toGitUri.firstCall.args[0].toString(), fileUri.toString());
        assert.strictEqual(gitApi.toGitUri.firstCall.args[1], 'main');
        assert.deepStrictEqual(result.entries, [{ leftUri: gitDocumentUri.toString(), rightUri: fileUri.toString() }]);
        assert.deepStrictEqual(
            executeCommandStub.firstCall.args[2].map(([resource, left, right]: [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined]) => [resource.toString(), left?.toString(), right?.toString()]),
            [[fileUri.toString(), gitDocumentUri.toString(), fileUri.toString()]]
        );
    });

    test('opens git ref versus git ref file diffs with Git document URIs', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const fileUri = vscode.Uri.file('/workspace/src/example.ts');
        const leftSourceUri = fileUri.with({ scheme: 'git+file', query: 'ref=main' });
        const rightSourceUri = fileUri.with({ scheme: 'git+file', query: 'ref=feature' });
        const leftGitUri = vscode.Uri.parse('git:/workspace/src/example.ts?%7B%22ref%22%3A%22main%22%7D');
        const rightGitUri = vscode.Uri.parse('git:/workspace/src/example.ts?%7B%22ref%22%3A%22feature%22%7D');
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        const fileSystem = {
            stat: sinon.stub().resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 10 }),
            readDirectory: sinon.stub(),
            readFile: sinon.stub()
        };
        const gitApi = {
            toGitUri: sinon.stub().callsFake((_uri: vscode.Uri, ref: string) => ref === 'main' ? leftGitUri : rightGitUri),
            getRepository: sinon.stub().returns({ rootUri: workspaceUri })
        };
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const service = new EditorDiffService({ fileSystem, gitApi });

        const result = await service.openDiff({ leftUri: leftSourceUri.toString(), rightUri: rightSourceUri.toString() });

        assert.deepStrictEqual(result.entries, [{ leftUri: leftGitUri.toString(), rightUri: rightGitUri.toString() }]);
        assert.deepStrictEqual(
            executeCommandStub.firstCall.args[2].map(([resource, left, right]: [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined]) => [resource.toString(), left?.toString(), right?.toString()]),
            [[rightGitUri.toString(), leftGitUri.toString(), rightGitUri.toString()]]
        );
    });

    test('normalizes git+file folder diffs from repository changes', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const folderUri = vscode.Uri.file('/workspace/src');
        const gitFolderUri = folderUri.with({ scheme: 'git+file', query: 'ref=main' });
        const modifiedUri = vscode.Uri.file('/workspace/src/modified.ts');
        const addedUri = vscode.Uri.file('/workspace/src/added.ts');
        const deletedUri = vscode.Uri.file('/workspace/src/deleted.ts');
        const modifiedGitUri = vscode.Uri.parse('git:/workspace/src/modified.ts?%7B%22ref%22%3A%22main%22%7D');
        const deletedGitUri = vscode.Uri.parse('git:/workspace/src/deleted.ts?%7B%22ref%22%3A%22main%22%7D');
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        const fileSystem = {
            stat: sinon.stub().resolves({ type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 }),
            readDirectory: sinon.stub(),
            readFile: sinon.stub()
        };
        const repository = {
            rootUri: workspaceUri,
            diffWith: sinon.stub().withArgs('main').resolves([
                { uri: modifiedUri, originalUri: modifiedUri, status: 5 },
                { uri: addedUri, originalUri: addedUri, status: 1 },
                { uri: deletedUri, originalUri: deletedUri, status: 6 }
            ])
        };
        const gitApi = {
            toGitUri: sinon.stub().callsFake((uri: vscode.Uri, ref: string) => {
                if (uri.toString() === modifiedUri.toString() && ref === 'main') {
                    return modifiedGitUri;
                }
                if (uri.toString() === deletedUri.toString() && ref === 'main') {
                    return deletedGitUri;
                }
                return uri.with({ scheme: 'git', query: `ref=${ref}` });
            }),
            getRepository: sinon.stub().returns(repository)
        };
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const service = new EditorDiffService({ fileSystem, gitApi });

        const result = await service.openDiff({
            title: 'Git folder diff',
            leftUri: gitFolderUri.toString(),
            rightUri: folderUri.toString()
        });

        assert.deepStrictEqual(result.entries, [
            { label: 'added.ts', rightUri: addedUri.toString() },
            { label: 'deleted.ts', leftUri: deletedGitUri.toString() },
            { label: 'modified.ts', leftUri: modifiedGitUri.toString(), rightUri: modifiedUri.toString() }
        ]);
        assert.deepStrictEqual(
            executeCommandStub.firstCall.args[2].map(([resource, left, right]: [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined]) => [resource.toString(), left?.toString(), right?.toString()]),
            [
                [addedUri.toString(), undefined, addedUri.toString()],
                [deletedGitUri.toString(), deletedGitUri.toString(), undefined],
                [modifiedUri.toString(), modifiedGitUri.toString(), modifiedUri.toString()]
            ]
        );
    });

    test('orients one-sided git folder entries for working tree versus ref diffs', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const folderUri = vscode.Uri.file('/workspace/src');
        const gitFolderUri = folderUri.with({ scheme: 'git+file', query: 'ref=main' });
        const addedUri = vscode.Uri.file('/workspace/src/added.ts');
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        const fileSystem = {
            stat: sinon.stub().resolves({ type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 }),
            readDirectory: sinon.stub(),
            readFile: sinon.stub()
        };
        const repository = {
            rootUri: workspaceUri,
            diffWith: sinon.stub().withArgs('main').resolves([
                { uri: addedUri, originalUri: addedUri, status: 1 }
            ])
        };
        const gitApi = {
            toGitUri: sinon.stub().returns(vscode.Uri.parse('git:/workspace/src/added.ts?%7B%22ref%22%3A%22main%22%7D')),
            getRepository: sinon.stub().returns(repository)
        };
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const service = new EditorDiffService({ fileSystem, gitApi });

        const result = await service.openDiff({
            title: 'Working tree vs ref',
            leftUri: folderUri.toString(),
            rightUri: gitFolderUri.toString()
        });

        assert.deepStrictEqual(result.entries, [{ label: 'added.ts', leftUri: addedUri.toString() }]);
        assert.deepStrictEqual(
            executeCommandStub.firstCall.args[2].map(([resource, left, right]: [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined]) => [resource.toString(), left?.toString(), right?.toString()]),
            [[addedUri.toString(), addedUri.toString(), undefined]]
        );
    });

    test('rejects git document folder sources instead of reusing the folder URI for entries', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const folderUri = vscode.Uri.file('/workspace/src');
        const gitFolderUri = vscode.Uri.parse('git:/workspace/src?%7B%22ref%22%3A%22main%22%7D');
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        const fileSystem = {
            stat: sinon.stub().resolves({ type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 }),
            readDirectory: sinon.stub(),
            readFile: sinon.stub()
        };
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const service = new EditorDiffService({ fileSystem });

        await assert.rejects(
            () => service.openDiff({ leftUri: gitFolderUri.toString(), rightUri: folderUri.toString() }),
            /git: source mode is only supported for exact file document URIs/
        );
        assert.strictEqual(executeCommandStub.notCalled, true);
    });

    test('rejects git+file source URIs that omit the ref query', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const fileUri = vscode.Uri.file('/workspace/src/example.ts');
        const gitSourceUri = fileUri.with({ scheme: 'git+file' });
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const service = new EditorDiffService();

        await assert.rejects(
            () => service.openDiff({ leftUri: gitSourceUri.toString(), rightUri: fileUri.toString() }),
            /git\+file URI requires a ref query parameter/
        );
        assert.strictEqual(executeCommandStub.notCalled, true);
    });

    test('opens file URI source diffs as a single normalized native changes entry', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const leftUri = vscode.Uri.file('/workspace/src/old.ts');
        const rightUri = vscode.Uri.file('/workspace/src/new.ts');
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        const fileSystem = {
            stat: sinon.stub().resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 10 }),
            readDirectory: sinon.stub(),
            readFile: sinon.stub()
        };
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const service = new EditorDiffService({ fileSystem });

        const result = await service.openDiff({
            title: 'Two files',
            leftUri: leftUri.toString(),
            rightUri: rightUri.toString()
        });

        assert.strictEqual(result.count, 1);
        assert.deepStrictEqual(result.entries, [{ leftUri: leftUri.toString(), rightUri: rightUri.toString() }]);
        assert.deepStrictEqual(
            executeCommandStub.firstCall.args[2].map(([resource, left, right]: [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined]) => [resource.toString(), left?.toString(), right?.toString()]),
            [[rightUri.toString(), leftUri.toString(), rightUri.toString()]]
        );
    });

    test('opens changed folder descendants with one-sided entries and include filters', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const leftRoot = vscode.Uri.file('/workspace/left');
        const rightRoot = vscode.Uri.file('/workspace/right');
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        const fileSystem = {
            stat: sinon.stub().resolves({ type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 }),
            readDirectory: sinon.stub().callsFake((uri: vscode.Uri) => {
                if (uri.toString() === leftRoot.toString()) {
                    return Promise.resolve([
                        ['modified.ts', vscode.FileType.File],
                        ['deleted.ts', vscode.FileType.File],
                        ['same.ts', vscode.FileType.File],
                        ['ignored.log', vscode.FileType.File]
                    ]);
                }
                return Promise.resolve([
                    ['modified.ts', vscode.FileType.File],
                    ['added.ts', vscode.FileType.File],
                    ['same.ts', vscode.FileType.File],
                    ['ignored.log', vscode.FileType.File]
                ]);
            }),
            readFile: sinon.stub().callsFake((uri: vscode.Uri) => {
                const valueByPath: Record<string, string> = {
                    '/workspace/left/modified.ts': 'old',
                    '/workspace/right/modified.ts': 'new',
                    '/workspace/left/same.ts': 'same',
                    '/workspace/right/same.ts': 'same'
                };
                return Promise.resolve(new TextEncoder().encode(valueByPath[uri.fsPath] ?? 'content'));
            })
        };
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const service = new EditorDiffService({ fileSystem });

        const result = await service.openDiff({
            title: 'Folder diff',
            leftUri: leftRoot.toString(),
            rightUri: rightRoot.toString(),
            include: ['*.ts'],
            maxFiles: 5
        });

        assert.deepStrictEqual(result.entries, [
            { label: 'added.ts', rightUri: vscode.Uri.file('/workspace/right/added.ts').toString() },
            { label: 'deleted.ts', leftUri: vscode.Uri.file('/workspace/left/deleted.ts').toString() },
            { label: 'modified.ts', leftUri: vscode.Uri.file('/workspace/left/modified.ts').toString(), rightUri: vscode.Uri.file('/workspace/right/modified.ts').toString() }
        ]);
        assert.deepStrictEqual(
            executeCommandStub.firstCall.args[2].map(([resource, left, right]: [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined]) => [resource.toString(), left?.toString(), right?.toString()]),
            [
                [vscode.Uri.file('/workspace/right/added.ts').toString(), undefined, vscode.Uri.file('/workspace/right/added.ts').toString()],
                [vscode.Uri.file('/workspace/left/deleted.ts').toString(), vscode.Uri.file('/workspace/left/deleted.ts').toString(), undefined],
                [vscode.Uri.file('/workspace/right/modified.ts').toString(), vscode.Uri.file('/workspace/left/modified.ts').toString(), vscode.Uri.file('/workspace/right/modified.ts').toString()]
            ]
        );
    });

    test('rejects unsafe file source URIs before opening a diff', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const service = new EditorDiffService();

        await assert.rejects(
            () => service.openDiff({
                leftUri: vscode.Uri.file('/tmp/old.ts').toString(),
                rightUri: vscode.Uri.file('/workspace/src/new.ts').toString()
            }),
            /leftUri must stay within the workspace/
        );
        assert.strictEqual(executeCommandStub.notCalled, true);
    });

    test('enforces maxFiles before opening a native changes editor', async () => {
        const leftUri = vscode.Uri.file('/workspace/src/old.ts');
        const rightUri = vscode.Uri.file('/workspace/src/new.ts');
        const addedUri = vscode.Uri.file('/workspace/src/added.ts');
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        const service = new EditorDiffService();

        await assert.rejects(
            () => service.openDiff({
                entries: [
                    { leftUri: leftUri.toString(), rightUri: rightUri.toString() },
                    { rightUri: addedUri.toString() }
                ],
                maxFiles: 1
            }),
            /exceeds maxFiles=1/
        );
        assert.strictEqual(executeCommandStub.notCalled, true);
    });

    test('rejects explicit file entries outside the workspace before opening', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const service = new EditorDiffService();

        await assert.rejects(
            () => service.openDiff({
                entries: [
                    {
                        leftUri: vscode.Uri.file('/tmp/secret.ts').toString(),
                        rightUri: vscode.Uri.file('/workspace/src/example.ts').toString()
                    }
                ]
            }),
            /entries\[0\]\.leftUri must stay within the workspace/
        );
        assert.strictEqual(executeCommandStub.notCalled, true);
    });

    test('opens explicit entries in the native changes editor and stores normalized one-sided entries', async () => {
        const leftUri = vscode.Uri.file('/workspace/src/example.ts');
        const rightUri = vscode.Uri.file('/workspace/src/example-new.ts');
        const addedUri = vscode.Uri.file('/workspace/src/added.ts');
        const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
        const service = new EditorDiffService();

        const result = await service.openDiff({
            title: 'Review changes',
            entries: [
                { label: 'Modified example', leftUri: leftUri.toString(), rightUri: rightUri.toString() },
                { label: 'Added file', rightUri: addedUri.toString() }
            ]
        });

        assert.ok(result.diffId.startsWith('diff-'));
        assert.strictEqual(result.title, 'Review changes');
        assert.strictEqual(result.count, 2);
        assert.deepStrictEqual(result.entries, [
            { label: 'Modified example', leftUri: leftUri.toString(), rightUri: rightUri.toString() },
            { label: 'Added file', rightUri: addedUri.toString() }
        ]);
        assert.strictEqual(executeCommandStub.calledOnce, true, 'vscode.changes was not invoked');
        assert.strictEqual(executeCommandStub.firstCall.args[0], 'vscode.changes');
        assert.strictEqual(executeCommandStub.firstCall.args[1], 'Review changes');
        assert.deepStrictEqual(
            executeCommandStub.firstCall.args[2].map(([resource, left, right]: [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined]) => [resource.toString(), left?.toString(), right?.toString()]),
            [
                [rightUri.toString(), leftUri.toString(), rightUri.toString()],
                [addedUri.toString(), undefined, addedUri.toString()]
            ]
        );
        assert.deepStrictEqual(service.getDiff(result.diffId)?.entries, result.entries);
    });
});
