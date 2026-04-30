import * as assert from 'assert';
import * as sinon from 'sinon';
import * as proxyquireLib from 'proxyquire';

const proxyquire = proxyquireLib.noPreserveCache().noCallThru();

suite('MCPServer Tool Setup', () => {
    teardown(() => {
        sinon.restore();
    });

    test('disposes editor services when the MCP server stops', async () => {
        const disposeEditorAnnotationService = sinon.spy();
        const disposeEditorDiffService = sinon.spy();
        const disposeFeedbackCaptureService = sinon.spy();
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
            './editor/diff-service': { disposeEditorDiffService },
            './editor/feedback-service': { disposeFeedbackCaptureService },
            './utils/logger': {
                logger: {
                    info: sinon.spy(),
                    warn: sinon.spy(),
                    error: sinon.spy()
                }
            }
        });

        const server = new serverModule.MCPServer(0, '127.0.0.1', {
            file: false,
            edit: false,
            diagnostics: false,
            symbol: false,
            editor: true
        });

        await server.stop();

        assert.strictEqual(disposeEditorAnnotationService.calledOnce, true, 'annotation service was not disposed on stop');
        assert.strictEqual(disposeEditorDiffService.calledOnce, true, 'diff service was not disposed on stop');
        assert.strictEqual(disposeFeedbackCaptureService.calledOnce, true, 'feedback service was not disposed on stop');
    });

    test('start rejects when the HTTP server reports a listen error', async () => {
        const listeners = new Map<string, Array<(value?: unknown) => void>>();
        const fakeHttpServer = {
            once: (event: string, listener: (value?: unknown) => void) => {
                listeners.set(event, [...(listeners.get(event) ?? []), listener]);
                return fakeHttpServer;
            },
            on: (event: string, listener: (value?: unknown) => void) => {
                listeners.set(event, [...(listeners.get(event) ?? []), listener]);
                return fakeHttpServer;
            },
            close: (callback: (error?: Error) => void) => callback()
        };
        const app = {
            use: sinon.spy(),
            post: sinon.spy(),
            get: sinon.spy(),
            delete: sinon.spy(),
            options: sinon.spy(),
            listen: sinon.stub().returns(fakeHttpServer)
        };
        const expressStub = Object.assign(sinon.stub().returns(app), {
            json: sinon.stub().returns((_req: unknown, _res: unknown, next: () => void) => next())
        });
        const serverModule = proxyquire('../server', {
            express: expressStub,
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
            './utils/logger': {
                logger: {
                    info: sinon.spy(),
                    warn: sinon.spy(),
                    error: sinon.spy()
                }
            }
        });
        const server = new serverModule.MCPServer(4321, '127.0.0.1', {
            file: false,
            edit: false,
            diagnostics: false,
            symbol: false,
            editor: false
        });

        const startPromise = server.start();
        await Promise.resolve();
        for (const listener of listeners.get('error') ?? []) {
            listener(new Error('listen failed'));
        }

        await assert.rejects(
            Promise.race([
                startPromise,
                new Promise((_resolve, reject) => setTimeout(() => reject(new Error('start did not reject')), 10))
            ]),
            /listen failed/
        );
    });

    test('registers editor tools independently of file listing callback and respects disabled config', () => {
        const registerEditorTools = sinon.spy();
        const serverModule = proxyquire('../server', {
            './tools/file-tools': { registerFileTools: sinon.spy() },
            './tools/edit-tools': { registerEditTools: sinon.spy() },
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
            diagnostics: false,
            symbol: false,
            editor: true
        };
        const enabledServer = new serverModule.MCPServer(0, '127.0.0.1', enabledConfig);
        enabledServer.setupTools();
        assert.strictEqual(registerEditorTools.calledOnce, true, 'editor tools were not registered independently');

        registerEditorTools.resetHistory();
        const disabledConfig = { ...enabledConfig, editor: false };
        const disabledServer = new serverModule.MCPServer(0, '127.0.0.1', disabledConfig);
        disabledServer.setupTools();
        assert.strictEqual(registerEditorTools.notCalled, true, 'editor tools registered despite editor=false');
    });
});
