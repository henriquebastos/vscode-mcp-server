import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
    flattenDocumentSymbols,
    formatDocumentSymbolEntry,
    formatDocumentSymbolsResult,
    formatHoverEntry,
    formatSearchSymbolsResult,
    getLineText,
    getSymbolHoverInfo,
    readLineFromDisk,
    registerSymbolTools
} from '../tools/symbol-tools';
import type { SerializedDocumentSymbol } from '../tools/symbol-tools';
import type { WorkspacePath } from '../workspace/workspace-boundary';
import { assertDefined } from './testUtils';

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

        assert.deepStrictEqual(assertDefined(result.hovers[0]).contents, ['42']);
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

    test('formatSearchSymbolsResult covers empty, capped, and uncapped results', () => {
        const empty = formatSearchSymbolsResult({ symbols: [], total: 0 }, 'foo', 5);
        assert.match(empty, /No symbols found matching query "foo"\./);

        const capped = formatSearchSymbolsResult({
            symbols: [
                { name: 'createWidget', kind: 'Function', location: 'src/a.ts:10:0', containerName: 'WidgetFactory' },
                { name: 'createGizmo', kind: 'Function', location: 'src/b.ts:20:0' }
            ],
            total: 17
        }, 'create', 2);
        assert.match(capped, /Found 17 symbols matching query "create"/);
        assert.match(capped, /\(showing first 2\)/);
        assert.match(capped, /createWidget \(Function\) in WidgetFactory/);
        assert.match(capped, /createGizmo \(Function\)\nLocation: src\/b\.ts:20:0/);
        assert.doesNotMatch(capped, / in undefined/);
    });

    test('formatDocumentSymbolEntry indents by depth and only adds detail/children when present', () => {
        const base: SerializedDocumentSymbol = {
            name: 'helper',
            kind: 'Function',
            range: { start: { line: 5, character: 0 }, end: { line: 7, character: 1 } },
            selectionRange: { start: { line: 5, character: 9 }, end: { line: 5, character: 15 } },
            depth: 2
        };
        const minimal = formatDocumentSymbolEntry(base);
        assert.match(minimal, /^ {4}helper \(Function\)\n {6}Range: 5:0-7:1\n\n$/);

        const rich = formatDocumentSymbolEntry({ ...base, detail: '() => void', children: 3 });
        assert.match(rich, /helper \(Function\) - \(\) => void/);
        assert.match(rich, /Children: 3/);
    });

    test('formatDocumentSymbolsResult includes summary, totals, and per-symbol entries', () => {
        const path = 'src/a.ts' as WorkspacePath;
        const empty = formatDocumentSymbolsResult({ symbols: [], total: 0, totalByKind: {} }, path);
        assert.strictEqual(empty, 'No symbols found in file: src/a.ts');

        const populated = formatDocumentSymbolsResult({
            symbols: [{
                name: 'main',
                kind: 'Function',
                range: { start: { line: 1, character: 0 }, end: { line: 4, character: 1 } },
                selectionRange: { start: { line: 1, character: 9 }, end: { line: 1, character: 13 } },
                depth: 0
            }],
            total: 1,
            totalByKind: { Function: 1, Variable: 2 }
        }, path);
        assert.match(populated, /Document symbols for src\/a\.ts \(1 total symbols\):/);
        assert.match(populated, /Summary: 1 Function, 2 Variables/);
        assert.match(populated, /main \(Function\)/);
    });

    test('flattenDocumentSymbols depth-walks children and respects maxDepth', () => {
        const symbol = (name: string, kind: vscode.SymbolKind, children: vscode.DocumentSymbol[] = []): vscode.DocumentSymbol => ({
            name,
            detail: '',
            kind,
            range: new vscode.Range(0, 0, 0, 1),
            selectionRange: new vscode.Range(0, 0, 0, 1),
            children
        });

        const tree = [
            symbol('Outer', vscode.SymbolKind.Class, [
                symbol('inner', vscode.SymbolKind.Method, [
                    symbol('deep', vscode.SymbolKind.Variable)
                ])
            ])
        ];

        const full = flattenDocumentSymbols(tree);
        assert.deepStrictEqual(full.symbols.map(s => s.name), ['Outer', 'inner', 'deep']);
        assert.deepStrictEqual(full.symbols.map(s => s.depth), [0, 1, 2]);
        assert.deepStrictEqual(full.totalByKind, { Class: 1, Method: 1, Variable: 1 });
        assert.strictEqual(full.symbols[0]?.children, 1);

        const shallow = flattenDocumentSymbols(tree, 1);
        assert.deepStrictEqual(shallow.symbols.map(s => s.name), ['Outer', 'inner']);
    });

    test('formatHoverEntry omits sections that are absent', () => {
        const minimal = formatHoverEntry({ contents: ['type X = number'] });
        assert.match(minimal, /type X = number/);
        assert.doesNotMatch(minimal, /Code context:/);
        assert.doesNotMatch(minimal, /Symbol range:/);

        const rich = formatHoverEntry({
            preview: 'const X = 1;',
            contents: ['type X = number'],
            range: { start: { line: 1, character: 6 }, end: { line: 1, character: 7 } }
        });
        assert.match(rich, /Code context: `const X = 1;`/);
        assert.match(rich, /Symbol range: \[1:6\] to \[1:7\]/);
    });

    test('readLineFromDisk returns the trimmed requested line and undefined when out of range', async () => {
        const uri = vscode.Uri.file('/workspace/src/disk-only.ts');
        const text = 'first line\n  second  \nthird';
        sinon.stub(vscode.workspace, 'fs').value({
            readFile: async (target: vscode.Uri) => {
                assert.strictEqual(target.toString(), uri.toString());
                return Buffer.from(text, 'utf8');
            }
        });

        assert.strictEqual(await readLineFromDisk(uri, 0), 'first line');
        assert.strictEqual(await readLineFromDisk(uri, 1), 'second');
        assert.strictEqual(await readLineFromDisk(uri, 99), undefined);
        assert.strictEqual(await readLineFromDisk(uri, -1), undefined);
    });

    test('readLineFromDisk swallows readFile failures and returns undefined', async () => {
        const uri = vscode.Uri.file('/workspace/src/missing.ts');
        sinon.stub(vscode.workspace, 'fs').value({
            readFile: async () => { throw new Error('boom'); }
        });
        assert.strictEqual(await readLineFromDisk(uri, 0), undefined);
    });

    test('getLineText returns the requested line text and undefined when out of range', async () => {
        const uri = vscode.Uri.file('/workspace/src/getline.ts');
        const document = {
            uri,
            lineCount: 2,
            lineAt(line: number) {
                if (line === 0) return { text: '  first  ' } as vscode.TextLine;
                if (line === 1) return { text: 'second' } as vscode.TextLine;
                throw new Error(`line ${line} out of range`);
            }
        } as unknown as vscode.TextDocument;
        sinon.stub(vscode.workspace, 'openTextDocument').resolves(document);
        assert.strictEqual(await getLineText(uri, 0), '  first  ');
        assert.strictEqual(await getLineText(uri, 1), 'second');
        assert.strictEqual(await getLineText(uri, 99), undefined);
    });

    test('getLineText returns undefined and logs when openTextDocument throws', async () => {
        const uri = vscode.Uri.file('/workspace/src/getline-missing.ts');
        sinon.stub(vscode.workspace, 'openTextDocument').rejects(new Error('cannot open'));
        assert.strictEqual(await getLineText(uri, 0), undefined);
    });
});
