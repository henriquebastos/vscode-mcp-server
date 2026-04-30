import * as assert from 'assert';
import * as vscode from 'vscode';
import { DiffRegistry } from '../editor/diff-registry';

suite('Editor Diff Registry', () => {
    test('stores memory-only diffs and finds entries by left or right URI', () => {
        const registry = new DiffRegistry();
        const leftUri = vscode.Uri.file('/workspace/src/old.ts');
        const rightUri = vscode.Uri.file('/workspace/src/new.ts');
        const addedUri = vscode.Uri.file('/workspace/src/added.ts');

        const stored = registry.add({
            title: 'Review changes',
            entries: [
                { label: 'Modified', leftUri: leftUri.toString(), rightUri: rightUri.toString() },
                { label: 'Added', rightUri: addedUri.toString() }
            ]
        });

        assert.strictEqual(stored.diffId, 'diff-1');
        assert.strictEqual(stored.count, 2);
        assert.deepStrictEqual(registry.get(stored.diffId), stored);
        assert.deepStrictEqual(registry.list(), [stored]);
        assert.deepStrictEqual(registry.findEntryForUri(leftUri), {
            diffId: stored.diffId,
            title: 'Review changes',
            entryIndex: 0,
            label: 'Modified',
            side: 'left'
        });
        assert.deepStrictEqual(registry.findEntryForUri(addedUri), {
            diffId: stored.diffId,
            title: 'Review changes',
            entryIndex: 1,
            label: 'Added',
            side: 'right'
        });

        registry.clear();

        assert.strictEqual(registry.get(stored.diffId), undefined);
        assert.deepStrictEqual(registry.list(), []);
        assert.strictEqual(registry.findEntryForUri(rightUri), undefined);
    });
});
