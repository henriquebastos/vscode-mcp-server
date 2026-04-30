# Local-Only Runtime Config and Shell Tool Removal PRD

## Problem Statement

This extension should be a local-only VS Code MCP control surface. It should not behave like a remotely exposed automation server.

The current runtime policy is too implicit:

- `vscode-mcp-server.host` is configurable as an arbitrary string.
- `execute_shell_command_code` exposes arbitrary terminal execution.
- `shell` is enabled by default when the server is enabled.
- `enabledTools` is parsed as `any` and missing or malformed fields fall back to enabled.
- `src/extension.ts` repeats server construction across activation, toggle, and config-change paths.
- `src/server.ts` attaches HTTP server event handlers before the HTTP server exists.
- `package-lock.json` root metadata is stale relative to `package.json`.

The desired shape is a simpler and safer runtime: loopback-only HTTP, no shell tool, one resolved operational config object, and one server startup path.

## Decisions

- Non-loopback hosts are not supported.
- The shell MCP tool should be removed rather than hardened.
- Single-workspace behavior is intentional for simplicity.
- Backward compatibility with unsafe or ambiguous config is not required.
- Guided editor, diff, annotation, and feedback state remains memory-only.
- Lockfile drift is not intentional and should be fixed.

## Scope

### In scope

- Remove `execute_shell_command_code` and the shell tool category.
- Remove shell references from configuration, server registration, tests, and docs.
- Restrict `vscode-mcp-server.host` to loopback values only:
  - `127.0.0.1`
  - `localhost`
  - optionally `::1`
- Introduce a resolved config object before starting the server.
- Fail closed on malformed `enabledTools` configuration.
- Watch `port`, `host`, and `enabledTools` changes.
- Deduplicate server construction/startup logic in `src/extension.ts`.
- Await `globalState.update('mcpServerEnabled', ...)` when toggling state.
- Make `MCPServer.start()` reject on HTTP listen errors.
- Attach HTTP server event handlers after `app.listen(...)` creates the server.
- Remove the stale `vscode-mcp-server.helloWorld` contribution if unused.
- Update `package-lock.json` root metadata.

### Out of scope

- Authentication.
- Remote access.
- Multi-root workspace support.
- Durable persistence for editor/diff/feedback state.
- Reintroducing shell under another name.

## Proposed Design

### Resolved config object

Add a pure resolver, likely in `src/runtime-config.ts` or `src/config.ts`:

```ts
export type LoopbackHost = '127.0.0.1' | 'localhost' | '::1';

export interface ResolvedMcpConfig {
  port: number;
  host: LoopbackHost;
  defaultEnabled: boolean;
  enabledTools: ToolConfiguration;
}

export function resolveMcpConfig(config: vscode.WorkspaceConfiguration): ResolvedMcpConfig {
  // Validate port, host, and enabledTools before any server is created.
}
```

After shell removal, `ToolConfiguration` should contain only:

```ts
export interface ToolConfiguration {
  file: boolean;
  edit: boolean;
  diagnostics: boolean;
  symbol: boolean;
  editor: boolean;
}
```

Runtime behavior:

- Missing `enabledTools` uses safe defaults.
- Malformed `enabledTools` rejects clearly rather than silently enabling every category.
- Non-loopback host rejects clearly, for example:
  - `vscode-mcp-server.host must be loopback-only; received "0.0.0.0".`

### Single server startup path

Replace repeated blocks in `src/extension.ts` with helpers:

```ts
async function createConfiguredServer(config: ResolvedMcpConfig): Promise<MCPServer> {
  const server = new MCPServer(config.port, config.host, config.enabledTools);
  server.setFileListingCallback(listWorkspaceFiles);
  server.setupTools();
  return server;
}

async function startConfiguredServer(context: vscode.ExtensionContext): Promise<void> {
  const config = resolveMcpConfig(vscode.workspace.getConfiguration('vscode-mcp-server'));
  mcpServer = await createConfiguredServer(config);
  await mcpServer.start();
}
```

The exact helper names can differ. The important invariant is that activation, toggle-on, and config restart all use one path.

### HTTP lifecycle

In `src/server.ts`, create and attach handlers in one place:

```ts
private listen(): Promise<void> {
  return new Promise((resolve, reject) => {
    const httpServer = this.app.listen(this.port, this.host);
    this.httpServer = httpServer;

    httpServer.once('listening', () => resolve());
    httpServer.once('error', reject);
    httpServer.once('close', () => logger.info('[Server] HTTP Server closed'));
  });
}
```

`start()` should await this helper and reject if the port is unavailable or the host is invalid.

## Implementation Slices

### Slice 1 — Remove shell surface

- Delete `src/tools/shell-tools.ts`.
- Remove `registerShellTools` import and call from `src/server.ts`.
- Remove `shell` from `ToolConfiguration` and default config.
- Remove terminal lifecycle from `src/extension.ts` if it exists only for shell:
  - `TERMINAL_NAME`
  - `sharedTerminal`
  - `getExtensionTerminal`
  - terminal disposal
  - terminal constructor arg to `MCPServer`
- Remove shell config from `package.json`.
- Remove shell tool docs from `README.md`.

### Slice 2 — Resolve runtime config

- Add `ResolvedMcpConfig` and `resolveMcpConfig(...)`.
- Validate host as loopback-only.
- Validate port range.
- Validate tool configuration shape.
- Fail closed on malformed config.

### Slice 3 — Deduplicate extension startup

- Extract one server construction/start helper.
- Use it from activation, toggle-on, and config restart.
- Watch `vscode-mcp-server.port`, `vscode-mcp-server.host`, and `vscode-mcp-server.enabledTools`.
- Await persisted enabled-state updates.
- Roll back `serverEnabled` and status bar if server start fails.

### Slice 4 — Fix server lifecycle

- Remove dead pre-listen event handler setup.
- Attach HTTP server listeners immediately after `app.listen(...)` creates the server.
- Make listen errors reject `start()`.

### Slice 5 — Package cleanup

- Remove `vscode-mcp-server.helloWorld` if unused.
- Run `npm install --package-lock-only` to refresh lockfile metadata.

## Tests

Add or update tests for:

- default resolved config;
- rejection of `host: "0.0.0.0"`;
- malformed `enabledTools` behavior;
- absence of `shell` category and shell tool registration;
- config restart on host/port/tool changes;
- awaited `globalState.update(...)` behavior;
- `MCPServer.start()` rejection on HTTP listen error;
- package contributions no longer exposing stale `helloWorld`.

## Verification

Run:

```bash
npm run compile
npm run lint
npm test
npm ci --dry-run
```

## Acceptance Criteria

- No `execute_shell_command_code` tool exists.
- No `shell` tool category exists.
- Non-loopback host config cannot start the server.
- Runtime config is resolved into a typed object before server construction.
- Activation, toggle-on, and config restart use one server construction path.
- HTTP listen errors reject startup.
- `package.json` and `package-lock.json` root metadata match.
- Full verification passes.

## New Session Prompt

Implement this PRD in `/Users/henrique/me/oss/vscode-mcp-server`. Decisions: no remote hosts, remove shell entirely, first workspace only, no backward compatibility requirement, temporary editor state remains memory-only, fix lockfile drift. Start by reading `README.md`, `package.json`, `package-lock.json`, `src/extension.ts`, `src/server.ts`, and existing tests. Remove the shell tool/config/docs, introduce a resolved loopback-only config object, deduplicate server startup, fix HTTP listen lifecycle, remove stale `helloWorld` contribution if unused, update tests, and run `npm run compile`, `npm run lint`, `npm test`, and `npm ci --dry-run`.
