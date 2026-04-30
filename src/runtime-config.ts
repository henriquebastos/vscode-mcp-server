import type * as vscode from 'vscode';
import type { ToolConfiguration } from './server';

export type LoopbackHost = '127.0.0.1' | 'localhost' | '::1';

export interface ResolvedMcpConfig {
    port: number;
    host: LoopbackHost;
    defaultEnabled: boolean;
    enabledTools: ToolConfiguration;
}

const LOOPBACK_HOSTS = new Set<string>(['127.0.0.1', 'localhost', '::1']);
const DEFAULT_TOOL_CONFIGURATION: ToolConfiguration = {
    file: true,
    edit: true,
    diagnostics: true,
    symbol: true,
    editor: true
};
const TOOL_CATEGORIES = Object.keys(DEFAULT_TOOL_CONFIGURATION) as Array<keyof ToolConfiguration>;

function resolveHost(value: unknown): LoopbackHost {
    const host = value ?? '127.0.0.1';
    if (typeof host !== 'string' || !LOOPBACK_HOSTS.has(host)) {
        throw new Error(`vscode-mcp-server.host must be loopback-only; received ${JSON.stringify(host)}.`);
    }
    return host as LoopbackHost;
}

function resolvePort(value: unknown): number {
    const port = value ?? 3000;
    if (!Number.isInteger(port) || typeof port !== 'number' || port < 1024 || port > 65535) {
        throw new Error(`vscode-mcp-server.port must be an integer between 1024 and 65535; received ${JSON.stringify(port)}.`);
    }
    return port;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveEnabledTools(value: unknown): ToolConfiguration {
    if (value === undefined) {
        return { ...DEFAULT_TOOL_CONFIGURATION };
    }
    if (!isRecord(value)) {
        throw new Error('vscode-mcp-server.enabledTools must be an object.');
    }

    const knownCategories = new Set<string>(TOOL_CATEGORIES);
    for (const category of Object.keys(value)) {
        if (!knownCategories.has(category)) {
            throw new Error(`vscode-mcp-server.enabledTools.${category} is not a supported tool category.`);
        }
        if (typeof value[category] !== 'boolean') {
            throw new Error(`vscode-mcp-server.enabledTools.${category} must be a boolean.`);
        }
    }

    const configuredTools = value as Partial<Record<keyof ToolConfiguration, boolean>>;
    const resolved = { ...DEFAULT_TOOL_CONFIGURATION };
    for (const category of TOOL_CATEGORIES) {
        if (configuredTools[category] !== undefined) {
            resolved[category] = configuredTools[category];
        }
    }
    return resolved;
}

export function resolveMcpConfig(config: vscode.WorkspaceConfiguration): ResolvedMcpConfig {
    return {
        port: resolvePort(config.get<unknown>('port', 3000)),
        host: resolveHost(config.get<unknown>('host', '127.0.0.1')),
        defaultEnabled: config.get<boolean>('defaultEnabled', false) ?? false,
        enabledTools: resolveEnabledTools(config.get<unknown>('enabledTools'))
    };
}
