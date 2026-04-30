import * as assert from 'assert';
import * as vscode from 'vscode';
import { AnnotationStore } from '../editor/annotation-store';
import { toAnnotationId } from '../editor/ids';
import { assertDefined } from './testUtils';

suite('Editor Annotation Store', () => {
    const workspaceRoot = '/workspace/';

    function pathForUri(uri: vscode.Uri): string | undefined {
        if (!uri.fsPath.startsWith(workspaceRoot)) {
            return undefined;
        }

        return uri.fsPath.slice(workspaceRoot.length);
    }

    function highlight(uri: vscode.Uri, line: number, kind: 'focus' | 'warning' | 'info' = 'focus') {
        return { uri, range: new vscode.Range(line, 0, line, 4), kind };
    }

    test('adds entries and replaces only the targeted surface for an annotation id', () => {
        const store = new AnnotationStore();
        const id = toAnnotationId('walkthrough');
        const uri = vscode.Uri.file('/workspace/src/example.ts');
        const firstRange = new vscode.Range(0, 0, 0, 4);
        const secondRange = new vscode.Range(1, 0, 1, 4);
        const replacementRange = new vscode.Range(2, 0, 2, 4);
        const callout = {
            uri,
            kind: 'question' as const,
            range: new vscode.Range(3, 0, 3, 0),
            title: 'Question',
            message: 'Why does this matter?'
        };

        store.setSurfaceEntries(id, 'highlights', [{ uri, range: firstRange, kind: 'focus' }], 'replace');
        store.setSurfaceEntries(id, 'callouts', [callout], 'replace');
        store.setSurfaceEntries(id, 'highlights', [{ uri, range: secondRange, kind: 'warning' }], 'add');
        const groupAfterAdd = store.getGroup(id);

        assert.strictEqual(groupAfterAdd?.highlights.length, 2);
        assert.strictEqual(groupAfterAdd?.callouts.length, 1);
        assert.deepStrictEqual(groupAfterAdd?.highlights.map(entry => entry.range.start.line), [0, 1]);

        store.setSurfaceEntries(id, 'highlights', [{ uri, range: replacementRange, kind: 'info' }], 'replace');
        const groupAfterReplace = store.getGroup(id);

        assert.strictEqual(groupAfterReplace?.highlights.length, 1);
        assert.strictEqual(assertDefined(groupAfterReplace?.highlights[0]).range.start.line, 2);
        assert.deepStrictEqual(groupAfterReplace?.callouts, [callout]);
    });

    test('clears an id across surfaces without removing unrelated groups', () => {
        const store = new AnnotationStore({ workspacePathForUri: pathForUri });
        const walkthroughId = toAnnotationId('walkthrough');
        const unrelatedId = toAnnotationId('unrelated');
        const uri = vscode.Uri.file('/workspace/src/example.ts');
        const otherUri = vscode.Uri.file('/workspace/src/other.ts');

        store.setSurfaceEntries(walkthroughId, 'highlights', [highlight(uri, 0)], 'replace');
        store.setSurfaceEntries(walkthroughId, 'callouts', [{ uri, kind: 'question', range: new vscode.Range(1, 0, 1, 0), title: 'Question', message: 'Why?' }], 'replace');
        store.setSurfaceEntries(unrelatedId, 'highlights', [highlight(otherUri, 2, 'info')], 'replace');

        const result = store.clear({ id: walkthroughId });

        assert.strictEqual(result.clearedIds, 1);
        assert.deepStrictEqual(result.clearedPaths, ['src/example.ts']);
        assert.deepStrictEqual(result.clearedUris, [uri.toString()]);
        assert.strictEqual(store.getGroup(walkthroughId), undefined);
        assert.strictEqual(store.getGroup(unrelatedId)?.highlights.length, 1);
    });

    test('clears entries by resolved URI and path across matching groups', () => {
        const store = new AnnotationStore({ workspacePathForUri: pathForUri });
        const firstId = toAnnotationId('first');
        const secondId = toAnnotationId('second');
        const targetUri = vscode.Uri.file('/workspace/src/example.ts');
        const otherUri = vscode.Uri.file('/workspace/src/other.ts');

        store.setSurfaceEntries(firstId, 'highlights', [highlight(targetUri, 0), highlight(otherUri, 1)], 'replace');
        store.setSurfaceEntries(secondId, 'hoverNotes', [{ uri: targetUri, kind: 'info', range: new vscode.Range(2, 0, 2, 4), message: 'Review this.' }], 'replace');

        const result = store.clear({ targetUri, targetPath: 'src/example.ts' });

        assert.strictEqual(result.clearedIds, 2);
        assert.deepStrictEqual(result.clearedPaths, ['src/example.ts']);
        assert.deepStrictEqual(result.clearedUris, [targetUri.toString()]);
        assert.deepStrictEqual(store.entriesForUri(targetUri), []);
        assert.deepStrictEqual(store.getGroup(firstId)?.highlights.map(entry => entry.uri.toString()), [otherUri.toString()]);
        assert.strictEqual(store.getGroup(secondId), undefined);
    });

    test('clears entries by workspace path without requiring a target URI', () => {
        const store = new AnnotationStore({ workspacePathForUri: pathForUri });
        const id = toAnnotationId('walkthrough');
        const targetUri = vscode.Uri.file('/workspace/src/example.ts');
        const otherUri = vscode.Uri.file('/workspace/src/other.ts');

        store.setSurfaceEntries(id, 'highlights', [highlight(targetUri, 0), highlight(otherUri, 1)], 'replace');
        store.setSurfaceEntries(id, 'hoverNotes', [{ uri: targetUri, kind: 'info', range: new vscode.Range(2, 0, 2, 4), message: 'Check this.' }], 'replace');

        const result = store.clear({ targetPath: 'src/example.ts' });

        assert.strictEqual(result.clearedIds, 1);
        assert.deepStrictEqual(result.clearedPaths, ['src/example.ts']);
        assert.deepStrictEqual(result.clearedUris, [targetUri.toString()]);
        assert.deepStrictEqual(store.entriesForUri(targetUri), []);
        assert.deepStrictEqual(store.getGroup(id)?.highlights.map(entry => entry.uri.toString()), [otherUri.toString()]);
    });

    test('global clear removes all entries and reports all affected targets', () => {
        const store = new AnnotationStore({ workspacePathForUri: pathForUri });
        const firstUri = vscode.Uri.file('/workspace/src/example.ts');
        const secondUri = vscode.Uri.file('/workspace/src/other.ts');

        store.setSurfaceEntries(toAnnotationId('first'), 'highlights', [highlight(firstUri, 0)], 'replace');
        store.setSurfaceEntries(toAnnotationId('second'), 'highlights', [highlight(secondUri, 1)], 'replace');

        const result = store.clear({ all: true });

        assert.strictEqual(result.clearedIds, 2);
        assert.deepStrictEqual(result.clearedPaths.sort(), ['src/example.ts', 'src/other.ts']);
        assert.deepStrictEqual(result.clearedUris.sort(), [firstUri.toString(), secondUri.toString()].sort());
        assert.deepStrictEqual(store.entries(), []);
    });
});
