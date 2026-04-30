# Workspace Boundary Hardening PRD

## Problem Statement

The newer editor primitives have a useful workspace path and URI safety seam, but older MCP tools bypass it. The result is inconsistent handling of paths, traversal, absolute paths, and output normalization across the repo.

Examples to inspect before implementing:

- `src/editor/location-utils.ts` contains the current strongest workspace-relative path checks.
- `src/tools/file-tools.ts` uses raw `vscode.Uri.joinPath(...)` for user-provided paths.
- `src/tools/edit-tools.ts` uses raw `vscode.Uri.joinPath(...)` for user-provided paths.
- `src/tools/symbol-tools.ts` uses `path.resolve(...)` against the workspace root.
- `src/tools/diagnostics-tools.ts` duplicates workspace-relative path formatting.

The desired shape is one shared first-workspace boundary module used by every path-taking tool.

## Decisions

- Single-workspace behavior is intentional for simplicity.
- Backward compatibility with unsafe path behavior is not required.
- Unsafe path inputs should be rejected rather than normalized permissively.
- Shell should already be removed or ignored by this PRD.
- Temporary editor, diff, feedback, and annotation state remains memory-only.

## Scope

### In scope

- Create one shared workspace boundary module.
- Use it from all path-taking tools:
  - file tools;
  - edit tools;
  - diagnostics tools;
  - symbol tools;
  - editor/navigation/annotation path handling where practical.
- Enforce first-workspace-only behavior explicitly.
- Reject:
  - absolute paths;
  - `..` traversal;
  - Windows drive-letter paths;
  - empty paths where not meaningful;
  - `rename_file_code` `newName` values that contain `/`, `\\`, `..`, or path separators.
- Add bounded behavior for expensive operations:
  - recursive list maximum entries;
  - recursive root guard;
  - file read size guard before decoding;
  - positive bounded `maxCharacters`;
  - valid line ranges.
- Normalize path output to `/` separators.
- Remove duplicated `uriToWorkspacePath` helpers.
- Add adversarial tests.

### Out of scope

- Multi-root workspace support.
- Durable state.
- Shell command execution.
- Remote host support.
- Preserving legacy permissive path handling.

## Proposed Design

Add a shared module such as `src/workspace/workspace-boundary.ts`.

Suggested types:

```ts
export type WorkspacePath = string & { readonly __brand: 'WorkspacePath' };
export type WorkspaceFileUri = vscode.Uri & { readonly __brand: 'WorkspaceFileUri' };

export interface WorkspaceBoundary {
  root: vscode.Uri;
  resolvePath(rawPath: string): WorkspacePath;
  toUri(path: WorkspacePath): WorkspaceFileUri;
  pathFromUri(uri: vscode.Uri): WorkspacePath | undefined;
  assertInsideWorkspace(uri: vscode.Uri): WorkspaceFileUri;
}
```

If branded URI values are awkward, start by branding only `WorkspacePath`.

Required runtime behavior:

- `.` means the workspace root.
- `src/foo.ts` is accepted.
- `src\\foo.ts` normalizes to `src/foo.ts`.
- `../secret.ts` is rejected.
- `/tmp/secret.ts` is rejected.
- `C:\\secret.ts` is rejected.
- `src/../../secret.ts` is rejected.
- `rename_file_code` `newName` must be a basename.

## Implementation Slices

### Slice 1 — Boundary module

Implement:

- `getSingleWorkspaceRoot()`
- `normalizeWorkspacePath(raw: string)`
- `assertWorkspacePath(raw: string)`
- `workspacePathToUri(path: WorkspacePath)`
- `uriToWorkspacePath(uri: vscode.Uri)`
- `isUriInsideWorkspace(uri: vscode.Uri)`

The module should have small, direct tests before consumers are migrated.

### Slice 2 — Migrate read-only tools first

Migrate:

- `src/tools/diagnostics-tools.ts`
- `src/tools/symbol-tools.ts`

Remove duplicated helpers and replace direct `path.resolve(...)` calls with shared boundary resolution.

### Slice 3 — Migrate file tools

Migrate:

- `listWorkspaceFiles`
- `readWorkspaceFile`
- `move_file_code`
- `rename_file_code`
- `copy_file_code`

Add guards:

- recursive root listing should fail unless bounded by a reasonable maximum;
- recursive listing should stop before returning unbounded output;
- `maxCharacters <= 0` should reject;
- hard-cap `maxCharacters` to a documented limit;
- line ranges should be integers and valid;
- encoding should be restricted to known values unless arbitrary `TextDecoder` support is intentionally retained.

### Slice 4 — Migrate edit tools

Migrate:

- `createWorkspaceFile`
- `replaceWorkspaceFileLines`

Preserve the existing original-code mismatch behavior, but ensure unsafe paths fail before any document is opened or edited.

### Slice 5 — Optional symlink hardening

If the workspace root is a local `file:` URI, consider realpath checks:

```ts
const rootRealPath = await fs.promises.realpath(workspaceRoot.fsPath);
const targetRealPath = await fs.promises.realpath(targetPath);
```

For new files, check the nearest existing parent directory. If this adds too much complexity, document the symlink limitation and defer it.

## Tests

Add tests for the boundary module:

- accepts `.`;
- accepts `src/foo.ts`;
- normalizes backslashes;
- rejects `../secret.ts`;
- rejects `/tmp/secret.ts`;
- rejects `C:\\secret.ts`;
- rejects nested traversal like `src/../../secret.ts`.

Add or update tool tests:

- `file-tools`: traversal rejection, recursive root guard, file size guard, base64 size guard, rename basename validation.
- `edit-tools`: traversal rejection for create and replace, original-code mismatch still clear.
- `symbol-tools`: traversal rejected before document open/stat.
- `diagnostics-tools`: traversal rejected before diagnostics lookup.
- Existing editor location tests should continue to pass through the shared boundary.

## Verification

Run:

```bash
npm run compile
npm run lint
npm test
```

## Acceptance Criteria

- All path-taking tools use the shared workspace boundary module.
- No old tool accepts traversal, absolute paths, or drive-letter paths.
- `rename_file_code` cannot move files by smuggling separators into `newName`.
- Recursive listing is bounded.
- File read size checks happen before expensive decoding.
- Path output consistently uses `/` separators.
- Adversarial path tests pass.
- Full verification passes.

## New Session Prompt

Implement this PRD in `/Users/henrique/me/oss/vscode-mcp-server`. Decisions: first workspace only, no backward compatibility for unsafe paths, no shell, memory-only temporary state. Create a shared workspace boundary module and migrate file/edit/diagnostics/symbol/editor path handling to it. Reject traversal, absolute, and drive-letter paths; validate rename basenames; add recursive and file-read caps; remove duplicate path helpers; add adversarial tests; and run `npm run compile`, `npm run lint`, and `npm test`.
