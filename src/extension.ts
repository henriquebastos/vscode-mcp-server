import * as vscode from 'vscode';
import { MCPServer } from './server';
import { ResolvedMcpConfig, resolveMcpConfig } from './runtime-config';
import { registerFeedbackCommands } from './editor/feedback-commands';
import { disposeFeedbackCaptureService } from './editor/feedback-service';
import { listWorkspaceFiles } from './tools/file-tools';
import { logger } from './utils/logger';

// Re-export for testing purposes
export { MCPServer };

let mcpServer: MCPServer | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
// Server state - disabled by default
let serverEnabled: boolean = false;

function readRuntimeConfig(): ResolvedMcpConfig {
    return resolveMcpConfig(vscode.workspace.getConfiguration('vscode-mcp-server'));
}

function createConfiguredServer(config: ResolvedMcpConfig): MCPServer {
    const server = new MCPServer(config.port, config.host, config.enabledTools);
    server.setFileListingCallback(async (path: string, recursive: boolean) => {
        try {
            return await listWorkspaceFiles(path, recursive);
        } catch (error) {
            logger.error(`[createConfiguredServer] Error listing files: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
    });
    server.setupTools();
    return server;
}

async function startConfiguredServer(config: ResolvedMcpConfig = readRuntimeConfig()): Promise<ResolvedMcpConfig> {
    logger.info(`[startConfiguredServer] Creating MCP server for ${config.host}:${config.port}`);
    const server = createConfiguredServer(config);
    mcpServer = server;

    try {
        logger.info(`[startConfiguredServer] Starting server at ${new Date().toISOString()}`);
        const startTime = Date.now();
        await server.start();
        if (mcpServer !== server || !serverEnabled) {
            throw new Error('MCP Server startup was cancelled');
        }
        const duration = Date.now() - startTime;
        logger.info(`[startConfiguredServer] Server started successfully at ${new Date().toISOString()} (took ${duration}ms)`);
        return config;
    } catch (error) {
        const shouldCleanup = mcpServer === server;
        if (shouldCleanup) {
            mcpServer = undefined;
        }
        logger.error(`[startConfiguredServer] Server failed to start: ${error instanceof Error ? error.message : String(error)}`);
        if (shouldCleanup) {
            try {
                await server.stop();
            } catch (stopError) {
                logger.warn(`[startConfiguredServer] Cleanup after failed start failed: ${stopError instanceof Error ? stopError.message : String(stopError)}`);
            }
        }
        throw error;
    }
}

async function stopConfiguredServer(): Promise<void> {
    if (!mcpServer) {
        return;
    }

    const server = mcpServer;
    await server.stop();
    if (mcpServer === server) {
        mcpServer = undefined;
    }
}

function affectsRuntimeConfig(event: vscode.ConfigurationChangeEvent): boolean {
    return event.affectsConfiguration('vscode-mcp-server.port')
        || event.affectsConfiguration('vscode-mcp-server.host')
        || event.affectsConfiguration('vscode-mcp-server.enabledTools');
}

function formatServerUrl(config: Pick<ResolvedMcpConfig, 'port' | 'host'>): string {
    const host = config.host.includes(':') ? `[${config.host}]` : config.host;
    return `http://${host}:${config.port}/mcp`;
}

// Function to update status bar
function updateStatusBar(config?: Pick<ResolvedMcpConfig, 'port' | 'host'>) {
    if (!statusBarItem) {
        return;
    }

    const port = config?.port ?? 3000;
    const host = config?.host ?? 'localhost';

    if (serverEnabled) {
        statusBarItem.text = `$(server) MCP Server: ${port}`;
        statusBarItem.tooltip = `MCP Server running at ${host}:${port} (Click to toggle)`;
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = `$(server) MCP Server: Off`;
        statusBarItem.tooltip = `MCP Server is disabled (Click to toggle)`;
        // Use a subtle color to indicate disabled state
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    statusBarItem.show();
}

async function persistServerEnabled(context: vscode.ExtensionContext, enabled: boolean): Promise<void> {
    await context.globalState.update('mcpServerEnabled', enabled);
}

async function enableServer(context: vscode.ExtensionContext): Promise<void> {
    await persistServerEnabled(context, true);

    let config: ResolvedMcpConfig | undefined;
    try {
        config = readRuntimeConfig();
        serverEnabled = true;
        updateStatusBar(config);

        const startedConfig = await startConfiguredServer(config);
        updateStatusBar(startedConfig);
        vscode.window.showInformationMessage(`MCP Server enabled and running at ${formatServerUrl(startedConfig)}`);
    } catch (error) {
        serverEnabled = false;
        await persistServerEnabled(context, false);
        updateStatusBar(config);
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`[enableServer] Failed to enable MCP Server: ${message}`);
        vscode.window.showErrorMessage(`Failed to enable MCP Server: ${message}`);
    }
}

async function disableServer(context: vscode.ExtensionContext): Promise<void> {
    await persistServerEnabled(context, false);
    serverEnabled = false;

    let config: ResolvedMcpConfig | undefined;
    try {
        config = readRuntimeConfig();
    } catch (error) {
        logger.warn(`[disableServer] Runtime config could not be resolved while disabling: ${error instanceof Error ? error.message : String(error)}`);
    }
    updateStatusBar(config);

    if (!mcpServer) {
        vscode.window.showInformationMessage('MCP Server has been disabled');
        return;
    }

    // Show progress indicator
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Stopping MCP Server',
        cancellable: false
    }, async (progress) => {
        logger.info(`[disableServer] Stopping server at ${new Date().toISOString()}`);
        progress.report({ message: 'Closing connections...' });

        const stopTime = Date.now();
        await stopConfiguredServer();

        const duration = Date.now() - stopTime;
        logger.info(`[disableServer] Server stopped successfully at ${new Date().toISOString()} (took ${duration}ms)`);
    });

    vscode.window.showInformationMessage('MCP Server has been disabled');
}

// Function to toggle server state
async function toggleServerState(context: vscode.ExtensionContext): Promise<void> {
    logger.info(`[toggleServerState] Starting toggle operation - changing from ${serverEnabled} to ${!serverEnabled}`);

    if (serverEnabled) {
        await disableServer(context);
    } else {
        await enableServer(context);
    }

    logger.info('[toggleServerState] Toggle operation completed');
}

async function restartServerForConfigChange(context: vscode.ExtensionContext): Promise<void> {
    let config: ResolvedMcpConfig | undefined;
    try {
        config = readRuntimeConfig();
        await stopConfiguredServer();
        const startedConfig = await startConfiguredServer(config);
        updateStatusBar(startedConfig);
        vscode.window.showInformationMessage('MCP Server restarted with updated runtime configuration');
    } catch (error) {
        try {
            await stopConfiguredServer();
        } catch (stopError) {
            logger.warn(`[restartServerForConfigChange] Cleanup after failed restart failed: ${stopError instanceof Error ? stopError.message : String(stopError)}`);
        }
        serverEnabled = false;
        await persistServerEnabled(context, false);
        updateStatusBar(config);
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`[restartServerForConfigChange] Failed to restart MCP Server: ${message}`);
        vscode.window.showErrorMessage(`Failed to restart MCP Server: ${message}`);
    }
}

export async function activate(context: vscode.ExtensionContext) {
    logger.info('Activating vscode-mcp-server extension');

    // Create status bar item and commands before any startup attempt so failed
    // persisted-enabled startup remains recoverable from the UI.
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );
    statusBarItem.command = 'vscode-mcp-server.toggleServer';

    const toggleServerCommand = vscode.commands.registerCommand(
        'vscode-mcp-server.toggleServer',
        () => toggleServerState(context)
    );

    const showServerInfoCommand = vscode.commands.registerCommand(
        'vscode-mcp-server.showServerInfo',
        () => {
            if (serverEnabled) {
                try {
                    const config = readRuntimeConfig();
                    vscode.window.showInformationMessage(`MCP Server is running at ${formatServerUrl(config)}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to read MCP Server configuration: ${error instanceof Error ? error.message : String(error)}`);
                }
            } else {
                vscode.window.showInformationMessage('MCP Server is currently disabled. Click on the status bar item to enable it.');
            }
        }
    );

    const configChangeListener = vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (!affectsRuntimeConfig(event)) {
            return;
        }

        logger.info('[configChangeListener] Runtime configuration changed - restarting server if enabled');
        if (serverEnabled && mcpServer) {
            await restartServerForConfigChange(context);
            return;
        }

        try {
            updateStatusBar(readRuntimeConfig());
        } catch (error) {
            logger.warn(`[configChangeListener] Runtime config could not be resolved while server is disabled: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    const feedbackCommands = registerFeedbackCommands();

    context.subscriptions.push(
        statusBarItem,
        toggleServerCommand,
        showServerInfoCommand,
        ...feedbackCommands,
        configChangeListener,
        { dispose: async () => await stopConfiguredServer() }
    );

    try {
        const runtimeConfig = readRuntimeConfig();

        // Load saved state or use configured default
        serverEnabled = context.globalState.get('mcpServerEnabled', runtimeConfig.defaultEnabled);

        logger.info(`[activate] Using ${runtimeConfig.host}:${runtimeConfig.port} from configuration`);
        logger.info(`[activate] Server enabled: ${serverEnabled}`);

        updateStatusBar(runtimeConfig);

        if (!serverEnabled) {
            logger.info('MCP Server is disabled by default');
            return;
        }

        try {
            await startConfiguredServer(runtimeConfig);
            updateStatusBar(runtimeConfig);
            logger.info('MCP Server started successfully');
        } catch (error) {
            serverEnabled = false;
            await persistServerEnabled(context, false);
            updateStatusBar(runtimeConfig);
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Failed to start MCP Server: ${message}`);
            vscode.window.showErrorMessage(`Failed to start MCP Server: ${message}`);
        }
    } catch (error) {
        serverEnabled = false;
        updateStatusBar();
        logger.error(`Failed to read MCP Server configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        vscode.window.showErrorMessage(`Failed to read MCP Server configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
        statusBarItem = undefined;
    }

    if (!mcpServer) {
        disposeFeedbackCaptureService();
        return;
    }

    try {
        logger.info('Stopping MCP Server during extension deactivation');
        await stopConfiguredServer();
        logger.info('MCP Server stopped successfully');
    } catch (error) {
        logger.error(`Error stopping MCP Server: ${error instanceof Error ? error.message : String(error)}`);
        throw error; // Re-throw to ensure VS Code knows about the failure
    } finally {
        disposeFeedbackCaptureService();
        // Dispose the logger
        logger.dispose();
    }
}
