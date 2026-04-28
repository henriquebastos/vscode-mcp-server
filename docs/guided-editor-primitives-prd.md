## Problem Statement

AI agents can inspect code through existing MCP tools, but they cannot yet use VS Code as a collaborative teaching surface. When a user asks an agent to explain how code works, the agent can describe files and symbols in chat, but it cannot reliably direct the user's visual attention inside the editor.

The missing capability is not persistent memory or code editing. The user's active agent session already carries the exposition context. What is missing is a small set of composable editor-control primitives that let the agent reveal code, highlight precise spans, attach visible inline explanations, clear visual state, understand the current editor context, and follow definitions.

Without these primitives, guided code explanation stays detached from the editor. The user has to manually find the relevant code, hover for labels, or infer which exact expression the agent is discussing. That makes exploration feel like a chat transcript instead of a collaborative walkthrough of the codebase.

## Solution

Add a new editor tool category to the VS Code MCP server. This category exposes low-level, composable MCP tools for guided code explanation.

The tools should let an agent:

- Read the current VS Code editor context.
- Reveal a precise code range without selecting text.
- Set visual highlights over one or more precise ranges.
- Set visible inline callouts attached to code, without requiring hover.
- Clear annotations by id or globally.
- Navigate VS Code to a symbol definition.

The core product behavior is collaborative exploration, not a slideshow. The agent should be able to move from broad focus to narrow focus in response to user follow-up questions. For example, the agent may first highlight a function call, then narrow the highlight to one argument when the user asks what part is being passed.

The primitives must remain lower-level building blocks. Higher-level guided behaviors can be composed from them later without redoing the API surface.

## User Stories

1. As a developer learning a codebase, I want the agent to reveal the exact code it is explaining, so that I do not have to manually search for the relevant location.
2. As a developer learning a codebase, I want the agent to highlight precise character spans, so that I can see exactly which expression or argument matters.
3. As a developer learning a codebase, I want the agent to narrow an existing highlight during follow-up questions, so that exploration can become more precise over time.
4. As a developer learning a codebase, I want the agent to avoid selecting text when it highlights code, so that my editor cursor and selection are not disturbed.
5. As a developer learning a codebase, I want the agent to show an inline explanation next to code, so that I can connect the explanation to the exact visual location.
6. As a developer learning a codebase, I want inline explanations to be visible without hover, so that I do not need to discover or trigger hidden UI.
7. As a developer learning a codebase, I want inline explanations to support a title and a short sentence, so that the annotation can contain more than a terse label.
8. As a developer learning a codebase, I want the agent to clear previous annotations when moving to a new focus, so that the editor does not become visually cluttered.
9. As a developer learning a codebase, I want the agent to keep annotations grouped by id, so that current focus and other future annotation groups can be managed separately.
10. As a developer learning a codebase, I want a default annotation id for the current focus, so that simple guided interactions do not require extra bookkeeping.
11. As a developer learning a codebase, I want the agent to highlight multiple precise ranges at once, so that it can explain relationships between two or more code locations.
12. As a developer learning a codebase, I want the agent to reveal a range without applying a highlight, so that it can simply move my view when visual marking is unnecessary.
13. As a developer learning a codebase, I want the agent to understand my active editor, so that it can respond to where I am currently looking.
14. As a developer learning a codebase, I want the agent to know visible editor ranges, so that it can avoid redundant navigation when code is already on screen.
15. As a developer learning a codebase, I want the agent to work from the active editor when no path is provided, so that follow-up interactions feel lightweight.
16. As a developer learning a codebase, I want the agent to fail clearly when no active editor is available for pathless operations, so that errors are understandable.
17. As a developer learning a codebase, I want the agent to follow a symbol definition visually in VS Code, so that “let’s follow this call” actually moves the editor.
18. As a developer learning a codebase, I want definition navigation to return the resulting location, so that the agent can continue explaining from the new focus.
19. As a developer learning a codebase, I want the agent to keep explanation and navigation coupled, so that I know why a code range is being shown.
20. As a developer learning a codebase, I want the agent to compose reveal, highlight, and callout operations into higher-level behavior, so that future guided workflows can be built without changing the primitives.
21. As an agent author, I want separate primitives instead of one monolithic presentation tool, so that new behaviors can be composed flexibly.
22. As an agent author, I want editor presentation tools to use stable ids, so that I can replace, add, and clear annotations predictably.
23. As an agent author, I want the default behavior to replace the current focus, so that basic explanations do not accumulate stale highlights.
24. As an agent author, I want the option to add highlights to an existing group, so that I can show relationships across several precise spans.
25. As an agent author, I want path omission to use the active editor, so that conversational follow-ups can target the current file without repeating full location data.
26. As an agent author, I want all ranges to support precise start and end positions, so that explanations can target expressions rather than only whole lines.
27. As an agent author, I want range coordinates to be consistent across the editor tools, so that tool calls are easy to generate correctly.
28. As an agent author, I want the context tool to expose selected text when requested, so that the agent can respond if the user manually selects code.
29. As an agent author, I want the context tool to expose visible editors when requested, so that the agent can adapt to split-editor layouts.
30. As an agent author, I want the editor tools to be enabled as a separate category, so that users can configure them independently from file editing and shell execution.
31. As an extension user, I want editor presentation tools enabled by default in this fork, so that guided code exploration works immediately.
32. As an extension user, I want these tools to be presentation-oriented rather than editing-oriented, so that guided explanation does not unexpectedly modify source files.
33. As an extension user, I want highlight and callout operations to avoid cursor and selection changes, so that I remain in control of my editing state.
34. As an extension user, I want clear visual feedback for the current focus, so that I can track the agent’s explanation without losing my place.
35. As an extension user, I want annotations to be temporary, so that the guided UI does not become persistent project state.
36. As an extension maintainer, I want the new behavior organized behind a deep annotation service, so that VS Code decoration lifecycle complexity is hidden behind a simple interface.
37. As an extension maintainer, I want path and range conversion centralized, so that every editor tool handles positions consistently.
38. As an extension maintainer, I want MCP schema handlers to stay thin, so that behavior can be tested without exercising the full MCP transport.
39. As an extension maintainer, I want navigation behavior separated from annotation behavior, so that reveal and definition tools can evolve independently from callouts and highlights.
40. As an extension maintainer, I want tests to assert observable tool behavior and VS Code API interactions, so that the implementation remains safe to refactor.

## Implementation Decisions

- Add a new enabled tool category named `editor`.
- Enable the editor tool category by default in this fork.
- Expose separate composable MCP tools rather than one large presentation tool.
- The initial tool set is:
  - `get_editor_context_code`
  - `reveal_range_code`
  - `set_highlight_code`
  - `set_inline_callout_code`
  - `clear_annotations_code`
  - `go_to_definition_code`
- Do not add an exploration memory file as part of this PRD. The active agent session is the memory for the guided exposition.
- Do not build a slideshow or scripted walkthrough system. The desired interaction is collaborative exploration where the user can interrupt, ask follow-up questions, and ask the agent to narrow or shift focus.
- Highlights and inline callouts are visual presentation state only. They must not edit source files.
- Highlight and callout tools must not mutate the user’s cursor or text selection.
- Ranges must support precise character positions, not only whole-line highlighting.
- Highlights must support multiple ranges from the first implementation.
- Annotation operations must use ids. The default id is `current`.
- The default usage pattern should replace the current focus. Additive behavior should be available for multi-range relationship explanations.
- Path arguments may be omitted where sensible. When omitted, the operation targets the active editor. If no active editor exists, the tool should return a clear failure.
- Inline callouts should be visible without hover.
- Inline callouts should attach at the end of the start line of the explained range for the first implementation.
- Inline callouts should support a title plus a short sentence.
- The reveal tool should open or reveal a precise range without selection changes.
- The definition tool should actually navigate VS Code to the definition, not merely return definition metadata.
- The definition tool should report the resulting location so the agent can continue from the new focus.
- Build a shared location/range utility layer to handle workspace-relative path resolution, active-editor fallback, and conversion between MCP-facing positions and VS Code positions.
- Build an editor context service for the current editor, visible editors, visible ranges, selection metadata, and optionally selected text.
- Build a presentation annotation service as a deep module that owns highlight and inline callout state, annotation ids, replacement/add behavior, styles, and cleanup.
- Build a navigation service for reveal and definition navigation.
- Keep MCP tool schema handlers thin; they should validate input, call the relevant service, and format output.

## Testing Decisions

- Tests should focus on external behavior and observable VS Code API interactions, not implementation details or pixel-perfect rendering.
- Do not test exact visual pixels, colors, or rendering internals. VS Code owns rendering; the extension should test that it creates and applies the intended decorations and clears them correctly.
- Test the shared range/location utilities.
  - Good tests cover active-editor fallback, missing active editor errors, path resolution, 1-based to VS Code position conversion, default character behavior, and precise ranges.
- Test the annotation service behavior.
  - Good tests cover replacing annotations by id, adding ranges to an existing id, clearing one id, clearing all ids, limiting clearing by path, preserving cursor/selection, and managing both highlights and inline callouts.
- Test editor context serialization.
  - Good tests cover active editor metadata, visible ranges, visible editors, optional selected text, truncation behavior, and no-active-editor behavior.
- Test navigation service interactions with mocked VS Code APIs.
  - Good tests cover revealing a range, opening a file when necessary, not changing selection during reveal, invoking definition navigation, handling no-definition results, and reporting the resulting location.
- Test tool category wiring and config defaults.
  - Good tests cover the editor category defaulting to enabled in this fork, respecting disabled configuration, and registering the expected tools only when the category is enabled.
- Prior art exists in the current test approach: extension tests already use mocked VS Code APIs and test registration/startup behavior with stubs. The new tests should follow the same style where practical.

## Out of Scope

- Persistent exploration memory.
- An `exploration.md` file.
- Knowledge graphs or Mermaid diagrams.
- A dedicated explanation side panel or webview.
- A complete guided exploration agent prompt.
- A monolithic `present_range` tool.
- Source-code editing behavior.
- Shell execution behavior.
- Whole-codebase semantic understanding beyond existing symbol/discovery tools.
- Persistent annotations across VS Code reloads.
- Multi-root workspace support beyond the existing project assumptions.
- Hover-only labels as the primary explanation UI.
- Pixel-perfect styling guarantees for decorations.

## Further Notes

This feature is specifically about the missing VS Code control surface for guided explanation. Existing file and symbol tools let an agent inspect code, but the agent also needs visual primitives to direct the human’s attention.

The most important product distinction is that this is collaborative exploration, not a pre-authored slideshow. The user may ask follow-up questions that narrow or redirect the current highlight. The primitive API should make that easy without forcing a rigid sequence.

The most important technical distinction is that the tools should remain composable primitives. Higher-level guided behaviors can later be built as recipes over reveal, highlight, callout, clear, context, and definition navigation.
