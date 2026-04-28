import * as assert from 'assert';
import * as sinon from 'sinon';
import * as proxyquireLib from 'proxyquire';

const proxyquire = proxyquireLib.noPreserveCache().noCallThru();

suite('MCPServer Tool Setup', () => {
    teardown(() => {
        sinon.restore();
    });

    test('disposes editor annotation service when the MCP server stops', async () => {
        const disposeEditorAnnotationService = sinon.spy();
        const serverModule = proxyquire('../server', {
            '@modelcontextprotocol/sdk/server/mcp.js': {
                McpServer: class {
                    public connect = sinon.stub().resolves();
                    public close = sinon.stub().resolves();
                }
            },
            '@modelcontextprotocol/sdk/server/streamableHttp.js': {
                StreamableHTTPServerTransport: class {
                    public close = sinon.stub().resolves();
                    public handleRequest = sinon.stub().resolves();
                }
            },
            './editor/annotation-service': { disposeEditorAnnotationService },
            './utils/logger': {
                logger: {
                    info: sinon.spy(),
                    warn: sinon.spy(),
                    error: sinon.spy()
                }
            }
        });

        const server = new serverModule.MCPServer(0, '127.0.0.1', undefined, {
            file: false,
            edit: false,
            shell: false,
            diagnostics: false,
            symbol: false,
            editor: true
        });

        await server.stop();

        assert.strictEqual(disposeEditorAnnotationService.calledOnce, true, 'annotation service was not disposed on stop');
    });

    test('registers editor tools independently of file listing callback and respects disabled config', () => {
        const registerEditorTools = sinon.spy();
        const serverModule = proxyquire('../server', {
            './tools/file-tools': { registerFileTools: sinon.spy() },
            './tools/edit-tools': { registerEditTools: sinon.spy() },
            './tools/shell-tools': { registerShellTools: sinon.spy() },
            './tools/diagnostics-tools': { registerDiagnosticsTools: sinon.spy() },
            './tools/symbol-tools': { registerSymbolTools: sinon.spy() },
            './tools/editor-tools': { registerEditorTools },
            './utils/logger': {
                logger: {
                    info: sinon.spy(),
                    warn: sinon.spy(),
                    error: sinon.spy()
                }
            }
        });

        const enabledConfig = {
            file: false,
            edit: false,
            shell: false,
            diagnostics: false,
            symbol: false,
            editor: true
        };
        const enabledServer = new serverModule.MCPServer(0, '127.0.0.1', undefined, enabledConfig);
        enabledServer.setupTools();
        assert.strictEqual(registerEditorTools.calledOnce, true, 'editor tools were not registered independently');

        registerEditorTools.resetHistory();
        const disabledConfig = { ...enabledConfig, editor: false };
        const disabledServer = new serverModule.MCPServer(0, '127.0.0.1', undefined, disabledConfig);
        disabledServer.setupTools();
        assert.strictEqual(registerEditorTools.notCalled, true, 'editor tools registered despite editor=false');
    });
});
