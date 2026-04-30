import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as proxyquireLib from 'proxyquire';
import { createMockContext } from './testUtils';

// Configure proxyquire
const proxyquire = proxyquireLib.noPreserveCache().noCallThru();

suite('Extension Test Suite', () => {
    let mockMCPServer: any;
    let MockServerConstructor: sinon.SinonStub;
    let extension: any;
    let workspaceConfig: any;
    let statusBarItem: any;
    let context: any; // Changed type to any to avoid type errors
    let getConfigurationStub: sinon.SinonStub;
    let createStatusBarItemStub: sinon.SinonStub;
    let registerCommandStub: sinon.SinonStub;
    let onDidChangeConfigurationStub: sinon.SinonStub;
    let showInformationMessageStub: sinon.SinonStub;
    let showErrorMessageStub: sinon.SinonStub;
    let disposeFeedbackCaptureService: sinon.SinonSpy;

    setup(() => {
        // Create mock MCPServer
        mockMCPServer = {
            start: sinon.stub().resolves(),
            stop: sinon.stub().resolves(),
            setupTools: sinon.spy(),
            setFileListingCallback: sinon.spy()
        };
        
        // Mock constructor for MCPServer
        MockServerConstructor = sinon.stub().returns(mockMCPServer);
        disposeFeedbackCaptureService = sinon.spy();
        
        // Load extension with mocked dependencies
        extension = proxyquire('../extension', {
            './server': { MCPServer: MockServerConstructor },
            './editor/feedback-service': { disposeFeedbackCaptureService },
            './utils/logger': {
                logger: {
                    info: sinon.spy(),
                    warn: sinon.spy(),
                    error: sinon.spy(),
                    dispose: sinon.spy()
                }
            }
        });
        
        // Create mock status bar item
        statusBarItem = {
            text: '',
            tooltip: '',
            command: '',
            show: sinon.spy(),
            dispose: sinon.spy()
        };
        
        // Mock vscode.window.createStatusBarItem
        createStatusBarItemStub = sinon.stub(vscode.window, 'createStatusBarItem').returns(statusBarItem);
        
        // Mock configuration
        workspaceConfig = {
            get: sinon.stub()
        };
        workspaceConfig.get.withArgs('port').returns(4321);
        getConfigurationStub = sinon.stub(vscode.workspace, 'getConfiguration').returns(workspaceConfig);
        
        // Create a mocked extension context
        context = createMockContext();
        
        // Mock command registration
        registerCommandStub = sinon.stub(vscode.commands, 'registerCommand').returns({
            dispose: sinon.spy()
        });
        
        // Mock onDidChangeConfiguration
        onDidChangeConfigurationStub = sinon.stub(vscode.workspace, 'onDidChangeConfiguration').returns({
            dispose: sinon.spy()
        });

        showInformationMessageStub = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined);
        showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    });

    teardown(() => {
        // Restore all sinon stubs and mocks after each test
        sinon.restore();
    });

    test('Extension should read port from configuration', async () => {
        workspaceConfig.get.withArgs('defaultEnabled').returns(true);

        // Activate the extension
        await extension.activate(context);
        
        // Check that configuration was accessed
        assert.strictEqual(getConfigurationStub.called, true, 'Configuration not accessed');
        assert.strictEqual(workspaceConfig.get.calledWith('port'), true, 'Port not read from configuration');
        
        // Check that MCPServer was created with configured port
        assert.strictEqual(MockServerConstructor.calledWith(4321), true, 'MCPServer not created with configured port');
    });

    test('Editor tools should be enabled by default in tool configuration', async () => {
        workspaceConfig.get.withArgs('defaultEnabled').returns(true);
        workspaceConfig.get.withArgs('enabledTools').returns({});

        await extension.activate(context);

        const toolConfig = MockServerConstructor.firstCall.args[2];
        assert.strictEqual(toolConfig.editor, true, 'Editor tools were not enabled by default');
    });

    test('Editor tools should respect disabled configuration', async () => {
        workspaceConfig.get.withArgs('defaultEnabled').returns(true);
        workspaceConfig.get.withArgs('enabledTools').returns({ editor: false });

        await extension.activate(context);

        const toolConfig = MockServerConstructor.firstCall.args[2];
        assert.strictEqual(toolConfig.editor, false, 'Editor tools ignored disabled configuration');
    });

    test('Status bar item should be created with proper attributes', async () => {
        // Activate the extension
        await extension.activate(context);
        
        // Verify status bar was created
        assert.strictEqual(createStatusBarItemStub.called, true, 'Status bar item not created');
        
        // Check the status bar attributes
        assert.strictEqual(statusBarItem.command, 'vscode-mcp-server.toggleServer', 'Status bar command not set correctly');
        assert.strictEqual(statusBarItem.show.called, true, 'Status bar not shown');
        assert.strictEqual(statusBarItem.text, '$(server) MCP Server: Off', 'Status bar does not show disabled state');
    });

    test('Server info command should be registered', async () => {
        // Activate the extension
        await extension.activate(context);
        
        // Check that the command was registered
        const showServerInfoCall = registerCommandStub.getCalls().find(
            call => call.args[0] === 'vscode-mcp-server.showServerInfo'
        );
        assert.strictEqual(showServerInfoCall !== undefined, true, 'Server info command not registered');
    });

    test('Server info formats IPv6 loopback hosts as bracketed URLs', async () => {
        workspaceConfig.get.withArgs('defaultEnabled').returns(true);
        workspaceConfig.get.withArgs('host', '127.0.0.1').returns('::1');

        await extension.activate(context);

        const showServerInfoCall = registerCommandStub.getCalls().find(
            call => call.args[0] === 'vscode-mcp-server.showServerInfo'
        );
        assert.ok(showServerInfoCall, 'Server info command not registered');

        showServerInfoCall.args[1]();

        assert.strictEqual(
            showInformationMessageStub.lastCall.args[0],
            'MCP Server is running at http://[::1]:4321/mcp'
        );
    });

    test('Guided feedback commands should be registered', async () => {
        await extension.activate(context);

        const registeredCommandIds = registerCommandStub.getCalls().map(call => call.args[0]);
        assert.ok(registeredCommandIds.includes('vscode-mcp-server.feedback.add'), 'Add Feedback command not registered');
        assert.ok(registeredCommandIds.includes('vscode-mcp-server.feedback.finish'), 'Finish Feedback command not registered');
        assert.ok(registeredCommandIds.includes('vscode-mcp-server.feedback.cancel'), 'Cancel Feedback command not registered');
    });

    test('Configuration change listener should be registered', async () => {
        // Activate the extension  
        await extension.activate(context);
        
        // Check that the listener was registered
        assert.strictEqual(onDidChangeConfigurationStub.called, true, 'Configuration change listener not registered');
    });

    test('Toggle-on awaits persisted enabled state before starting the server', async () => {
        workspaceConfig.get.withArgs('defaultEnabled').returns(false);
        await extension.activate(context);

        let resolveUpdate!: () => void;
        const updatePromise = new Promise<void>(resolve => {
            resolveUpdate = resolve;
        });
        context.globalState.update = sinon.stub().returns(updatePromise);

        const toggleServerCall = registerCommandStub.getCalls().find(
            call => call.args[0] === 'vscode-mcp-server.toggleServer'
        );
        assert.ok(toggleServerCall, 'Toggle server command not registered');

        const togglePromise = toggleServerCall.args[1]();
        await Promise.resolve();

        assert.strictEqual(MockServerConstructor.notCalled, true, 'Server started before enabled state persisted');
        resolveUpdate();
        await togglePromise;

        assert.strictEqual(MockServerConstructor.calledOnce, true, 'Server did not start after enabled state persisted');
        assert.strictEqual(showInformationMessageStub.called, true, 'Toggle did not report server start');
    });

    test('Runtime configuration changes restart an enabled server for watched keys', async () => {
        workspaceConfig.get.withArgs('defaultEnabled').returns(true);
        await extension.activate(context);

        const listener = onDidChangeConfigurationStub.firstCall.args[0];
        const watchedSections = [
            'vscode-mcp-server.port',
            'vscode-mcp-server.host',
            'vscode-mcp-server.enabledTools'
        ];

        for (const [index, watchedSection] of watchedSections.entries()) {
            await listener({
                affectsConfiguration: (section: string) => section === watchedSection
            });

            assert.strictEqual(mockMCPServer.stop.callCount, index + 1, `Enabled server was not stopped for ${watchedSection} change`);
            assert.strictEqual(MockServerConstructor.callCount, index + 2, `Enabled server was not recreated for ${watchedSection} change`);
            assert.strictEqual(mockMCPServer.start.callCount, index + 2, `Recreated server was not started for ${watchedSection} change`);
        }
    });

    test('Invalid runtime configuration changes stop the enabled server and roll back state', async () => {
        workspaceConfig.get.withArgs('defaultEnabled').returns(true);
        const updateStub = sinon.stub().resolves();
        context.globalState.update = updateStub;

        await extension.activate(context);
        workspaceConfig.get.withArgs('host', '127.0.0.1').returns('0.0.0.0');

        const listener = onDidChangeConfigurationStub.firstCall.args[0];
        await listener({
            affectsConfiguration: (section: string) => section === 'vscode-mcp-server.host'
        });

        assert.strictEqual(mockMCPServer.stop.calledOnce, true, 'Enabled server was not stopped for invalid host change');
        assert.deepStrictEqual(updateStub.getCalls().map(call => call.args), [['mcpServerEnabled', false]]);
        assert.strictEqual(statusBarItem.text, '$(server) MCP Server: Off', 'Status bar did not roll back to off');
        assert.strictEqual(showErrorMessageStub.calledOnce, true, 'Invalid runtime change did not report an error');
    });

    test('Toggle-on rolls back persisted state and status when server start fails', async () => {
        workspaceConfig.get.withArgs('defaultEnabled').returns(false);
        mockMCPServer.start.rejects(new Error('port busy'));
        const updateStub = sinon.stub().resolves();
        context.globalState.update = updateStub;

        await extension.activate(context);

        const toggleServerCall = registerCommandStub.getCalls().find(
            call => call.args[0] === 'vscode-mcp-server.toggleServer'
        );
        assert.ok(toggleServerCall, 'Toggle server command not registered');

        await toggleServerCall.args[1]();

        assert.deepStrictEqual(
            updateStub.getCalls().map(call => call.args),
            [
                ['mcpServerEnabled', true],
                ['mcpServerEnabled', false]
            ],
            'Failed toggle did not persist true then roll back to false'
        );
        assert.strictEqual(statusBarItem.text, '$(server) MCP Server: Off', 'Status bar did not roll back to off');
        assert.strictEqual(showErrorMessageStub.calledOnce, true, 'Failed toggle did not report an error');
    });

    test('Activation startup failure keeps controls registered and rolls back persisted state', async () => {
        mockMCPServer.start.rejects(new Error('port busy'));
        context.globalState.get = sinon.stub().withArgs('mcpServerEnabled', false).returns(true);
        const updateStub = sinon.stub().resolves();
        context.globalState.update = updateStub;

        await extension.activate(context);

        const registeredCommandIds = registerCommandStub.getCalls().map(call => call.args[0]);
        assert.ok(registeredCommandIds.includes('vscode-mcp-server.toggleServer'), 'Toggle command not registered after startup failure');
        assert.ok(registeredCommandIds.includes('vscode-mcp-server.showServerInfo'), 'Info command not registered after startup failure');
        assert.deepStrictEqual(updateStub.getCalls().map(call => call.args), [['mcpServerEnabled', false]]);
        assert.strictEqual(statusBarItem.text, '$(server) MCP Server: Off', 'Status bar did not roll back to off');
        assert.strictEqual(showErrorMessageStub.calledOnce, true, 'Activation failure did not report an error');
    });

    test('Deactivate should clean up resources', async () => {
        workspaceConfig.get.withArgs('defaultEnabled').returns(true);

        // First activate to set up resources
        await extension.activate(context);
        
        // Then deactivate
        await extension.deactivate();
        
        // Check that status bar was disposed
        assert.strictEqual(statusBarItem.dispose.called, true, 'Status bar not disposed during deactivation');
        
        // Check that server was stopped
        assert.strictEqual(mockMCPServer.stop.called, true, 'Server not stopped during deactivation');
        assert.strictEqual(disposeFeedbackCaptureService.called, true, 'Feedback service not disposed during deactivation');
    });

    test('Deactivate should dispose feedback state even when server is disabled', async () => {
        workspaceConfig.get.withArgs('defaultEnabled').returns(false);

        await extension.activate(context);
        await extension.deactivate();

        assert.strictEqual(disposeFeedbackCaptureService.called, true, 'Feedback service not disposed without a running server');
    });
});