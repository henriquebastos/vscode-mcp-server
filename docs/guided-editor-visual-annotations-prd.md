# Guided Editor Visual Annotations PRD

## Problem Statement

The guided editor primitives let an agent reveal code, highlight ranges, add short inline callouts, clear temporary annotations, inspect editor context, and navigate to definitions. These primitives are enough for a basic walkthrough, but the visual vocabulary is still too limited for richer collaborative explanations.

Today, most marked code looks like the same kind of focus. An agent cannot visually distinguish the current focus from related context, a previous step, a question, a warning, or neutral information. It also cannot place temporary markers in the gutter, surface related locations in the overview ruler, or attach longer anchored explanations without overloading short inline callouts.

This makes deeper guided explanations harder to follow. A user may want to see the main span, supporting spans, and an unresolved question at the same time, but the editor has no simple way to show those roles distinctly. Longer teaching notes also remain trapped in chat instead of being anchored to the code being discussed.

The goal is to add a richer, temporary, low-level visual annotation vocabulary for guided explanation while preserving the composable primitive style. This should not become a webview, side panel, persistent review system, or source-editing feature.

## Solution

Extend the editor annotation primitives with semantic annotation kinds, temporary gutter markers, overview-ruler styling, and anchored guided explanation comments.

The existing highlight and inline callout primitives should gain a `kind` concept. Supported kinds are:

- `focus`
- `related`
- `previous`
- `question`
- `warning`
- `info`

Kinds express annotation intent, not exact colors. The extension should choose theme-aware styles internally. Tests should verify that kinded decoration options are created and applied through VS Code APIs, not exact rendered pixels.

Add a temporary gutter marker primitive for line/range-oriented walkthrough markers. Gutter markers should support the same annotation id, path fallback, kind, label, and replace/add lifecycle as the existing annotation tools.

Use overview-ruler styling as part of kinded highlight and gutter marker decorations rather than introducing a separate overview-ruler tool in the first pass. This keeps the API surface small while making long-file related locations easier to see.

Add an anchored guided explanation comment primitive using the VS Code Comments API. These comments should be clearly branded as guided explanations, not code review comments. They should support longer markdown bodies, attach to code ranges, be temporary, and be clearable through the existing annotation lifecycle.

The existing clear primitive should clear every temporary annotation surface: highlights, inline callouts, gutter markers, overview-ruler markers, and guided explanation comments.

## User Stories

1. As a developer learning a codebase, I want the current focus annotation to look visually stronger than supporting context, so that I can quickly see what the agent is explaining now.
2. As a developer learning a codebase, I want related code spans to look distinct from the current focus, so that I can understand relationships without losing the main thread.
3. As a developer learning a codebase, I want previous focus spans to be visually subtle, so that I can keep orientation without stale annotations competing for attention.
4. As a developer learning a codebase, I want question annotations to have distinct styling, so that unresolved follow-ups stand out during exploration.
5. As a developer learning a codebase, I want warning annotations to have distinct styling, so that the agent can call attention to risks, caveats, or surprising behavior.
6. As a developer learning a codebase, I want neutral information annotations to be visually lightweight, so that explanatory context does not overwhelm the editor.
7. As a developer learning a codebase, I want inline callouts to support the same semantic kinds as highlights, so that the visual language stays consistent across surfaces.
8. As a developer learning a codebase, I want highlight kinds to be selected by intent instead of color values, so that annotations remain readable across themes.
9. As a developer learning a codebase, I want the agent to mark a line in the gutter, so that step markers and question targets are visible even when the exact range is small.
10. As a developer learning a codebase, I want gutter markers to support short labels, so that I can hover or inspect a marker and know why it exists.
11. As a developer learning a codebase, I want gutter markers to use the same annotation ids as highlights and callouts, so that related visual state can be cleared together.
12. As a developer learning a codebase, I want gutter markers to support replace mode, so that moving the current focus does not leave stale markers behind.
13. As a developer learning a codebase, I want gutter markers to support add mode, so that an agent can mark several related steps or locations at once.
14. As a developer learning a codebase, I want gutter markers to target one or more explicit lines, so that step markers are easy for an agent to place.
15. As a developer learning a codebase, I want gutter markers to target precise ranges when needed, so that markers can remain aligned with the same range model as other editor tools.
16. As a developer learning a codebase, I want long-file annotations to appear in the overview ruler, so that related locations are discoverable even when they are off screen.
17. As a developer learning a codebase, I want overview-ruler markers to follow annotation kinds, so that the right-side file overview uses the same visual language as the editor body.
18. As a developer learning a codebase, I want overview-ruler behavior to be automatic for highlights and gutter markers, so that agents do not need a separate tool call for the common case.
19. As a developer learning a codebase, I want longer explanations anchored to code ranges, so that I can connect detailed teaching notes to the exact code they describe.
20. As a developer learning a codebase, I want anchored explanation comments to support markdown, so that longer explanations can include lists, inline code, and concise structure.
21. As a developer learning a codebase, I want anchored explanation comments to be clearly labeled as guided explanations, so that they do not feel like persistent review comments.
22. As a developer learning a codebase, I want anchored explanation comments to be temporary, so that they disappear when the walkthrough moves on or the MCP server stops.
23. As a developer learning a codebase, I want anchored explanation comments to be clearable by annotation id, so that the agent can remove a specific guided explanation group.
24. As a developer learning a codebase, I want anchored explanation comments to be clearable by path, so that the agent can clean up one file without disturbing other files.
25. As a developer learning a codebase, I want anchored explanation comments to be clearable globally, so that ending a walkthrough can remove all temporary teaching UI.
26. As a developer learning a codebase, I want short inline callouts to remain available, so that not every explanation needs a heavier comment thread.
27. As a developer learning a codebase, I want longer anchored comments to complement inline callouts, so that the agent can choose the right surface for the explanation length.
28. As a developer learning a codebase, I want all visual annotations to avoid editing source files, so that guided explanation remains presentation-only.
29. As a developer learning a codebase, I want all visual annotations to avoid changing my selection or cursor, so that I stay in control of editing state.
30. As a developer learning a codebase, I want pathless annotation calls to keep using the active editor, so that follow-up interactions stay lightweight.
31. As a developer learning a codebase, I want pathless annotation calls to fail clearly when no active editor exists, so that errors are understandable.
32. As a developer learning a codebase, I want annotation paths to remain workspace-relative and safe, so that an agent cannot mark arbitrary files outside the workspace.
33. As a developer learning a codebase, I want annotation ranges to use the same coordinate convention across all tools, so that tool calls are predictable.
34. As a developer learning a codebase, I want the agent to keep the main focus, related spans, warnings, and questions in separate visual roles, so that complex explanations remain understandable.
35. As a developer learning a codebase, I want the agent to show a question marker without immediately jumping to it, so that follow-up paths can remain visible while the current explanation continues.
36. As a developer learning a codebase, I want the agent to show warning markers in the gutter, so that risky or surprising code is easy to revisit.
37. As a developer learning a codebase, I want the agent to use previous styling for just-left-behind locations, so that I can follow a multi-step walkthrough without losing context.
38. As a developer learning a codebase, I want the agent to use related styling for supporting definitions or call sites, so that I can distinguish them from the main focus.
39. As a developer learning a codebase, I want the agent to use info styling for neutral explanatory notes, so that the editor does not become visually noisy.
40. As an agent author, I want semantic annotation kinds instead of raw styling controls, so that I can express intent without managing VS Code rendering details.
41. As an agent author, I want existing highlight calls to keep working, so that current guided explanation prompts remain compatible.
42. As an agent author, I want existing inline callout calls to keep working, so that current guided explanation prompts remain compatible.
43. As an agent author, I want a dedicated gutter marker primitive, so that I can add temporary line markers without also adding inline prose.
44. As an agent author, I want a dedicated explanation comment primitive, so that I can attach longer teaching notes without overloading inline callouts.
45. As an agent author, I want overview-ruler support to come from existing annotation styles, so that I do not need to coordinate another annotation surface manually.
46. As an agent author, I want default annotation ids and replace mode to remain unchanged, so that simple guided interactions stay low-friction.
47. As an agent author, I want add mode to work for new annotation surfaces, so that I can build multi-location explanations incrementally.
48. As an agent author, I want clear-by-id to remove all surfaces for that id, so that cleanup remains predictable.
49. As an agent author, I want clear-by-path to remove all surfaces for that path, so that file-scoped cleanup remains predictable.
50. As an agent author, I want global clear to remove all temporary guided annotation state, so that a walkthrough can end cleanly.
51. As an extension user, I want annotation comments to be read-only guided notes, so that they do not invite accidental review workflows.
52. As an extension user, I want annotation comments to avoid reply prompts, so that guided explanation does not look like a discussion thread I need to resolve.
53. As an extension user, I want all temporary annotation resources disposed when the MCP server stops, so that the editor is not left with stale visual state.
54. As an extension user, I want all temporary annotation resources disposed when the editor tool category is disabled, so that disabling tools reliably removes their UI.
55. As an extension maintainer, I want MCP handlers to remain thin, so that annotation behavior is testable without MCP transport complexity.
56. As an extension maintainer, I want annotation lifecycle complexity hidden inside a deeper annotation service, so that VS Code decoration and comment APIs do not leak into tool registration.
57. As an extension maintainer, I want workspace path resolution and range conversion to stay centralized, so that all editor primitives remain consistent.
58. As an extension maintainer, I want annotation kind styling centralized, so that visual vocabulary can evolve without changing MCP tool schemas.
59. As an extension maintainer, I want comment thread lifecycle centralized, so that clear and dispose behavior is reliable.
60. As an extension maintainer, I want behavior-focused tests at the VS Code API boundary, so that the feature remains safe to refactor.

## Implementation Decisions

- Preserve the existing editor tool category and keep it enabled by default in this fork.
- Preserve all existing editor primitive tool names and input compatibility.
- Add optional `kind` support to the existing highlight primitive.
- Add optional `kind` support to the existing inline callout primitive.
- Add a new gutter marker primitive for temporary marker decorations anchored to lines or ranges.
- Add a new guided explanation comment primitive for longer anchored explanations using the VS Code Comments API.
- Do not add a separate overview-ruler primitive in the first pass.
- Include overview-ruler styling in kinded highlight and gutter marker decoration types where practical.
- Treat `kind` as semantic intent rather than a direct styling contract.
- Support the following annotation kinds: `focus`, `related`, `previous`, `question`, `warning`, and `info`.
- Default highlight and inline callout kind should preserve current behavior conceptually, with `focus` as the default visual intent.
- Default guided explanation comment kind should be suitable for neutral teaching notes, with `info` as the default visual intent unless a caller specifies otherwise.
- Keep annotation ids as the lifecycle grouping mechanism.
- Keep `current` as the default annotation id.
- Keep `replace` as the default mode for set operations.
- Preserve additive behavior for multi-location explanations.
- For existing highlight and inline callout tools, replacement should remain scoped to the surface being set, so setting a highlight does not implicitly remove comments or callouts for the same id.
- Clearing annotations should operate across every temporary annotation surface that matches the requested id, path, or global clear.
- Path omission should continue to use active-editor fallback where sensible.
- Missing active editor errors should remain clear and actionable.
- All paths should remain workspace-relative and validated through the shared path-safety rules.
- All ranges should continue to use the same MCP-facing coordinate convention.
- Gutter marker inputs should support one or more line numbers for the common same-file case.
- Gutter marker inputs should also support one or more ranges for consistency with other annotation tools and multi-file use cases.
- Gutter marker labels should be short and used as marker title or hover context where supported.
- Gutter marker icons should be chosen internally from fixed bundled or generated assets; callers should not pass arbitrary icon paths.
- Anchored explanation comments should be clearly branded as guided explanations.
- Anchored explanation comments should be created as temporary read-only explanation threads, not persistent review artifacts.
- Anchored explanation comments should render markdown as untrusted content.
- Anchored explanation comments should not enable replies by default.
- Anchored explanation comments should not introduce review actions, resolve actions, or persistent state.
- The annotation service should own decoration type creation, decoration application, comment controller creation, comment thread tracking, clearing, and disposal.
- Decoration types should be cached or managed by surface and kind so the service can apply multiple kinds without recreating unnecessary resources.
- Annotation state should store enough per-entry information to reapply visible-editor decorations when editors become visible or visibility changes.
- MCP tool handlers should validate input, call editor services, and format JSON results only.
- The existing clear primitive result shape should remain backward compatible where practical, while it may include additional counts or metadata if useful.
- Server stop and editor category disable should dispose all temporary annotation resources.
- The local guided explanation skill and dogfood demo can be updated after the primitives land, but this PRD does not require a new high-level guided workflow.

## Testing Decisions

- Tests should assert observable behavior and VS Code API interactions, not exact rendered pixels or colors.
- Tests should cover that existing highlight calls still work without a `kind` argument.
- Tests should cover that existing inline callout calls still work without a `kind` argument.
- Tests should cover that kinded highlights use the appropriate decoration family or decoration options.
- Tests should cover that kinded inline callouts use the appropriate decoration family or decoration options.
- Tests should cover that highlight and gutter marker decoration options include overview-ruler intent where applicable.
- Tests should cover that gutter markers can be set from one or more line numbers.
- Tests should cover that gutter markers can be set from one or more ranges.
- Tests should cover that gutter markers support replace mode.
- Tests should cover that gutter markers support add mode.
- Tests should cover that gutter markers preserve cursor and selection state.
- Tests should cover that explanation comments create comment threads through the VS Code Comments API.
- Tests should cover that explanation comments use guided-explanation naming and read-only/no-reply behavior.
- Tests should cover that explanation comments render markdown safely as untrusted markdown.
- Tests should cover explanation comment replace behavior.
- Tests should cover explanation comment add behavior.
- Tests should cover clear-by-id for highlights, inline callouts, gutter markers, overview markers, and explanation comments.
- Tests should cover clear-by-path for highlights, inline callouts, gutter markers, overview markers, and explanation comments.
- Tests should cover global clear for highlights, inline callouts, gutter markers, overview markers, and explanation comments.
- Tests should cover that clearing one id preserves other ids.
- Tests should cover that clearing one path preserves annotations for other paths.
- Tests should cover disposal of all decoration types, comment threads, comment controllers, and annotation state.
- Tests should cover disposal when the MCP server stops.
- Tests should cover disposal when the editor tool category is disabled.
- Tests should cover tool registration includes the new editor tools only when the editor category is enabled.
- Tests should cover workspace-relative path safety through the existing location behavior.
- Tests should cover active-editor fallback for new primitives.
- Tests should cover clear failures or no-op behavior remains understandable when targets do not exist.
- Tests should use the current mocked VS Code API style already present in the codebase.
- Tests should prefer public service methods and MCP tool handlers over private implementation details.
- Tests should not assert exact theme color names unless needed to prove a decoration option was wired.
- Tests should not assert exact gutter icon pixels or SVG contents.
- Tests should not rely on real VS Code rendering of comments or decorations.

## Out of Scope

- A webview, side panel, custom walkthrough panel, or custom presentation UI.
- Persistent guided explanation state.
- Persistent review comments or comments saved to project files.
- Source-code edits as part of visual annotation behavior.
- A monolithic presentation or slideshow tool.
- Turn-based lifecycle management inside the extension.
- Arbitrary custom colors, CSS, icon paths, or user-provided image assets from MCP inputs.
- A separate overview-ruler-only primitive in the first pass.
- Multi-root workspace behavior beyond the project’s existing workspace assumptions.
- Pixel-perfect styling guarantees across themes.
- A complete agent prompt rewrite or high-level guided exploration workflow.
- Persistent exploration memory, knowledge graphs, diagrams, or generated notes.
- Comment reply workflows, resolve workflows, or review approval workflows.

## Further Notes

This PRD intentionally deepens the visual annotation vocabulary without changing the product shape from primitives to presentation framework. The extension should provide small, composable editor surfaces; agent skills can decide how to sequence them during a walkthrough.

The most important UX distinction is that comments are guided explanation anchors, not code review artifacts. Naming, author labels, thread labels, and disabled replies should reinforce that distinction.

The most important API distinction is that `id` and `kind` solve different problems. `id` controls lifecycle and grouping. `kind` controls visual meaning. Agents should be able to use the same id with different kinds over time, and should use separate ids when they need independent cleanup.

The most important implementation distinction is that overview-ruler support should fall out of kinded decoration styles first. If future usage proves that agents need explicit overview-ruler-only markers, that can be added later without blocking this pass.
