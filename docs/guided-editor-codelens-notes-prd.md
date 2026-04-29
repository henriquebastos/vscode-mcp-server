# Guided Editor CodeLens Notes PRD

## Problem Statement

The guided editor annotation primitives now support precise highlights, kinded background colors, inline callouts, gutter markers, hover notes, anchored guided explanation comments, overview-ruler markers, clearing, editor context, reveal, and definition navigation. These surfaces cover most visual explanation needs, but they still leave a gap for lightweight visible step labels.

Inline callouts are useful for short explanations, but they sit inside the code line and can feel visually intrusive when the agent only needs to label a step, role, or relationship. Gutter markers are compact, but they do not carry enough visible text. Hover notes are good for optional word-level detail, but they require hover. Guided Explanation comments support longer anchored notes, but they feel heavier than a simple walkthrough step label.

During a guided code walkthrough, an agent often wants to label code as “Step 1: schema,” “Step 2: service delegation,” “Caller,” “Definition,” “Cleanup,” or “Question to revisit.” These labels should be visible without hover, attached to a line/range, temporary, and clearable, but they should not edit source files or introduce a full side panel/webview.

The missing primitive is a CodeLens-style note: an above-line, low-disruption label that can communicate step or role information while keeping the code line itself visually clean.

## Solution

Add a new editor annotation primitive for temporary CodeLens notes / step labels.

A CodeLens note should let an agent place a short visible label above or near a code line/range using VS Code’s CodeLens provider API. The note should be grouped by annotation id, support replace/add behavior, support semantic annotation kinds, and be cleared through the existing `clear_annotations_code` lifecycle.

The primitive should remain low-level and composable. It should not introduce a walkthrough timeline, side panel, webview, or persistent memory. Agent skills can compose CodeLens notes with existing highlights, gutter markers, hover notes, inline callouts, and guided explanation comments.

The intended public tool name is:

- `set_codelens_note_code`

The primitive should be used for short visible labels such as:

- `Step 1: Tool schema`
- `Step 2: Service delegation`
- `Caller`
- `Definition`
- `Cleanup path`
- `Question to revisit`
- `Related helper`

The label should be visible without hover. If VS Code requires CodeLens commands, the command should be harmless and non-editing. The note should not create source edits, diagnostics, Problems panel entries, or review comments.

## User Stories

1. As a developer learning a codebase, I want a visible step label above a code range, so that I can follow a walkthrough sequence without reading chat history.
2. As a developer learning a codebase, I want step labels to stay out of the code line itself, so that the source code remains visually readable.
3. As a developer learning a codebase, I want a label such as “Step 1: schema” to appear near the relevant code, so that I understand the walkthrough order.
4. As a developer learning a codebase, I want a label such as “Caller” to appear above a relevant call site, so that relationship explanations are easier to follow.
5. As a developer learning a codebase, I want a label such as “Definition” to appear above a target implementation, so that navigation context remains visible after jumping.
6. As a developer learning a codebase, I want a label such as “Cleanup path” to appear above cleanup code, so that important lifecycle paths are easy to identify.
7. As a developer learning a codebase, I want a label such as “Question to revisit” to appear above a line, so that unanswered follow-ups remain visible without requiring a comment thread.
8. As a developer learning a codebase, I want CodeLens notes to be temporary, so that guided walkthrough labels disappear when the walkthrough is cleared.
9. As a developer learning a codebase, I want CodeLens notes to be clearable by annotation id, so that the agent can remove the current walkthrough labels without clearing unrelated labels.
10. As a developer learning a codebase, I want CodeLens notes to be clearable by path, so that the agent can clean up one file without disturbing annotations in another file.
11. As a developer learning a codebase, I want CodeLens notes to be clearable globally, so that ending a walkthrough removes all temporary visual state.
12. As a developer learning a codebase, I want CodeLens notes to work with existing highlights, so that a label can identify a step while the highlight marks the exact span.
13. As a developer learning a codebase, I want CodeLens notes to work with existing gutter markers, so that a step can have both a textual label and a compact location marker.
14. As a developer learning a codebase, I want CodeLens notes to work with hover notes, so that the visible label can stay short while word-level details remain available on hover.
15. As a developer learning a codebase, I want CodeLens notes to work with Guided Explanation comments, so that longer notes can be added only when necessary.
16. As a developer learning a codebase, I want CodeLens notes to be visible without hover, so that they can act as walkthrough labels rather than hidden hints.
17. As a developer learning a codebase, I want CodeLens notes to avoid editing files, so that guided explanation remains presentation-only.
18. As a developer learning a codebase, I want CodeLens notes to avoid changing my cursor or selection, so that I stay in control of editing state.
19. As a developer learning a codebase, I want CodeLens notes to use workspace-relative path safety, so that an agent cannot annotate files outside the workspace.
20. As a developer learning a codebase, I want CodeLens notes to support active-editor fallback, so that conversational follow-ups can add labels without repeating the current path.
21. As a developer learning a codebase, I want pathless CodeLens note operations to fail clearly when no active editor exists, so that errors are understandable.
22. As a developer learning a codebase, I want CodeLens note positions to use the same range coordinate convention as other editor tools, so that tool calls are predictable.
23. As a developer learning a codebase, I want CodeLens notes to support semantic kinds, so that labels can reflect focus, related context, previous context, questions, warnings, or info.
24. As a developer learning a codebase, I want the note text to be short and readable, so that the label does not overwhelm the editor.
25. As a developer learning a codebase, I want CodeLens notes to be visually less intrusive than inline callouts, so that line-level labels do not crowd source text.
26. As a developer learning a codebase, I want CodeLens notes to be visually lighter than comments, so that simple step labels do not feel like review artifacts.
27. As a developer learning a codebase, I want CodeLens notes to avoid Problems panel entries, so that guided labels do not look like diagnostics.
28. As a developer learning a codebase, I want CodeLens notes to avoid quick-fix semantics, so that guided labels do not imply an edit action.
29. As a developer learning a codebase, I want CodeLens notes to remain visible while I scroll through the file, so that walkthrough structure is preserved near the relevant code.
30. As a developer learning a codebase, I want CodeLens notes to be removed when the MCP server stops, so that stale walkthrough labels are not left behind.
31. As an agent author, I want a CodeLens note primitive, so that I can label walkthrough steps without using an inline callout.
32. As an agent author, I want CodeLens notes to be grouped by id, so that I can manage current, related, and question labels separately.
33. As an agent author, I want replace mode for CodeLens notes, so that moving the current step does not leave stale step labels behind.
34. As an agent author, I want add mode for CodeLens notes, so that I can build a multi-step walkthrough with several visible labels.
35. As an agent author, I want the default annotation id to remain `current`, so that simple labels do not require extra bookkeeping.
36. As an agent author, I want CodeLens note labels to support pathless active-editor targeting, so that follow-up labels are low-token.
37. As an agent author, I want CodeLens notes to support explicit paths for multi-file walkthroughs, so that labels can be placed across related files.
38. As an agent author, I want CodeLens notes to return the id, paths, and range count, so that tool results are consistent with other annotation primitives.
39. As an agent author, I want CodeLens notes to be cleared by the existing clear primitive, so that cleanup remains one mental model.
40. As an agent author, I want CodeLens notes to be independent of highlights, so that I can label a line without applying a text highlight.
41. As an agent author, I want CodeLens notes to support semantic kinds without forcing custom colors, so that visual styling stays internally managed.
42. As an extension user, I want CodeLens notes to respect my source text, so that annotations never modify files.
43. As an extension user, I want CodeLens notes to be harmless when clicked, so that accidental clicks do not edit code or run unexpected commands.
44. As an extension user, I want CodeLens notes to be clearly part of guided explanation, so that they do not look like test-run, reference-count, or GitLens metadata.
45. As an extension user, I want CodeLens notes to be temporary, so that they do not become persistent project metadata.
46. As an extension maintainer, I want CodeLens note lifecycle complexity hidden inside the annotation service, so that MCP handlers stay thin.
47. As an extension maintainer, I want CodeLens provider state to be centralized, so that refresh, clear, and dispose behavior is predictable.
48. As an extension maintainer, I want CodeLens tests to mock or observe VS Code provider interactions, so that tests do not rely on rendering pixels.
49. As an extension maintainer, I want CodeLens notes to reuse existing path and range utilities, so that coordinate behavior stays consistent.
50. As an extension maintainer, I want CodeLens notes to reuse existing annotation grouping semantics, so that clear-by-id/path/all remains consistent across surfaces.

## Implementation Decisions

- Add a new editor primitive named `set_codelens_note_code`.
- Preserve existing editor primitive tools and behavior.
- Keep the primitive low-level and composable; do not introduce a walkthrough timeline or side panel.
- Use VS Code’s CodeLens provider API for visible above-line labels.
- The annotation service should own CodeLens provider registration, in-memory note state, refresh events, clearing, and disposal.
- MCP handlers should stay thin: validate input, call the annotation service, and return JSON.
- CodeLens notes should be temporary annotation state only.
- CodeLens notes should not edit source files.
- CodeLens notes should not create diagnostics or Problems panel entries.
- CodeLens notes should not create review comments.
- CodeLens notes should not use quick-fix semantics.
- If CodeLens objects require commands, the command should be harmless and non-editing.
- The note text should be short. The tool should accept a label/title string, not a long markdown body.
- Longer explanations should continue to use Guided Explanation comments.
- Word-level optional information should continue to use hover notes.
- Visible line-level labels should use CodeLens notes.
- CodeLens notes should support the same semantic kinds as existing annotations: `focus`, `related`, `previous`, `question`, `warning`, and `info`.
- CodeLens note kind should be a semantic intent, not a direct custom style contract.
- CodeLens notes should support `id`, defaulting to `current`.
- CodeLens notes should support `path`, with active-editor fallback when omitted.
- CodeLens notes should support a precise `range` input using the existing coordinate convention.
- CodeLens notes should support `mode`, defaulting to `replace`.
- Replace mode should replace CodeLens notes for that id without clearing other annotation surfaces.
- Add mode should append CodeLens notes for that id.
- Clear-by-id should remove matching CodeLens notes along with other surfaces for that id.
- Clear-by-path should remove CodeLens notes on that path along with other surfaces for that path.
- Global clear should remove all CodeLens notes along with every other temporary annotation surface.
- MCP results should remain consistent with existing annotation operation results: id, paths, and range count.
- CodeLens provider refresh should occur when notes are set or cleared.
- CodeLens provider disposal should occur when the annotation service is disposed or the MCP server stops.
- CodeLens notes should preserve cursor and selection.
- The implementation should handle files that are not currently visible by storing notes by URI and serving them when CodeLens is requested for that document.
- The implementation should be robust if the user has CodeLens disabled globally; tool calls should still succeed, but visibility depends on user/editor settings.

## Testing Decisions

- Tests should focus on behavior and VS Code API interactions, not pixel-perfect rendering.
- Tests should cover that `set_codelens_note_code` is registered with the editor tool category.
- Tests should cover that the tool handler returns the expected id, paths, and range count.
- Tests should cover that the annotation service registers a CodeLens provider.
- Tests should cover that setting a CodeLens note makes the provider return a CodeLens for the target document and range.
- Tests should cover that the returned CodeLens has a harmless, non-editing command or no-op command behavior if a command is required.
- Tests should cover replace mode for CodeLens notes.
- Tests should cover add mode for CodeLens notes.
- Tests should cover clear-by-id for CodeLens notes.
- Tests should cover clear-by-path for CodeLens notes.
- Tests should cover global clear for CodeLens notes.
- Tests should cover that clearing CodeLens notes refreshes the CodeLens provider.
- Tests should cover that disposing the annotation service disposes the CodeLens provider and refresh event resources.
- Tests should cover active-editor fallback for pathless CodeLens note operations.
- Tests should cover clear errors or no-op behavior remains understandable when targets do not exist.
- Tests should cover workspace-relative path safety through the existing location utilities.
- Tests should cover that CodeLens notes preserve selection and cursor state.
- Tests should use the existing mocked VS Code API style already present in the test suite.
- Tests should prefer public service methods and tool handlers over private implementation details.
- Tests should not assert exact CodeLens pixel placement or rendering.
- Tests should not rely on actual user CodeLens settings.

## Out of Scope

- A webview or side panel.
- A persistent walkthrough timeline.
- Persistent CodeLens notes across reloads.
- Source-code edits.
- Diagnostics-backed labels or Problems panel entries.
- Quick-fix actions or edit actions.
- Clickable actions that mutate code or execute arbitrary commands.
- Arbitrary custom CSS, fonts, or color selection from MCP inputs.
- Long markdown bodies in CodeLens notes.
- Word-level hover note replacement; hover notes already cover that use case.
- Anchored long-form comments; Guided Explanation comments already cover that use case.
- Pixel-perfect rendering guarantees across themes or user CodeLens settings.
- Multi-root workspace behavior beyond existing project assumptions.

## Further Notes

CodeLens notes are intended to fill a narrow visual gap between inline callouts and comments. They are for short visible labels, especially walkthrough step labels and role labels.

The primitive should not become a high-level presentation system. It should be one more temporary editor surface that agents can compose with highlights, gutter markers, hover notes, inline callouts, comments, reveal, and definition navigation.

The main UX distinction is:

- Highlight: marks exact code span.
- Gutter marker: marks line/location compactly.
- Hover note: adds optional word-level information on hover.
- Inline callout: adds short visible explanation beside code.
- Guided Explanation comment: adds longer anchored explanation.
- CodeLens note: adds short visible step/role label above code.
