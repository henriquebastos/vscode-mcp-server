---
name: guided-code-explanation
description: Drive collaborative code walkthroughs inside VS Code using this repo's editor MCP primitives. Use when the user asks for a guided explanation, visual walkthrough, teaching mode, editor-driven demo, or wants the agent to explain code collaboratively and iteratively.
---

# Guided Code Explanation

Use this skill to teach code through VS Code, not just chat. The agent should direct visual attention with editor primitives, pause for user steering, and keep annotations temporary.

## Preflight

1. Confirm the VS Code MCP server is connected.
   - Direct tools are usually prefixed, e.g. `vscode_get_editor_context_code`.
   - If unavailable, ask the user to enable the VS Code MCP server and reconnect `vscode`.
2. Start by reading editor context:
   - `get_editor_context_code({ includeVisibleEditors: true })`
3. If no active editor is present, reveal the first planned file explicitly.
4. Keep explanations scoped to the current visual focus; avoid dumping a full architecture lecture first.

## Core loop

Repeat this loop until the user stops:

1. **Reveal before explaining**
   - Use `reveal_range_code` for the file/range being discussed.
   - Prefer pathless calls for follow-ups when the active editor is already correct.
2. **Mark exact spans**
   - Use `set_highlight_code` with `id: "current"`, `mode: "replace"`, and `kind: "focus"` for a new focus.
   - Use `kind: "related"`, `"previous"`, `"question"`, `"warning"`, or `"info"` when the visual role is not the current focus.
   - Use `mode: "add"` only to show relationships across multiple spans.
3. **Attach visible explanation surfaces**
   - Use `set_inline_callout_code` with a short title and one sentence.
   - Keep callouts under ~120 characters when practical.
   - Use `set_gutter_marker_code` for step, question, warning, or related-location markers.
   - Use `set_explanation_comment_code` for longer anchored markdown explanations; keep the wording clearly about “Guided Explanation.”
4. **Explain briefly in chat**
   - Name what is highlighted and why it matters.
   - Mention the relevant behavior, not every implementation detail.
5. **Offer choices**
   - End with 2-5 numbered next steps the user can pick from.
6. **Clear stale focus**
   - Use `clear_annotations_code({ id: "current" })` before moving to an unrelated concept.
   - Use `clear_annotations_code({ all: true })` at the end of the walkthrough.

## Interaction patterns

### User chooses a numbered path

- Clear or replace `current`.
- Navigate/reveal the next range.
- Highlight the new exact span.
- Add one callout.
- Explain and offer new choices.

### User asks to narrow focus

- Use `set_highlight_code` with `mode: "replace"` on the narrower expression.
- Do not navigate if the expression is already visible.
- Update the callout with the new precise explanation.

### User asks to show relationships

- Keep the primary span highlighted.
- Add related spans with `mode: "add"`.
- Use one callout to explain the relationship.

### User manually selects code

1. Call `get_editor_context_code({ includeSelectedText: true })`.
2. Explain the selected text specifically.
3. Optionally replace `current` with a highlight matching the selected range.

### User says “follow this”

- Use `go_to_definition_code` at the symbol position or active selection.
- Explain from the returned location.
- Add a callout explaining why this definition is relevant.

## Tool conventions

- Coordinates are MCP-facing: line numbers are 1-based; characters are 0-based.
- `id: "current"` is the default focus group.
- `kind` controls visual meaning; use `focus`, `related`, `previous`, `question`, `warning`, or `info` instead of trying to control colors.
- Use semantic ids like `related`, `previous`, or `question` only when multiple groups must be managed independently.
- Do not use editor primitives to edit source files.
- Do not expose selected text from unrelated/out-of-workspace editors; if context is empty, ask the user to focus a workspace file.

## Good walkthrough style

- “I’m showing the registration point first.”
- “Now I’m narrowing to the schema because that is the public API.”
- “I’ll add a second highlight to show where the handler delegates.”
- “Pick where to go next: annotation state, path safety, context, or definition navigation.”

See `docs/guided-editor-demo.md` for a concrete dogfood script for this repository.
