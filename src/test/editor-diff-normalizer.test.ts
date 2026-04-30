import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { DiffNormalizer, normalizeDiffRequest } from '../editor/diff-normalizer';

function serializeCommandEntries(entries: Awaited<ReturnType<DiffNormalizer['normalize']>>) {
    return entries.map(({ commandEntry: [resource, left, right] }) => [resource.toString(), left?.toString(), right?.toString()]);
}

suite('Editor Diff Normalizer', () => {
    teardown(() => {
        sinon.restore();
    });

    test('normalizes filtered changed folder descendants without opening the native diff editor', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const leftRoot = vscode.Uri.file('/workspace/left');
        const rightRoot = vscode.Uri.file('/workspace/right');
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
        const normalizer = new DiffNormalizer({ fileSystem });

        const entries = await normalizer.normalize(normalizeDiffRequest({
            leftUri: leftRoot.toString(),
            rightUri: rightRoot.toString(),
            include: ['*.ts'],
            maxFiles: 5
        }));

        assert.deepStrictEqual(entries.map(entry => entry.entry), [
            { label: 'added.ts', rightUri: vscode.Uri.file('/workspace/right/added.ts').toString() },
            { label: 'deleted.ts', leftUri: vscode.Uri.file('/workspace/left/deleted.ts').toString() },
            { label: 'modified.ts', leftUri: vscode.Uri.file('/workspace/left/modified.ts').toString(), rightUri: vscode.Uri.file('/workspace/right/modified.ts').toString() }
        ]);
        assert.deepStrictEqual(serializeCommandEntries(entries), [
            [vscode.Uri.file('/workspace/right/added.ts').toString(), undefined, vscode.Uri.file('/workspace/right/added.ts').toString()],
            [vscode.Uri.file('/workspace/left/deleted.ts').toString(), vscode.Uri.file('/workspace/left/deleted.ts').toString(), undefined],
            [vscode.Uri.file('/workspace/right/modified.ts').toString(), vscode.Uri.file('/workspace/left/modified.ts').toString(), vscode.Uri.file('/workspace/right/modified.ts').toString()]
        ]);
    });

    test('normalizes explicit entries without the service registry or command boundary', async () => {
        const leftUri = vscode.Uri.file('/workspace/src/old.ts');
        const rightUri = vscode.Uri.file('/workspace/src/new.ts');
        const addedUri = vscode.Uri.file('/workspace/src/added.ts');
        const normalizer = new DiffNormalizer();

        const entries = await normalizer.normalize(normalizeDiffRequest({
            title: 'Explicit review',
            entries: [
                { label: 'Modified', leftUri: leftUri.toString(), rightUri: rightUri.toString() },
                { label: 'Added', rightUri: addedUri.toString() }
            ]
        }));

        assert.deepStrictEqual(entries.map(entry => entry.entry), [
            { label: 'Modified', leftUri: leftUri.toString(), rightUri: rightUri.toString() },
            { label: 'Added', rightUri: addedUri.toString() }
        ]);
        assert.deepStrictEqual(serializeCommandEntries(entries), [
            [rightUri.toString(), leftUri.toString(), rightUri.toString()],
            [addedUri.toString(), undefined, addedUri.toString()]
        ]);
    });

    test('applies exclude filters before returning folder entries', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const leftRoot = vscode.Uri.file('/workspace/left');
        const rightRoot = vscode.Uri.file('/workspace/right');
        const fileSystem = {
            stat: sinon.stub().resolves({ type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 }),
            readDirectory: sinon.stub().callsFake((uri: vscode.Uri) => {
                if (uri.toString() === leftRoot.toString()) {
                    return Promise.resolve([
                        ['modified.ts', vscode.FileType.File],
                        ['deleted.ts', vscode.FileType.File]
                    ]);
                }
                return Promise.resolve([
                    ['modified.ts', vscode.FileType.File],
                    ['added.ts', vscode.FileType.File]
                ]);
            }),
            readFile: sinon.stub().callsFake((uri: vscode.Uri) => {
                const valueByPath: Record<string, string> = {
                    '/workspace/left/modified.ts': 'old',
                    '/workspace/right/modified.ts': 'new'
                };
                return Promise.resolve(new TextEncoder().encode(valueByPath[uri.fsPath] ?? 'content'));
            })
        };
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const normalizer = new DiffNormalizer({ fileSystem });

        const entries = await normalizer.normalize(normalizeDiffRequest({
            leftUri: leftRoot.toString(),
            rightUri: rightRoot.toString(),
            exclude: ['deleted.ts']
        }));

        assert.deepStrictEqual(entries.map(entry => entry.entry), [
            { label: 'added.ts', rightUri: vscode.Uri.file('/workspace/right/added.ts').toString() },
            { label: 'modified.ts', leftUri: vscode.Uri.file('/workspace/left/modified.ts').toString(), rightUri: vscode.Uri.file('/workspace/right/modified.ts').toString() }
        ]);
    });

    test('normalizes git ref versus ref folder entries through diffBetween', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const folderUri = vscode.Uri.file('/workspace/src');
        const leftGitFolderUri = folderUri.with({ scheme: 'git+file', query: 'ref=main' });
        const rightGitFolderUri = folderUri.with({ scheme: 'git+file', query: 'ref=feature' });
        const modifiedUri = vscode.Uri.file('/workspace/src/modified.ts');
        const addedUri = vscode.Uri.file('/workspace/src/added.ts');
        const deletedUri = vscode.Uri.file('/workspace/src/deleted.ts');
        const fileSystem = {
            stat: sinon.stub().resolves({ type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 }),
            readDirectory: sinon.stub(),
            readFile: sinon.stub()
        };
        const repository = {
            rootUri: workspaceUri,
            diffBetween: sinon.stub().withArgs('main', 'feature').resolves([
                { uri: modifiedUri, originalUri: modifiedUri, status: 5 },
                { uri: addedUri, originalUri: addedUri, status: 1 },
                { uri: deletedUri, originalUri: deletedUri, status: 6 }
            ])
        };
        const gitApi = {
            toGitUri: sinon.stub().callsFake((uri: vscode.Uri, ref: string) => uri.with({ scheme: 'git', query: `ref=${ref}` })),
            getRepository: sinon.stub().returns(repository)
        };
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const normalizer = new DiffNormalizer({ fileSystem, gitApi });

        const entries = await normalizer.normalize(normalizeDiffRequest({
            leftUri: leftGitFolderUri.toString(),
            rightUri: rightGitFolderUri.toString()
        }));

        assert.strictEqual(repository.diffBetween.calledOnceWithExactly('main', 'feature'), true);
        assert.deepStrictEqual(entries.map(entry => entry.entry), [
            { label: 'added.ts', rightUri: addedUri.with({ scheme: 'git', query: 'ref=feature' }).toString() },
            { label: 'deleted.ts', leftUri: deletedUri.with({ scheme: 'git', query: 'ref=main' }).toString() },
            { label: 'modified.ts', leftUri: modifiedUri.with({ scheme: 'git', query: 'ref=main' }).toString(), rightUri: modifiedUri.with({ scheme: 'git', query: 'ref=feature' }).toString() }
        ]);
    });

    test('rejects source entries that exceed maxFiles before command invocation', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const leftUri = vscode.Uri.file('/workspace/src/old.ts');
        const rightUri = vscode.Uri.file('/workspace/src/new.ts');
        const fileSystem = {
            stat: sinon.stub().resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 10 }),
            readDirectory: sinon.stub(),
            readFile: sinon.stub()
        };
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        const normalizer = new DiffNormalizer({ fileSystem });

        await assert.rejects(
            () => normalizer.normalize(normalizeDiffRequest({
                leftUri: leftUri.toString(),
                rightUri: rightUri.toString(),
                maxFiles: 0
            })),
            /maxFiles must be a positive integer/
        );
    });

    test('orients one-sided git changes for working tree versus ref folder diffs', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const folderUri = vscode.Uri.file('/workspace/src');
        const gitFolderUri = folderUri.with({ scheme: 'git+file', query: 'ref=main' });
        const addedUri = vscode.Uri.file('/workspace/src/added.ts');
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
        const normalizer = new DiffNormalizer({ fileSystem, gitApi });

        const entries = await normalizer.normalize(normalizeDiffRequest({
            leftUri: folderUri.toString(),
            rightUri: gitFolderUri.toString()
        }));

        assert.deepStrictEqual(entries.map(entry => entry.entry), [{ label: 'added.ts', leftUri: addedUri.toString() }]);
        assert.deepStrictEqual(serializeCommandEntries(entries), [[addedUri.toString(), addedUri.toString(), undefined]]);
    });
});
