# Guided editor primitives dogfood demo

This demo validates the editor MCP primitives by using them as a collaborative teaching surface for this repository.

## Goal

Run a real agent-guided walkthrough where the agent explains the implementation visually in VS Code. The demo should exercise:

- current editor context
- reveal without selection mutation
- multi-range highlights
- inline callouts visible without hover
- clear-by-id/global cleanup
- definition navigation
- pathless follow-up operations against the active editor
- user-steered narrowing and relationship highlighting

## Prerequisites

1. Build the extension:

   ```bash
   npm run compile
   ```

2. Launch this checkout as the VS Code extension under test:

   ```bash
   code --user-data-dir /tmp/vscode-mcp-demo \
     --extensions-dir /tmp/vscode-mcp-demo-exts \
     --extensionDevelopmentPath="$PWD" \
     "$PWD"
   ```

3. In the VS Code window, enable the MCP server:
   - Command Palette: `Toggle MCP Server`
   - or click the status bar item until it shows `MCP Server: 3000`

4. Confirm pi has the MCP server configured, usually in `~/.pi/agent/mcp.json`:

   ```json
   {
     "mcpServers": {
       "vscode": {
         "url": "http://127.0.0.1:3000/mcp"
       }
     }
   }
   ```

5. In pi, reconnect:

   ```text
   mcp({ connect: "vscode" })
   ```

   Expected editor tools include:

   - `vscode_get_editor_context_code`
   - `vscode_reveal_range_code`
   - `vscode_set_highlight_code`
   - `vscode_set_inline_callout_code`
   - `vscode_clear_annotations_code`
   - `vscode_go_to_definition_code`

## Demo prompt

Ask the agent:

> Use the guided-code-explanation skill. Explain the guided editor primitives implementation in this repo visually in VS Code. Start at the editor tool registration point, then pause and ask me where to go next. Use reveal, highlights, inline callouts, clear stale annotations, and definition navigation. Keep it collaborative and iterative.

## Demo script

The agent should follow this shape, adapting to user steering.

### 1. Inspect current editor context

Call:

```json
vscode_get_editor_context_code({
  "includeVisibleEditors": true,
  "includeSelectedText": false
})
```

Expected:

- If a workspace editor is active, use it as context.
- If no editor is active, continue by explicitly revealing `src/server.ts`.

### 2. Start broad at server registration

Reveal:

```json
vscode_reveal_range_code({
  "path": "src/server.ts",
  "range": {
    "start": { "line": 78, "character": 4 },
    "end": { "line": 133, "character": 5 }
  }
})
```

Highlight:

```json
vscode_set_highlight_code({
  "id": "current",
  "path": "src/server.ts",
  "mode": "replace",
  "ranges": [
    {
      "start": { "line": 125, "character": 8 },
      "end": { "line": 132, "character": 9 }
    }
  ]
})
```

Callout:

```json
vscode_set_inline_callout_code({
  "id": "current",
  "path": "src/server.ts",
  "range": {
    "start": { "line": 126, "character": 8 },
    "end": { "line": 128, "character": 61 }
  },
  "title": "Editor category",
  "message": "This branch registers the guided editor primitives when enabled."
})
```

Explain briefly, then offer choices:

1. Follow `registerEditorTools`.
2. Follow annotation state.
3. Follow path/range safety.
4. Follow definition navigation.
5. Test active-editor context with a manual selection.

### 3. Follow tool definitions

When the user chooses `registerEditorTools`, navigate by definition:

```json
vscode_go_to_definition_code({
  "path": "src/server.ts",
  "position": { "line": 127, "character": 13 }
})
```

Then clear stale focus and reveal the registry:

```json
vscode_clear_annotations_code({ "id": "current" })
```

```json
vscode_reveal_range_code({
  "path": "src/tools/editor-tools.ts",
  "range": {
    "start": { "line": 62, "character": 0 },
    "end": { "line": 235, "character": 5 }
  }
})
```

Highlight the registry function plus the six tool names:

```json
vscode_set_highlight_code({
  "id": "current",
  "path": "src/tools/editor-tools.ts",
  "mode": "replace",
  "ranges": [
    { "start": { "line": 62, "character": 16 }, "end": { "line": 62, "character": 35 } },
    { "start": { "line": 64, "character": 8 }, "end": { "line": 64, "character": 33 } },
    { "start": { "line": 100, "character": 8 }, "end": { "line": 100, "character": 31 } },
    { "start": { "line": 125, "character": 8 }, "end": { "line": 125, "character": 32 } },
    { "start": { "line": 150, "character": 8 }, "end": { "line": 150, "character": 33 } },
    { "start": { "line": 185, "character": 8 }, "end": { "line": 185, "character": 28 } },
    { "start": { "line": 212, "character": 8 }, "end": { "line": 212, "character": 27 } }
  ]
})
```

Add a callout on `registerEditorTools`:

```json
vscode_set_inline_callout_code({
  "id": "current",
  "path": "src/tools/editor-tools.ts",
  "mode": "replace",
  "range": {
    "start": { "line": 62, "character": 16 },
    "end": { "line": 62, "character": 35 }
  },
  "title": "Tool registry",
  "message": "This function maps the editor services into six composable MCP primitives."
})
```

### 4. Zoom into one tool handler

For example, zoom into `set_highlight_code`:

```json
vscode_clear_annotations_code({ "id": "current" })
```

```json
vscode_reveal_range_code({
  "range": {
    "start": { "line": 184, "character": 4 },
    "end": { "line": 209, "character": 6 }
  }
})
```

Highlight the tool name, schema, and service delegation:

```json
vscode_set_highlight_code({
  "id": "current",
  "mode": "replace",
  "ranges": [
    { "start": { "line": 185, "character": 8 }, "end": { "line": 185, "character": 28 } },
    { "start": { "line": 192, "character": 12 }, "end": { "line": 195, "character": 107 } },
    { "start": { "line": 198, "character": 33 }, "end": { "line": 198, "character": 96 } }
  ]
})
```

Add a callout:

```json
vscode_set_inline_callout_code({
  "id": "current",
  "mode": "add",
  "range": {
    "start": { "line": 198, "character": 33 },
    "end": { "line": 198, "character": 96 }
  },
  "title": "Thin handler",
  "message": "After schema validation, this delegates highlight behavior to the annotation service."
})
```

### 5. Demonstrate additive relationship highlighting

When the user asks to test `mode: "add"`, append a related span without clearing existing highlights:

```json
vscode_set_highlight_code({
  "id": "current",
  "mode": "add",
  "ranges": [
    {
      "start": { "line": 203, "character": 30 },
      "end": { "line": 204, "character": 66 }
    }
  ]
})
```

Add a second callout:

```json
vscode_set_inline_callout_code({
  "id": "current",
  "mode": "add",
  "range": {
    "start": { "line": 203, "character": 30 },
    "end": { "line": 204, "character": 66 }
  },
  "title": "Added focus",
  "message": "This extra highlight was appended with mode=add, so earlier highlights stayed visible."
})
```

### 6. Follow the service implementation

Navigate from `setHighlights` into `src/editor/annotation-service.ts`:

```json
vscode_go_to_definition_code({
  "path": "src/tools/editor-tools.ts",
  "position": { "line": 198, "character": 62 }
})
```

Explain:

- default id `current`
- `replace` vs `add`
- range conversion through `mcpRangeToVsCodeRange`
- grouped decoration state
- no selection mutation

### 7. Test user selection

Ask the user to select a small expression in VS Code, then call:

```json
vscode_get_editor_context_code({
  "includeSelectedText": true,
  "includeVisibleEditors": true
})
```

Expected:

- The active editor selection is serialized.
- The agent explains exactly the selected text.
- If the selected editor is outside the workspace, context should not expose it.

### 8. Clean up

End with:

```json
vscode_clear_annotations_code({ "all": true })
```

Expected: all temporary highlights and inline callouts disappear.

## Success criteria

The demo succeeds when:

- VS Code visibly navigates to each explained range.
- Highlights target exact symbols/expressions, not only whole lines.
- Inline callouts are visible without hover.
- Pathless follow-up operations work after the active editor is established.
- `mode: "replace"` narrows or changes focus.
- `mode: "add"` preserves existing highlights while adding relationships.
- Definition navigation opens the target location and returns it to the agent.
- User steering changes the path of the explanation without restarting the walkthrough.
- Cleanup removes visual state.

## Troubleshooting

### `ECONNREFUSED 127.0.0.1:3000`

The VS Code MCP server is not listening. In the VS Code window, run `Toggle MCP Server` and confirm the status bar shows `MCP Server: 3000`.

### Pi sees `vscode` but no direct tools

Reconnect the server:

```text
mcp({ connect: "vscode" })
```

If using `pi-mcp-adapter` proxy mode, call tools through `mcp({ tool: "vscode_tool_name", args: "..." })` instead of expecting direct tool names.

### No active editor in context

Open a workspace file or use `reveal_range_code` with an explicit `path` first.

### Callout fails for a non-visible file

Reveal the file first. Inline callouts attach to a visible editor line.
