import * as assert from 'assert';
import type * as vscode from 'vscode';
import { resolveMcpConfig } from '../runtime-config';

function workspaceConfiguration(values: Record<string, unknown> = {}): vscode.WorkspaceConfiguration {
    return {
        get: <T>(section: string, defaultValue?: T): T | undefined => {
            if (Object.prototype.hasOwnProperty.call(values, section)) {
                return values[section] as T;
            }
            return defaultValue;
        }
    } as vscode.WorkspaceConfiguration;
}

suite('Runtime config resolver', () => {
    test('resolves safe defaults for server startup', () => {
        const resolved = resolveMcpConfig(workspaceConfiguration());

        assert.deepStrictEqual(resolved, {
            port: 3000,
            host: '127.0.0.1',
            defaultEnabled: false,
            enabledTools: {
                file: true,
                edit: true,
                diagnostics: true,
                symbol: true,
                editor: true
            }
        });
    });

    test('rejects non-loopback hosts', () => {
        assert.throws(
            () => resolveMcpConfig(workspaceConfiguration({ host: '0.0.0.0' })),
            /vscode-mcp-server\.host must be loopback-only; received "0\.0\.0\.0"\./
        );
    });

    test('respects explicit tool category booleans and defaults missing categories to enabled', () => {
        const resolved = resolveMcpConfig(workspaceConfiguration({
            enabledTools: {
                file: false,
                editor: false
            }
        }));

        assert.deepStrictEqual(resolved.enabledTools, {
            file: false,
            edit: true,
            diagnostics: true,
            symbol: true,
            editor: false
        });
    });

    test('rejects malformed enabledTools instead of enabling categories silently', () => {
        assert.throws(
            () => resolveMcpConfig(workspaceConfiguration({ enabledTools: { file: 'yes' } })),
            /vscode-mcp-server\.enabledTools\.file must be a boolean\./
        );
    });

    test('rejects the removed shell tool category', () => {
        assert.throws(
            () => resolveMcpConfig(workspaceConfiguration({ enabledTools: { shell: true } })),
            /vscode-mcp-server\.enabledTools\.shell is not a supported tool category\./
        );
    });

    test('rejects ports outside the configured listen range', () => {
        assert.throws(
            () => resolveMcpConfig(workspaceConfiguration({ port: 80 })),
            /vscode-mcp-server\.port must be an integer between 1024 and 65535; received 80\./
        );
    });
});
