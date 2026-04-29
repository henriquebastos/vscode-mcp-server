import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { disposeEditorAnnotationService, EditorAnnotationService } from '../editor/annotation-service';

suite('Editor Annotation Service', () => {
    let onDidChangeVisibleTextEditorsStub: sinon.SinonStub;
    let annotationServices: EditorAnnotationService[] = [];

    setup(() => {
        annotationServices = [];
        onDidChangeVisibleTextEditorsStub = sinon.stub(vscode.window, 'onDidChangeVisibleTextEditors').returns({ dispose: sinon.spy() } as unknown as vscode.Disposable);
    });

    teardown(() => {
        for (const service of [...annotationServices].reverse()) {
            service.dispose();
        }
        annotationServices = [];
        disposeEditorAnnotationService();
        sinon.restore();
    });

    function createAnnotationService(): EditorAnnotationService {
        const service = new EditorAnnotationService();
        let disposed = false;
        const originalDispose = service.dispose.bind(service);
        service.dispose = () => {
            if (disposed) {
                return;
            }
            disposed = true;
            originalDispose();
            annotationServices = annotationServices.filter(candidate => candidate !== service);
        };
        annotationServices.push(service);

        return service;
    }

    test('applies kinded highlights with overview ruler styling without changing selection', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const originalSelection = new vscode.Selection(0, 0, 0, 0);
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: { uri: documentUri },
            selection: originalSelection,
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const focusHighlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const focusCalloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const warningHighlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(focusHighlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(focusCalloutDecorationType);
        createDecorationTypeStub.onThirdCall().returns(warningHighlightDecorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();

        await service.setHighlights({
            kind: 'warning',
            ranges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }]
        });

        assert.strictEqual(createDecorationTypeStub.callCount, 3);
        assert.ok(createDecorationTypeStub.thirdCall.args[0].overviewRulerColor, 'warning highlight omitted overview ruler color');
        assert.ok(createDecorationTypeStub.thirdCall.args[0].overviewRulerLane, 'warning highlight omitted overview ruler lane');
        const warningDecorationCall = setDecorationsSpy.getCalls().find(call => call.args[0] === warningHighlightDecorationType);
        assert.ok(warningDecorationCall, 'warning highlight decoration was not applied');
        assert.strictEqual(warningDecorationCall.args[1].length, 1);
        assert.strictEqual(activeEditor.selection, originalSelection);
    });

    test('related highlights use background only without underline or outline', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();

        await service.setHighlights({
            kind: 'related',
            ranges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }]
        });

        const relatedOptions = createDecorationTypeStub.thirdCall.args[0] as vscode.DecorationRenderOptions;
        assert.strictEqual(relatedOptions.backgroundColor, 'rgba(96, 165, 250, 0.10)');
        assert.strictEqual(relatedOptions.border, undefined);
        assert.strictEqual(relatedOptions.borderColor, undefined);
        assert.strictEqual(relatedOptions.textDecoration, undefined);
        assert.ok(relatedOptions.overviewRulerColor, 'related highlight omitted overview ruler color');
    });

    test('sets hover notes as squiggle decorations with sanitized tooltips', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const focusHighlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const focusCalloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const hoverNoteDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(focusHighlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(focusCalloutDecorationType);
        createDecorationTypeStub.onThirdCall().returns(hoverNoteDecorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();

        await service.setHoverNote({
            kind: 'info',
            range: { start: { line: 1, character: 2 }, end: { line: 1, character: 8 } },
            title: 'Word note',
            message: 'Keep `code`, omit ![tracker](https://example.com/t.png), and strip [local](file:///tmp/secret).'
        });

        assert.ok((createDecorationTypeStub.thirdCall.args[0].textDecoration as string).includes('underline wavy'));
        const hoverCall = setDecorationsSpy.getCalls().find(call => call.args[0] === hoverNoteDecorationType);
        assert.ok(hoverCall, 'hover note decoration was not applied');
        const options = hoverCall.args[1] as vscode.DecorationOptions[];
        assert.strictEqual(options.length, 1);
        assert.strictEqual(options[0].range.start.line, 0);
        assert.strictEqual(options[0].range.start.character, 2);
        const hover = options[0].hoverMessage as vscode.MarkdownString;
        assert.ok(hover instanceof vscode.MarkdownString);
        assert.strictEqual(hover.isTrusted, false);
        assert.ok(hover.value.includes('Word note'));
        assert.ok(hover.value.includes('`code`'));
        assert.strictEqual(hover.value.includes('!['), false, 'image markdown was not neutralized');
        assert.strictEqual(hover.value.includes('file://'), false, 'unsafe link scheme was not stripped');
    });

    test('provides CodeLens notes for the target document with a harmless command', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const originalSelection = new vscode.Selection(0, 0, 0, 0);
        const activeEditor = {
            document: { uri: documentUri },
            selection: originalSelection,
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        let codeLensProvider: vscode.CodeLensProvider | undefined;
        const registerCodeLensProviderStub = sinon.stub(vscode.languages, 'registerCodeLensProvider').callsFake((_selector, provider) => {
            codeLensProvider = provider as vscode.CodeLensProvider;
            return { dispose: sinon.spy() };
        });
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();
        await service.setCodeLensNote({
            range: { start: { line: 2, character: 4 }, end: { line: 2, character: 10 } },
            title: 'Step 1: schema'
        });

        assert.strictEqual(registerCodeLensProviderStub.calledOnce, true, 'CodeLens provider was not registered');
        assert.ok(codeLensProvider, 'CodeLens provider was not captured');
        const tokenSource = new vscode.CancellationTokenSource();
        const codeLenses = await Promise.resolve(codeLensProvider.provideCodeLenses?.({ uri: documentUri } as vscode.TextDocument, tokenSource.token));
        tokenSource.dispose();

        assert.strictEqual(codeLenses?.length, 1);
        assert.strictEqual(codeLenses[0].range.start.line, 1);
        assert.strictEqual(codeLenses[0].range.start.character, 4);
        assert.strictEqual(codeLenses[0].command?.title, 'Step 1: schema');
        assert.strictEqual(codeLenses[0].command?.command, 'vscode-mcp-server.codelensNote.noop');
        assert.strictEqual(activeEditor.selection, originalSelection);
    });

    test('registers CodeLens no-op command and disposes it with the service', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        let codeLensProvider: vscode.CodeLensProvider | undefined;
        let noOpHandler: (() => unknown) | undefined;
        const commandDisposable = { dispose: sinon.spy() } as unknown as vscode.Disposable;
        const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand').callsFake((command: string, callback: (...args: unknown[]) => unknown) => {
            if (command === 'vscode-mcp-server.codelensNote.noop') {
                noOpHandler = () => callback();
            }
            return commandDisposable;
        });
        sinon.stub(vscode.languages, 'registerCodeLensProvider').callsFake((_selector, provider) => {
            codeLensProvider = provider as vscode.CodeLensProvider;
            return { dispose: sinon.spy() };
        });
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();
        await service.setCodeLensNote({
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Step 1'
        });
        assert.ok(codeLensProvider, 'CodeLens provider was not captured');
        const tokenSource = new vscode.CancellationTokenSource();
        const codeLenses = await Promise.resolve(codeLensProvider.provideCodeLenses?.({ uri: documentUri } as vscode.TextDocument, tokenSource.token));
        tokenSource.dispose();

        assert.strictEqual(registerCommandStub.calledWith('vscode-mcp-server.codelensNote.noop'), true);
        assert.strictEqual(codeLenses?.[0].command?.command, 'vscode-mcp-server.codelensNote.noop');
        assert.strictEqual(noOpHandler?.(), undefined);

        service.dispose();

        assert.strictEqual((commandDisposable.dispose as sinon.SinonSpy).calledOnce, true);
    });

    test('adds and replaces CodeLens notes by id without changing selection', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const originalSelection = new vscode.Selection(0, 0, 0, 0);
        const activeEditor = {
            document: { uri: documentUri },
            selection: originalSelection,
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        let codeLensProvider: vscode.CodeLensProvider | undefined;
        sinon.stub(vscode.languages, 'registerCodeLensProvider').callsFake((_selector, provider) => {
            codeLensProvider = provider as vscode.CodeLensProvider;
            return { dispose: sinon.spy() };
        });
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();
        await service.setCodeLensNote({
            id: 'walkthrough',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Step 1: schema'
        });
        const added = await service.setCodeLensNote({
            id: 'walkthrough',
            mode: 'add',
            kind: 'question',
            range: { start: { line: 2, character: 0 }, end: { line: 2, character: 4 } },
            title: 'Question to revisit'
        });

        assert.strictEqual(added.rangeCount, 2);
        assert.ok(codeLensProvider, 'CodeLens provider was not captured');
        const tokenSource = new vscode.CancellationTokenSource();
        const additiveLenses = await Promise.resolve(codeLensProvider.provideCodeLenses?.({ uri: documentUri } as vscode.TextDocument, tokenSource.token));
        assert.deepStrictEqual(additiveLenses?.map(lens => lens.command?.title), ['Step 1: schema', 'Question to revisit']);
        assert.strictEqual(additiveLenses?.[1].command?.tooltip, 'Guided explanation question note');

        const replaced = await service.setCodeLensNote({
            id: 'walkthrough',
            range: { start: { line: 3, character: 0 }, end: { line: 3, character: 4 } },
            title: 'Replacement step'
        });
        const replacementLenses = await Promise.resolve(codeLensProvider.provideCodeLenses?.({ uri: documentUri } as vscode.TextDocument, tokenSource.token));
        tokenSource.dispose();

        assert.strictEqual(replaced.rangeCount, 1);
        assert.strictEqual(replacementLenses?.length, 1);
        assert.strictEqual(replacementLenses?.[0].command?.title, 'Replacement step');
        assert.strictEqual(replacementLenses?.[0].range.start.line, 2);
        assert.strictEqual(activeEditor.selection, originalSelection);
    });

    test('CodeLens replace mode preserves other annotation surfaces for the same id', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        let visibleEditorsChangeListener: ((editors: readonly vscode.TextEditor[]) => void) | undefined;
        let codeLensProvider: vscode.CodeLensProvider | undefined;
        const highlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const calloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(highlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(calloutDecorationType);
        onDidChangeVisibleTextEditorsStub.callsFake((listener: (editors: readonly vscode.TextEditor[]) => void) => {
            visibleEditorsChangeListener = listener;
            return { dispose: sinon.spy() };
        });
        sinon.stub(vscode.languages, 'registerCodeLensProvider').callsFake((_selector, provider) => {
            codeLensProvider = provider as vscode.CodeLensProvider;
            return { dispose: sinon.spy() };
        });
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();
        await service.setHighlights({
            id: 'walkthrough',
            ranges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }]
        });
        await service.setCodeLensNote({
            id: 'walkthrough',
            range: { start: { line: 2, character: 0 }, end: { line: 2, character: 4 } },
            title: 'First step'
        });
        await service.setCodeLensNote({
            id: 'walkthrough',
            range: { start: { line: 3, character: 0 }, end: { line: 3, character: 4 } },
            title: 'Replacement step'
        });

        assert.ok(visibleEditorsChangeListener, 'visible editor change listener was not registered');
        visibleEditorsChangeListener([activeEditor]);
        const lastHighlightCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === highlightDecorationType).at(-1);
        assert.ok(lastHighlightCall, 'highlights were not reapplied after CodeLens replacement');
        assert.strictEqual(lastHighlightCall.args[1].length, 1);
        assert.strictEqual(lastHighlightCall.args[1][0].start.line, 0);
        assert.ok(codeLensProvider, 'CodeLens provider was not captured');
        const tokenSource = new vscode.CancellationTokenSource();
        const codeLenses = await Promise.resolve(codeLensProvider.provideCodeLenses?.({ uri: documentUri } as vscode.TextDocument, tokenSource.token));
        tokenSource.dispose();
        assert.deepStrictEqual(codeLenses?.map(lens => lens.command?.title), ['Replacement step']);
    });

    test('provides CodeLens notes for explicit paths when files are not visible', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const activeUri = vscode.Uri.file('/workspace/src/active.ts');
        const firstUri = vscode.Uri.file('/workspace/src/first.ts');
        const secondUri = vscode.Uri.file('/workspace/src/second.ts');
        const activeEditor = {
            document: { uri: activeUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        let codeLensProvider: vscode.CodeLensProvider | undefined;
        sinon.stub(vscode.languages, 'registerCodeLensProvider').callsFake((_selector, provider) => {
            codeLensProvider = provider as vscode.CodeLensProvider;
            return { dispose: sinon.spy() };
        });
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();
        await service.setCodeLensNote({
            id: 'flow',
            path: 'src/first.ts',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Caller'
        });
        const added = await service.setCodeLensNote({
            id: 'flow',
            mode: 'add',
            range: { path: 'src/second.ts', start: { line: 2, character: 1 }, end: { line: 2, character: 5 } },
            title: 'Definition'
        });

        assert.deepStrictEqual(added.paths, ['src/first.ts', 'src/second.ts']);
        assert.ok(codeLensProvider, 'CodeLens provider was not captured');
        const tokenSource = new vscode.CancellationTokenSource();
        const firstLenses = await Promise.resolve(codeLensProvider.provideCodeLenses?.({ uri: firstUri } as vscode.TextDocument, tokenSource.token));
        const secondLenses = await Promise.resolve(codeLensProvider.provideCodeLenses?.({ uri: secondUri } as vscode.TextDocument, tokenSource.token));
        tokenSource.dispose();

        assert.deepStrictEqual(firstLenses?.map(lens => lens.command?.title), ['Caller']);
        assert.deepStrictEqual(secondLenses?.map(lens => lens.command?.title), ['Definition']);
        assert.strictEqual(secondLenses?.[0].range.start.line, 1);
        assert.strictEqual(secondLenses?.[0].range.start.character, 1);
    });

    test('clears CodeLens notes by id while preserving other ids and refreshing the provider', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        let codeLensProvider: vscode.CodeLensProvider | undefined;
        sinon.stub(vscode.languages, 'registerCodeLensProvider').callsFake((_selector, provider) => {
            codeLensProvider = provider as vscode.CodeLensProvider;
            return { dispose: sinon.spy() };
        });
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();
        assert.ok(codeLensProvider, 'CodeLens provider was not captured');
        let refreshCount = 0;
        const refreshDisposable = codeLensProvider.onDidChangeCodeLenses?.(() => {
            refreshCount += 1;
        });
        await service.setCodeLensNote({
            id: 'flow',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Step 1'
        });
        await service.setCodeLensNote({
            id: 'keep',
            range: { start: { line: 2, character: 0 }, end: { line: 2, character: 4 } },
            title: 'Keep me'
        });

        const result = await service.clearAnnotations({ id: 'flow' });
        const tokenSource = new vscode.CancellationTokenSource();
        const remainingLenses = await Promise.resolve(codeLensProvider.provideCodeLenses?.({ uri: documentUri } as vscode.TextDocument, tokenSource.token));
        tokenSource.dispose();
        refreshDisposable?.dispose();

        assert.strictEqual(result.clearedIds, 1);
        assert.deepStrictEqual(result.clearedPaths, ['src/example.ts']);
        assert.deepStrictEqual(remainingLenses?.map(lens => lens.command?.title), ['Keep me']);
        assert.strictEqual(refreshCount, 3);
    });

    test('clears CodeLens notes by path and globally', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const firstUri = vscode.Uri.file('/workspace/src/first.ts');
        const secondUri = vscode.Uri.file('/workspace/src/second.ts');
        const activeEditor = {
            document: { uri: firstUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        let codeLensProvider: vscode.CodeLensProvider | undefined;
        sinon.stub(vscode.languages, 'registerCodeLensProvider').callsFake((_selector, provider) => {
            codeLensProvider = provider as vscode.CodeLensProvider;
            return { dispose: sinon.spy() };
        });
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();
        await service.setCodeLensNote({
            id: 'flow',
            path: 'src/first.ts',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Remove first'
        });
        await service.setCodeLensNote({
            id: 'flow',
            mode: 'add',
            path: 'src/second.ts',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Keep second'
        });

        const pathResult = await service.clearAnnotations({ path: 'src/first.ts' });
        assert.ok(codeLensProvider, 'CodeLens provider was not captured');
        const tokenSource = new vscode.CancellationTokenSource();
        const firstAfterPathClear = await Promise.resolve(codeLensProvider.provideCodeLenses?.({ uri: firstUri } as vscode.TextDocument, tokenSource.token));
        const secondAfterPathClear = await Promise.resolve(codeLensProvider.provideCodeLenses?.({ uri: secondUri } as vscode.TextDocument, tokenSource.token));

        assert.strictEqual(pathResult.clearedIds, 1);
        assert.deepStrictEqual(pathResult.clearedPaths, ['src/first.ts']);
        assert.deepStrictEqual(firstAfterPathClear?.map(lens => lens.command?.title), []);
        assert.deepStrictEqual(secondAfterPathClear?.map(lens => lens.command?.title), ['Keep second']);

        const allResult = await service.clearAnnotations({ all: true });
        const secondAfterGlobalClear = await Promise.resolve(codeLensProvider.provideCodeLenses?.({ uri: secondUri } as vscode.TextDocument, tokenSource.token));
        tokenSource.dispose();

        assert.strictEqual(allResult.clearedIds, 1);
        assert.deepStrictEqual(allResult.clearedPaths, ['src/second.ts']);
        assert.deepStrictEqual(secondAfterGlobalClear?.map(lens => lens.command?.title), []);
    });

    test('path-limited clear removes both highlights and callouts for the id', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: {
                uri: documentUri,
                lineAt: sinon.stub().withArgs(0).returns({ range: new vscode.Range(0, 0, 0, 18) })
            },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const highlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const calloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(highlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(calloutDecorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();
        await service.setHighlights({
            id: 'current',
            ranges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }]
        });
        await service.setInlineCallout({
            id: 'current',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Note',
            message: 'Same path.'
        });

        await service.clearAnnotations({ id: 'current', path: 'src/example.ts' });

        const lastHighlightCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === highlightDecorationType).at(-1);
        const lastCalloutCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === calloutDecorationType).at(-1);
        assert.ok(lastHighlightCall, 'highlight decorations were not cleared');
        assert.ok(lastCalloutCall, 'callout decorations were not cleared');
        assert.strictEqual(lastHighlightCall.args[1].length, 0);
        assert.strictEqual(lastCalloutCall.args[1].length, 0);
    });

    test('path-limited clear removes all annotation surfaces while preserving other paths', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const firstUri = vscode.Uri.file('/workspace/src/first.ts');
        const secondUri = vscode.Uri.file('/workspace/src/second.ts');
        const firstSetDecorationsSpy = sinon.spy();
        const secondSetDecorationsSpy = sinon.spy();
        const firstEditor = {
            document: {
                uri: firstUri,
                lineAt: sinon.stub().withArgs(0).returns({ range: new vscode.Range(0, 0, 0, 20) })
            },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: firstSetDecorationsSpy
        } as unknown as vscode.TextEditor;
        const secondEditor = {
            document: {
                uri: secondUri,
                lineAt: sinon.stub().withArgs(0).returns({ range: new vscode.Range(0, 0, 0, 20) })
            },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: secondSetDecorationsSpy
        } as unknown as vscode.TextEditor;
        const highlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const calloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const gutterDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const hoverNoteDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(highlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(calloutDecorationType);
        createDecorationTypeStub.onThirdCall().returns(gutterDecorationType);
        createDecorationTypeStub.onCall(3).returns(hoverNoteDecorationType);
        const firstThread = { dispose: sinon.spy(), canReply: true } as unknown as vscode.CommentThread;
        const secondThread = { dispose: sinon.spy(), canReply: true } as unknown as vscode.CommentThread;
        const controller = {
            id: 'guided-explanation',
            label: 'Guided Explanation',
            createCommentThread: sinon.stub().onFirstCall().returns(firstThread).onSecondCall().returns(secondThread),
            dispose: sinon.spy()
        } as unknown as vscode.CommentController;
        sinon.stub(vscode.comments, 'createCommentController').returns(controller);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(firstEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([firstEditor, secondEditor]);

        const service = createAnnotationService();
        await service.setHighlights({
            id: 'flow',
            path: 'src/first.ts',
            ranges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }]
        });
        await service.setHighlights({
            id: 'flow',
            path: 'src/second.ts',
            mode: 'add',
            ranges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }]
        });
        await service.setInlineCallout({
            id: 'flow',
            path: 'src/first.ts',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'First',
            message: 'Remove me.'
        });
        await service.setInlineCallout({
            id: 'flow',
            path: 'src/second.ts',
            mode: 'add',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Second',
            message: 'Keep me.'
        });
        await service.setGutterMarkers({ id: 'flow', path: 'src/first.ts', lines: [1] });
        await service.setGutterMarkers({ id: 'flow', path: 'src/second.ts', mode: 'add', lines: [1] });
        await service.setHoverNote({
            id: 'flow',
            path: 'src/first.ts',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'First',
            message: 'Remove me.'
        });
        await service.setHoverNote({
            id: 'flow',
            path: 'src/second.ts',
            mode: 'add',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Second',
            message: 'Keep me.'
        });
        await service.setExplanationComment({
            id: 'flow',
            path: 'src/first.ts',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'First',
            body: 'Remove me.'
        });
        await service.setExplanationComment({
            id: 'flow',
            path: 'src/second.ts',
            mode: 'add',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Second',
            body: 'Keep me.'
        });

        const result = await service.clearAnnotations({ path: 'src/first.ts' });

        assert.strictEqual(result.clearedIds, 1);
        assert.deepStrictEqual(result.clearedPaths, ['src/first.ts']);
        assert.strictEqual((firstThread.dispose as sinon.SinonSpy).calledOnce, true);
        assert.strictEqual((secondThread.dispose as sinon.SinonSpy).notCalled, true);
        for (const decorationType of [highlightDecorationType, calloutDecorationType, gutterDecorationType, hoverNoteDecorationType]) {
            const firstClearCall = firstSetDecorationsSpy.getCalls().filter(call => call.args[0] === decorationType).at(-1);
            const secondKeepCall = secondSetDecorationsSpy.getCalls().filter(call => call.args[0] === decorationType).at(-1);
            assert.ok(firstClearCall, 'first editor did not receive a clear call');
            assert.ok(secondKeepCall, 'second editor did not receive a preservation call');
            assert.strictEqual(firstClearCall.args[1].length, 0);
            assert.strictEqual(secondKeepCall.args[1].length, 1);
        }
    });

    test('reapplies stored decorations when visible editors change', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const firstUri = vscode.Uri.file('/workspace/src/first.ts');
        const secondUri = vscode.Uri.file('/workspace/src/second.ts');
        const firstSetDecorationsSpy = sinon.spy();
        const secondSetDecorationsSpy = sinon.spy();
        const firstEditor = {
            document: { uri: firstUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: firstSetDecorationsSpy
        } as unknown as vscode.TextEditor;
        const secondEditor = {
            document: { uri: secondUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: secondSetDecorationsSpy
        } as unknown as vscode.TextEditor;
        const highlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const calloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        let visibleEditors = [firstEditor];
        let visibleEditorsChangeListener: ((editors: readonly vscode.TextEditor[]) => void) | undefined;

        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(highlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(calloutDecorationType);
        onDidChangeVisibleTextEditorsStub.callsFake((listener: (editors: readonly vscode.TextEditor[]) => void) => {
            visibleEditorsChangeListener = listener;
            return { dispose: sinon.spy() };
        });
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(firstEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').get(() => visibleEditors);

        const service = createAnnotationService();
        await service.setHighlights({
            path: 'src/second.ts',
            ranges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }]
        });

        visibleEditors = [secondEditor];
        assert.ok(visibleEditorsChangeListener, 'visible editor change listener was not registered');
        visibleEditorsChangeListener([secondEditor]);

        const reapplyCall = secondSetDecorationsSpy.getCalls().filter(call => call.args[0] === highlightDecorationType).at(-1);
        assert.ok(reapplyCall, 'newly visible editor did not receive stored highlight decorations');
        assert.strictEqual(reapplyCall.args[1].length, 1);
    });

    test('dispose releases decoration types, comments, CodeLens provider, and controller state', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const highlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const calloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const gutterDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const codeLensProviderDisposable = { dispose: sinon.spy() } as unknown as vscode.Disposable;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(highlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(calloutDecorationType);
        createDecorationTypeStub.onThirdCall().returns(gutterDecorationType);
        sinon.stub(vscode.languages, 'registerCodeLensProvider').returns(codeLensProviderDisposable);
        const thread = { dispose: sinon.spy(), canReply: true } as unknown as vscode.CommentThread;
        const controller = {
            id: 'guided-explanation',
            label: 'Guided Explanation',
            createCommentThread: sinon.stub().returns(thread),
            dispose: sinon.spy()
        } as unknown as vscode.CommentController;
        sinon.stub(vscode.comments, 'createCommentController').returns(controller);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();
        await service.setGutterMarkers({ lines: [1] });
        await service.setExplanationComment({
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Dispose me',
            body: 'Temporary note.'
        });
        await service.setCodeLensNote({
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Dispose CodeLens'
        });

        service.dispose();

        assert.strictEqual((highlightDecorationType.dispose as sinon.SinonSpy).calledOnce, true);
        assert.strictEqual((calloutDecorationType.dispose as sinon.SinonSpy).calledOnce, true);
        assert.strictEqual((gutterDecorationType.dispose as sinon.SinonSpy).calledOnce, true);
        assert.strictEqual((codeLensProviderDisposable.dispose as sinon.SinonSpy).calledOnce, true);
        assert.strictEqual((thread.dispose as sinon.SinonSpy).calledOnce, true);
        assert.strictEqual((controller.dispose as sinon.SinonSpy).calledOnce, true);
    });

    test('id clear removes gutter markers and explanation comments while preserving other ids', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const highlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const calloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const gutterDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(highlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(calloutDecorationType);
        createDecorationTypeStub.onThirdCall().returns(gutterDecorationType);
        const flowThread = { dispose: sinon.spy(), canReply: true } as unknown as vscode.CommentThread;
        const keepThread = { dispose: sinon.spy(), canReply: true } as unknown as vscode.CommentThread;
        const controller = {
            id: 'guided-explanation',
            label: 'Guided Explanation',
            createCommentThread: sinon.stub().onFirstCall().returns(flowThread).onSecondCall().returns(keepThread),
            dispose: sinon.spy()
        } as unknown as vscode.CommentController;
        sinon.stub(vscode.comments, 'createCommentController').returns(controller);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();
        await service.setGutterMarkers({ id: 'flow', lines: [1] });
        await service.setExplanationComment({
            id: 'flow',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Flow',
            body: 'Remove me.'
        });
        await service.setGutterMarkers({ id: 'keep', lines: [2] });
        await service.setExplanationComment({
            id: 'keep',
            range: { start: { line: 2, character: 0 }, end: { line: 2, character: 4 } },
            title: 'Keep',
            body: 'Keep me.'
        });

        const result = await service.clearAnnotations({ id: 'flow' });

        assert.strictEqual(result.clearedIds, 1);
        assert.strictEqual((flowThread.dispose as sinon.SinonSpy).calledOnce, true);
        assert.strictEqual((keepThread.dispose as sinon.SinonSpy).notCalled, true);
        const markerCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === gutterDecorationType).at(-1);
        assert.ok(markerCall, 'gutter markers were not reapplied after id clear');
        assert.strictEqual(markerCall.args[1].length, 1);
        assert.strictEqual(markerCall.args[1][0].range.start.line, 1);
    });

    test('global clear removes gutter markers and explanation comments', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const highlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const calloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const gutterDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(highlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(calloutDecorationType);
        createDecorationTypeStub.onThirdCall().returns(gutterDecorationType);
        const thread = { dispose: sinon.spy(), canReply: true } as unknown as vscode.CommentThread;
        const controller = {
            id: 'guided-explanation',
            label: 'Guided Explanation',
            createCommentThread: sinon.stub().returns(thread),
            dispose: sinon.spy()
        } as unknown as vscode.CommentController;
        sinon.stub(vscode.comments, 'createCommentController').returns(controller);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();
        await service.setGutterMarkers({ id: 'flow', lines: [1] });
        await service.setExplanationComment({
            id: 'flow',
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Flow',
            body: 'Remove me.'
        });

        const result = await service.clearAnnotations({ all: true });

        assert.strictEqual(result.clearedIds, 1);
        assert.deepStrictEqual(result.clearedPaths, ['src/example.ts']);
        assert.strictEqual((thread.dispose as sinon.SinonSpy).calledOnce, true);
        const markerCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === gutterDecorationType).at(-1);
        assert.ok(markerCall, 'gutter markers were not cleared after global clear');
        assert.strictEqual(markerCall.args[1].length, 0);
    });

    test('clears one annotation id while preserving other groups', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const highlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const calloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(highlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(calloutDecorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();
        await service.setHighlights({
            id: 'current',
            ranges: [{ start: { line: 1, character: 0 }, end: { line: 1, character: 4 } }]
        });
        await service.setHighlights({
            id: 'related',
            ranges: [{ start: { line: 2, character: 0 }, end: { line: 2, character: 4 } }]
        });

        const result = await service.clearAnnotations({ id: 'current' });

        assert.strictEqual(result.clearedIds, 1);
        const lastHighlightCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === highlightDecorationType).at(-1);
        assert.ok(lastHighlightCall, 'highlight decorations were not reapplied');
        assert.strictEqual(lastHighlightCall.args[1].length, 1);
        const remainingRange = lastHighlightCall.args[1][0] as vscode.Range;
        assert.strictEqual(remainingRange.start.line, 1);
    });

    test('creates guided explanation comments as no-reply temporary comment threads', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const thread = {
            uri: documentUri,
            range: undefined,
            comments: [],
            collapsibleState: vscode.CommentThreadCollapsibleState.Collapsed,
            canReply: true,
            dispose: sinon.spy()
        } as unknown as vscode.CommentThread;
        const createCommentThreadStub = sinon.stub().returns(thread);
        const controller = {
            id: 'guided-explanation',
            label: 'Guided Explanation',
            createCommentThread: createCommentThreadStub,
            dispose: sinon.spy()
        } as unknown as vscode.CommentController;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.comments, 'createCommentController').returns(controller);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();

        await service.setExplanationComment({
            kind: 'question',
            range: { start: { line: 2, character: 4 }, end: { line: 3, character: 10 } },
            title: 'Why branch here?',
            body: '**This** explains the branch.'
        });

        assert.strictEqual((vscode.comments.createCommentController as sinon.SinonStub).firstCall.args[1], 'Guided Explanation');
        assert.strictEqual(createCommentThreadStub.firstCall.args[0].toString(), documentUri.toString());
        assert.strictEqual(createCommentThreadStub.firstCall.args[1].start.line, 1);
        const comments = createCommentThreadStub.firstCall.args[2] as vscode.Comment[];
        assert.strictEqual(comments[0].mode, vscode.CommentMode.Preview);
        assert.strictEqual(comments[0].author.name, 'Guided Explanation');
        assert.ok(comments[0].body instanceof vscode.MarkdownString);
        assert.strictEqual((comments[0].body as vscode.MarkdownString).isTrusted, false);
        assert.ok((comments[0].body as vscode.MarkdownString).value.includes('Why branch here?'));
        assert.ok((comments[0].body as vscode.MarkdownString).value.includes('**This** explains the branch.'));
        assert.strictEqual(thread.canReply, false);
        assert.strictEqual(thread.collapsibleState, vscode.CommentThreadCollapsibleState.Expanded);
        assert.strictEqual(thread.label, 'Guided Explanation: Why branch here?');
    });

    test('adds and replaces guided explanation comments by id', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const firstThread = { dispose: sinon.spy(), canReply: true } as unknown as vscode.CommentThread;
        const secondThread = { dispose: sinon.spy(), canReply: true } as unknown as vscode.CommentThread;
        const replacementThread = { dispose: sinon.spy(), canReply: true } as unknown as vscode.CommentThread;
        const createCommentThreadStub = sinon.stub();
        createCommentThreadStub.onFirstCall().returns(firstThread);
        createCommentThreadStub.onSecondCall().returns(secondThread);
        createCommentThreadStub.onThirdCall().returns(replacementThread);
        const controller = {
            id: 'guided-explanation',
            label: 'Guided Explanation',
            createCommentThread: createCommentThreadStub,
            dispose: sinon.spy()
        } as unknown as vscode.CommentController;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.comments, 'createCommentController').returns(controller);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();

        await service.setExplanationComment({
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'First',
            body: 'First note.'
        });
        const added = await service.setExplanationComment({
            mode: 'add',
            range: { start: { line: 2, character: 0 }, end: { line: 2, character: 4 } },
            title: 'Second',
            body: 'Second note.'
        });

        assert.strictEqual(added.rangeCount, 2);
        assert.strictEqual((firstThread.dispose as sinon.SinonSpy).notCalled, true);
        assert.strictEqual((secondThread.dispose as sinon.SinonSpy).notCalled, true);

        const replaced = await service.setExplanationComment({
            range: { start: { line: 3, character: 0 }, end: { line: 3, character: 4 } },
            title: 'Replacement',
            body: 'Replacement note.'
        });

        assert.strictEqual(replaced.rangeCount, 1);
        assert.strictEqual((firstThread.dispose as sinon.SinonSpy).calledOnce, true);
        assert.strictEqual((secondThread.dispose as sinon.SinonSpy).calledOnce, true);
        assert.strictEqual((replacementThread.dispose as sinon.SinonSpy).notCalled, true);
    });

    test('sanitizes explanation markdown resources and escapes marker labels', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const focusHighlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const focusCalloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const focusMarkerDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(focusHighlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(focusCalloutDecorationType);
        createDecorationTypeStub.onThirdCall().returns(focusMarkerDecorationType);
        const thread = { dispose: sinon.spy(), canReply: true } as unknown as vscode.CommentThread;
        const createCommentThreadStub = sinon.stub().returns(thread);
        const controller = {
            id: 'guided-explanation',
            label: 'Guided Explanation',
            createCommentThread: createCommentThreadStub,
            dispose: sinon.spy()
        } as unknown as vscode.CommentController;
        sinon.stub(vscode.comments, 'createCommentController').returns(controller);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();

        await service.setExplanationComment({
            range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
            title: 'Resources',
            body: 'Keep `code`, omit ![tracker](https://example.com/t.png), and strip [local](file:///tmp/secret).'
        });
        await service.setGutterMarkers({
            lines: [1],
            label: '**not bold** [not a link](https://example.com)'
        });

        const comments = createCommentThreadStub.firstCall.args[2] as vscode.Comment[];
        const markdown = comments[0].body as vscode.MarkdownString;
        assert.ok(markdown.value.includes('`code`'), 'safe markdown was not preserved');
        assert.strictEqual(markdown.value.includes('!['), false, 'image markdown was not neutralized');
        assert.strictEqual(markdown.value.includes('file://'), false, 'unsafe link scheme was not stripped');

        const markerCall = setDecorationsSpy.getCalls().find(call => call.args[0] === focusMarkerDecorationType);
        assert.ok(markerCall, 'gutter marker decoration was not applied');
        const hover = markerCall.args[1][0].hoverMessage as vscode.MarkdownString;
        assert.ok(hover instanceof vscode.MarkdownString, 'marker label was not converted to MarkdownString');
        assert.strictEqual(hover.isTrusted, false);
        assert.ok(hover.value.includes('\\*\\*not bold\\*\\*'), 'marker label markdown was not escaped');
    });

    test('gutter markers align icon color with highlight kind', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: sinon.spy()
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();

        await service.setGutterMarkers({ id: 'focus-marker', kind: 'focus', lines: [1] });
        await service.setGutterMarkers({ id: 'warning-marker', kind: 'warning', lines: [2] });

        const gutterIconPaths = createDecorationTypeStub.getCalls()
            .map(call => call.args[0] as vscode.DecorationRenderOptions)
            .filter(options => options.gutterIconPath)
            .map(options => options.gutterIconPath?.toString());
        assert.strictEqual(gutterIconPaths.length, 2);
        assert.notStrictEqual(gutterIconPaths[0], gutterIconPaths[1]);
        assert.ok(gutterIconPaths[0]?.includes('facc15'), 'focus marker did not use focus icon color');
        assert.ok(gutterIconPaths[1]?.includes('f59e0b'), 'warning marker did not use warning icon color');
    });

    test('sets kinded gutter markers from lines without changing selection', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const originalSelection = new vscode.Selection(0, 0, 0, 0);
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: { uri: documentUri },
            selection: originalSelection,
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const focusHighlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const focusCalloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const warningMarkerDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(focusHighlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(focusCalloutDecorationType);
        createDecorationTypeStub.onThirdCall().returns(warningMarkerDecorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();

        await service.setGutterMarkers({
            kind: 'warning',
            label: 'Risky branch',
            lines: [2, 4]
        });

        assert.ok(createDecorationTypeStub.thirdCall.args[0].gutterIconPath, 'gutter marker omitted gutter icon');
        assert.ok(createDecorationTypeStub.thirdCall.args[0].overviewRulerColor, 'gutter marker omitted overview ruler color');
        const markerDecorationCall = setDecorationsSpy.getCalls().find(call => call.args[0] === warningMarkerDecorationType);
        assert.ok(markerDecorationCall, 'warning gutter marker decoration was not applied');
        const markerOptions = markerDecorationCall.args[1] as vscode.DecorationOptions[];
        assert.strictEqual(markerOptions.length, 2);
        assert.strictEqual(markerOptions[0].range.start.line, 1);
        assert.ok(markerOptions[0].hoverMessage, 'gutter marker omitted label hover message');
        assert.strictEqual(activeEditor.selection, originalSelection);
    });

    test('adds and replaces gutter markers from ranges', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: { uri: documentUri },
            selection: new vscode.Selection(0, 0, 0, 0),
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const focusHighlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const focusCalloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const focusMarkerDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(focusHighlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(focusCalloutDecorationType);
        createDecorationTypeStub.onThirdCall().returns(focusMarkerDecorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();

        await service.setGutterMarkers({ lines: [1] });
        await service.setGutterMarkers({
            mode: 'add',
            ranges: [{ start: { line: 2, character: 3 }, end: { line: 2, character: 8 } }]
        });

        const additiveCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === focusMarkerDecorationType).at(-1);
        assert.ok(additiveCall, 'additive gutter marker decoration was not applied');
        assert.strictEqual(additiveCall.args[1].length, 2);

        await service.setGutterMarkers({ lines: [4] });

        const replacementCall = setDecorationsSpy.getCalls().filter(call => call.args[0] === focusMarkerDecorationType).at(-1);
        assert.ok(replacementCall, 'replacement gutter marker decoration was not applied');
        assert.strictEqual(replacementCall.args[1].length, 1);
        assert.strictEqual(replacementCall.args[1][0].range.start.line, 3);
    });

    test('applies kinded inline callouts without changing selection', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const originalSelection = new vscode.Selection(0, 0, 0, 0);
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: {
                uri: documentUri,
                lineAt: sinon.stub().withArgs(1).returns({ range: new vscode.Range(1, 0, 1, 24) })
            },
            selection: originalSelection,
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const focusHighlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const focusCalloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const questionCalloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(focusHighlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(focusCalloutDecorationType);
        createDecorationTypeStub.onThirdCall().returns(questionCalloutDecorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();

        await service.setInlineCallout({
            kind: 'question',
            range: { start: { line: 2, character: 4 }, end: { line: 2, character: 10 } },
            title: 'Question',
            message: 'Why does this branch matter?'
        });

        assert.strictEqual(createDecorationTypeStub.callCount, 3);
        assert.ok(createDecorationTypeStub.thirdCall.args[0].after?.color, 'question callout omitted kinded color');
        const questionDecorationCall = setDecorationsSpy.getCalls().find(call => call.args[0] === questionCalloutDecorationType);
        assert.ok(questionDecorationCall, 'question callout decoration was not applied');
        assert.strictEqual(questionDecorationCall.args[1].length, 1);
        assert.strictEqual(activeEditor.selection, originalSelection);
    });

    test('sets visible inline callouts by id without changing selection', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const originalSelection = new vscode.Selection(0, 0, 0, 0);
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: {
                uri: documentUri,
                lineAt: sinon.stub().withArgs(1).returns({ range: new vscode.Range(1, 0, 1, 24) })
            },
            selection: originalSelection,
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const highlightDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;
        const calloutDecorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        const createDecorationTypeStub = sinon.stub(vscode.window, 'createTextEditorDecorationType');
        createDecorationTypeStub.onFirstCall().returns(highlightDecorationType);
        createDecorationTypeStub.onSecondCall().returns(calloutDecorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();

        await service.setInlineCallout({
            range: { start: { line: 2, character: 4 }, end: { line: 2, character: 10 } },
            title: 'Factory',
            message: 'Builds the server instance.'
        });

        const calloutOptions = setDecorationsSpy.lastCall.args[1] as vscode.DecorationOptions[];
        assert.strictEqual(setDecorationsSpy.lastCall.args[0], calloutDecorationType);
        assert.strictEqual(calloutOptions.length, 1);
        assert.strictEqual(calloutOptions[0].range.start.line, 1);
        assert.strictEqual(calloutOptions[0].range.start.character, 24);
        assert.strictEqual(calloutOptions[0].renderOptions?.after?.contentText, '  Factory: Builds the server instance.');
        assert.strictEqual(activeEditor.selection, originalSelection);
    });

    test('sets multi-range highlights by id and replaces that id by default without changing selection', async () => {
        const workspaceUri = vscode.Uri.file('/workspace');
        const documentUri = vscode.Uri.file('/workspace/src/example.ts');
        const originalSelection = new vscode.Selection(0, 0, 0, 0);
        const setDecorationsSpy = sinon.spy();
        const activeEditor = {
            document: { uri: documentUri },
            selection: originalSelection,
            setDecorations: setDecorationsSpy
        } as unknown as vscode.TextEditor;
        const decorationType = { dispose: sinon.spy() } as unknown as vscode.TextEditorDecorationType;

        sinon.stub(vscode.window, 'createTextEditorDecorationType').returns(decorationType);
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: workspaceUri, name: 'workspace', index: 0 }]);
        sinon.stub(vscode.window, 'activeTextEditor').value(activeEditor);
        sinon.stub(vscode.window, 'visibleTextEditors').value([activeEditor]);

        const service = createAnnotationService();

        await service.setHighlights({
            ranges: [
                { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
                { start: { line: 2, character: 2 }, end: { line: 2, character: 8 } }
            ]
        });

        assert.strictEqual(setDecorationsSpy.calledOnce, true, 'highlight decorations were not applied');
        assert.strictEqual(setDecorationsSpy.firstCall.args[0], decorationType);
        assert.strictEqual(setDecorationsSpy.firstCall.args[1].length, 2);
        assert.strictEqual(activeEditor.selection, originalSelection);

        await service.setHighlights({
            ranges: [
                { start: { line: 3, character: 1 }, end: { line: 3, character: 5 } }
            ]
        });

        assert.strictEqual(setDecorationsSpy.lastCall.args[1].length, 1, 'replacement did not narrow the current highlight group');
        const replacementRange = setDecorationsSpy.lastCall.args[1][0] as vscode.Range;
        assert.strictEqual(replacementRange.start.line, 2);
        assert.strictEqual(replacementRange.start.character, 1);
        assert.strictEqual(activeEditor.selection, originalSelection);
    });
});
