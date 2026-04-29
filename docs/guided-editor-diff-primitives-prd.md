# Guided Editor Diff Primitives PRD

## Problem Statement

The guided editor primitives can reveal, inspect, highlight, call out, comment on, and clear annotations in ordinary source editors. They are useful for explaining static code, but they do not yet let an agent guide a user through a diff panel.

This is a major gap for review and implementation work. A user often wants to compare a branch with the working tree, two commits, a commit with `HEAD`, two files, or two folders, then ask the agent to explain the change in the editor where the diff is already visible. Without first-class diff primitives, the agent has to describe changes in chat or open individual files manually, losing the context and ergonomics of VS Code's built-in diff UI.

The current annotation targeting model is also path-oriented. That works for workspace files, but diff panels may contain VS Code Git virtual documents, one-sided added/deleted entries, generated in-memory blank sides, or arbitrary URI-backed documents. A guided explanation agent needs to annotate the left or right side of an open diff without editing source files, creating review comments, or building a custom webview.

The goal is to add a low-level, composable diff-opening primitive and make the existing annotation primitives diff-aware, while preserving the current design principles: use VS Code's native editor surfaces, keep MCP handlers thin, avoid persistent state, avoid custom side panels, avoid source edits, and keep the public tool surface small.

## Solution

Add a URI-first diff primitive that opens VS Code's native multi-file changes editor from either two high-level source URIs or explicit file-pair entries.

The primary new tool is `open_diff_code`.

The tool should support two modes:

- Source mode: compare `leftUri` with `rightUri`.
- Explicit entry mode: compare a caller-provided list of entries, where each entry has an optional label, optional `leftUri`, and optional `rightUri`.

A URI describes what to compare. It should not require separate public `kind`, `ref`, or `status` fields. Git refs should be encoded in source URIs, and added/deleted files should be represented by missing sides rather than explicit statuses.

The first-pass source URI model should support:

- `file:` URIs for workspace files and folders in the current working tree.
- `git+file:` source URIs for workspace files and folders at a Git ref, using a `ref` query parameter.
- VS Code `git:` document URIs where the caller already has an exact Git-backed file document URI.

The implementation should normalize every accepted comparison into file entries with optional left and right document URIs, then open those entries using VS Code's native `vscode.changes` command. For Git-backed documents, the implementation should reuse the built-in Git extension API, especially its `toGitUri` behavior, instead of inventing a custom Git virtual-document provider.

Folder and tree comparisons should be supported by enumerating changed files and passing explicit entries to VS Code. VS Code's ordinary `vscode.diff` command should not be treated as a folder-diff primitive; a spike showed that passing folders to `vscode.diff` opens a text diff and fails because the resources are directories.

Added and deleted files should be represented with one missing side. A spike showed that `vscode.changes` accepts one-sided entries and renders them by creating internal blank in-memory sides. Therefore the public API should not expose a `status` field or a custom empty-document URI scheme.

The tool should return a `diffId`, title, and normalized entries. The returned entries should include the exact left and right document URIs that annotations can target later. The extension should keep a temporary in-memory registry of opened diff entries because VS Code's public tab input metadata does not fully report one-sided entries.

Adjust existing annotation primitives so they can target document URIs in addition to workspace-relative paths. Existing path-based behavior should continue to work unchanged. New URI targeting should allow an agent to annotate either side of an open diff panel using the URIs returned by `open_diff_code` or the URI of the active diff editor.

The existing editor context primitive should also report document URIs, and when possible, associate visible editors and active selections with the diff entry and side from the diff registry. This gives agents enough information to answer user questions about selected diff text and place follow-up annotations in the correct side of the diff.

## User Stories

1. As a developer reviewing a change, I want an agent to open a diff between my working tree and `main`, so that I can review the change in VS Code's native diff UI.
2. As a developer reviewing a change, I want an agent to open a diff between my working tree and any branch, so that I can compare local edits against the intended base.
3. As a developer reviewing a change, I want an agent to open a diff between two commits, so that I can understand what changed between historical points.
4. As a developer reviewing a change, I want an agent to open a diff between a commit and `HEAD`, so that I can review everything introduced since that commit.
5. As a developer reviewing a change, I want an agent to open a diff between two files, so that I can compare alternatives without leaving the editor.
6. As a developer reviewing a change, I want an agent to open a diff between two folders, so that I can compare generated output, refactors, or copied code trees.
7. As a developer reviewing a change, I want an agent to open a diff for a subfolder inside a branch or commit comparison, so that I can focus on the relevant area of a large change.
8. As a developer reviewing a change, I want multi-file diffs to appear in VS Code's native stacked changes editor, so that the UI matches my existing review workflow.
9. As a developer reviewing a change, I want single-file and multi-file comparisons to use one mental model, so that I do not have to learn separate tools for each case.
10. As a developer reviewing a change, I want added files to appear naturally in the diff panel, so that I can review new code without a synthetic placeholder concept.
11. As a developer reviewing a change, I want deleted files to appear naturally in the diff panel, so that I can review removals without a synthetic placeholder concept.
12. As a developer reviewing a change, I want renamed files from Git comparisons to be included in the diff entries, so that review coverage does not miss moved code.
13. As a developer reviewing a change, I want the agent to avoid asking me to provide change statuses manually, so that the diff tool stays focused on resources to compare.
14. As a developer reviewing a change, I want the agent to accept URI inputs, so that files, folders, branches, commits, and explicit file pairs can share one composable shape.
15. As a developer reviewing a change, I want Git refs to be encoded in URIs instead of separate fields, so that tool calls stay compact and URI-oriented.
16. As a developer reviewing a change, I want the agent to reuse VS Code's Git document support, so that Git-backed diff sides behave like native VS Code Git diffs.
17. As a developer reviewing a change, I want the agent to avoid custom Git virtual paths unless necessary, so that the implementation stays aligned with VS Code.
18. As a developer reviewing a change, I want the agent to open explicit custom file-pair diffs, so that it can compare curated review sets that do not come from a single Git range.
19. As a developer reviewing a change, I want include filters, so that large diffs can be narrowed to relevant files.
20. As a developer reviewing a change, I want exclude filters, so that generated files, vendored files, or noisy paths can be omitted.
21. As a developer reviewing a change, I want a maximum file count guard, so that accidental huge diffs do not overwhelm the editor.
22. As a developer reviewing a change, I want clear errors when a diff is too large, so that I can refine the request instead of waiting on a bad UI state.
23. As a developer reviewing a change, I want clear errors when a Git ref does not exist, so that I know the comparison input is wrong.
24. As a developer reviewing a change, I want clear errors when the Git extension is disabled or unavailable, so that I understand why a Git comparison cannot open.
25. As a developer reviewing a change, I want clear errors when a URI is outside the allowed workspace or repository scope, so that tool safety remains predictable.
26. As a developer reviewing a change, I want the diff tool to return a stable temporary diff id, so that later annotation calls can refer back to the opened diff state if needed.
27. As a developer reviewing a change, I want the diff tool to return the normalized entries it opened, so that the agent can cite and annotate the exact left and right document URIs.
28. As a developer reviewing a change, I want the agent to annotate the right side of a diff, so that it can explain newly added or modified code in place.
29. As a developer reviewing a change, I want the agent to annotate the left side of a diff, so that it can explain removed or replaced behavior in place.
30. As a developer reviewing a change, I want the agent to annotate both sides of a diff, so that it can connect old behavior to new behavior visually.
31. As a developer reviewing a change, I want highlights to work in diff panels, so that the agent can mark the exact changed span being discussed.
32. As a developer reviewing a change, I want gutter markers to work in diff panels, so that the agent can mark changed lines or review steps compactly.
33. As a developer reviewing a change, I want hover notes to work in diff panels, so that the agent can attach optional detail without adding chat noise.
34. As a developer reviewing a change, I want inline callouts to work in diff panels where VS Code supports decorations, so that short explanations can appear beside changed code.
35. As a developer reviewing a change, I want guided explanation comments to work in diff panels where VS Code supports comment threads, so that longer explanations can be anchored to the changed code.
36. As a developer reviewing a change, I want annotation clearing to work by URI, so that a diff-side annotation can be removed without requiring a workspace path.
37. As a developer reviewing a change, I want annotation clearing to keep working by id, so that a walkthrough step can be cleared across all files and diff sides.
38. As a developer reviewing a change, I want annotation clearing to keep working globally, so that ending a review removes all temporary guided UI.
39. As a developer reviewing a change, I want existing path-based annotation calls to keep working, so that normal source walkthroughs are not disrupted.
40. As a developer reviewing a change, I want pathless annotation calls to target the active diff side when my cursor is in a diff panel, so that follow-up questions stay low-friction.
41. As a developer reviewing a change, I want the editor context tool to include active editor URIs, so that the agent can understand whether I am looking at a workspace file, a Git snapshot, or a diff side.
42. As a developer reviewing a change, I want the editor context tool to include selected text from diff panes, so that I can ask questions about a selected changed range.
43. As a developer reviewing a change, I want visible editor context to identify diff entries when possible, so that the agent can reason about left and right sides accurately.
44. As a developer reviewing a change, I want the agent to preserve my cursor and selection when opening or annotating a diff, so that I stay in control of the editor.
45. As a developer reviewing a change, I want the agent to avoid editing source files while explaining a diff, so that review annotations remain presentation-only.
46. As a developer reviewing a change, I want the agent to avoid creating diagnostics for diff notes, so that explanation does not pollute the Problems panel.
47. As a developer reviewing a change, I want the agent to avoid creating persistent review comments, so that guided explanation remains temporary.
48. As a developer reviewing a change, I want the agent to avoid a custom webview for diffs, so that I can use VS Code's existing diff controls and settings.
49. As a developer reviewing a change, I want the agent to avoid proposed VS Code APIs when stable commands are sufficient, so that the feature remains maintainable.
50. As an agent author, I want one URI-first diff tool, so that I can compare files, folders, commits, and branches without branching on separate tool names.
51. As an agent author, I want explicit entry mode, so that I can open a custom set of file pairs when I already know the resources to compare.
52. As an agent author, I want source mode, so that I can ask the extension to enumerate changed files from two high-level sources.
53. As an agent author, I want the tool result to include exact document URIs, so that follow-up annotations do not need to reconstruct VS Code Git URIs.
54. As an agent author, I want URI-targeted annotations, so that I can annotate documents that do not have workspace-relative paths.
55. As an agent author, I want active-editor fallback to work for diff documents, so that conversational follow-ups can annotate the current diff side.
56. As an agent author, I want no public `status` field, so that callers describe comparisons rather than classify changes.
57. As an agent author, I want no public empty-document URI scheme, so that added and deleted files are represented by missing sides only.
58. As an extension maintainer, I want a deep diff service behind the MCP handler, so that URI resolution, Git integration, entry normalization, and command invocation are testable without MCP transport complexity.
59. As an extension maintainer, I want a temporary diff registry, so that one-sided entries and annotation targets do not depend on incomplete VS Code tab metadata.
60. As an extension maintainer, I want annotation state keyed by document URI internally, so that workspace files, Git documents, and diff panes share the same lifecycle model.
61. As an extension maintainer, I want workspace path targeting to be layered over URI targeting, so that old path-based APIs remain compatible while diff support deepens the model.
62. As an extension maintainer, I want safety checks centralized in URI resolution, so that each tool does not need to reimplement repository and workspace boundaries.
63. As an extension maintainer, I want tests to mock VS Code command calls and Git APIs, so that behavior is verified without relying on pixel rendering or live repositories.
64. As an extension maintainer, I want the feature to dispose temporary diff and annotation state with the editor service, so that stale state does not leak across sessions.

## Implementation Decisions

- Add a single URI-first diff-opening primitive named `open_diff_code`.
- Support source mode with `leftUri` and `rightUri`.
- Support explicit entry mode with an `entries` array.
- Require callers to use exactly one mode: source mode or explicit entry mode.
- In explicit entry mode, each entry should accept an optional label, optional `leftUri`, and optional `rightUri`.
- Reject explicit entries where both sides are missing.
- Do not add a public `status`, `kind`, or `ref` field to diff entries.
- Do not add a public custom empty-document URI scheme.
- Represent added files as entries with only a right side.
- Represent deleted files as entries with only a left side.
- Let VS Code render one-sided entries through the native changes editor.
- Use `vscode.changes` as the default open mechanism for normalized diff entries.
- Treat single-file comparisons as a special case only if doing so does not weaken the diff registry or annotation behavior.
- Preserve VS Code's native diff UI instead of building a custom webview, side panel, or review surface.
- Add a diff service that owns source URI parsing, validation, entry normalization, Git integration, folder enumeration, and opening the VS Code changes editor.
- Add a temporary diff registry that maps a generated `diffId` to the title and normalized entries opened by the service.
- The diff registry should store entries exactly as opened, including one-sided entries, because VS Code tab input metadata may not report one-sided entries completely.
- The diff registry should be in memory only and disposed with the editor services or extension lifecycle.
- Use `file:` source URIs for workspace files and folders in the current working tree.
- Restrict direct `file:` URI access to the repository/workspace safety model already used by editor tools unless a future PRD explicitly broadens filesystem scope.
- Use `git+file:` source URIs for Git snapshots of workspace files and folders.
- Require `git+file:` source URIs to include a Git ref in the URI query.
- Resolve `git+file:` file documents to VS Code Git document URIs using the built-in Git extension API.
- Resolve `git+file:` folder or tree sources by asking Git for the changed file list, then producing per-file VS Code Git document URIs.
- Reuse the built-in Git extension API rather than implementing a custom Git virtual document provider in the first pass.
- Fail clearly when the built-in Git extension is unavailable, disabled, or cannot provide the repository needed for a Git comparison.
- Accept already-resolved VS Code `git:` document URIs in explicit entry mode for exact file document comparisons.
- Do not require callers to hand-author VS Code `git:` URIs for high-level Git comparisons.
- For folder-to-folder working-tree comparisons, enumerate descendant files on both sides, pair by relative path, and include only changed, added, or deleted entries.
- For Git comparisons, use repository diff capabilities to enumerate changed paths instead of recursively reading entire Git trees when possible.
- Support include and exclude filters during entry normalization.
- Support a max-file guard before opening the diff editor.
- Return a structured result containing the `diffId`, title, count, and normalized entries with labels and exact left/right document URIs.
- Keep MCP handlers thin: validate input shape, call the diff service, and return JSON.
- Extend annotation target resolution from path-first to URI-first internally.
- Preserve existing path-based annotation inputs and behavior.
- Add optional URI targeting to annotation set and clear operations.
- Treat `path` and `uri` as mutually exclusive ways to identify the same target.
- Allow per-range annotation targets to specify a URI where per-range path targeting exists today.
- When no path or URI is provided, continue to use the active editor fallback.
- If the active editor is a diff side, pathless annotation should target that document URI even if it has no workspace-relative path.
- Internally key annotation state by document URI rather than only by workspace-relative path.
- Map workspace-relative paths to file document URIs as a compatibility layer.
- Continue to support clearing annotations by id, by path, and globally.
- Add clearing by URI for diff-side and virtual-document annotations.
- Ensure clear-by-id works across workspace files, Git documents, and diff-side document URIs.
- Ensure clear-all removes diff-aware annotations along with existing temporary annotation surfaces.
- Preserve existing annotation kinds, modes, and visual behavior.
- Do not create source edits, diagnostics, Problems panel entries, or persistent review comments for diff annotations.
- Extend editor context output to include document URI for active and visible editors.
- Extend editor context output to include workspace-relative path only when the document URI maps safely to the workspace.
- When a visible editor URI matches an open diff registry entry, include best-effort diff metadata such as `diffId`, entry label or index, and side.
- Continue to include selected text using the existing opt-in behavior, including selections from diff panes.
- Avoid proposed VS Code APIs in the first pass.
- Do not depend on VS Code's proposed multi-diff tab input API for core behavior.
- Treat VS Code command behavior as an API boundary protected by tests and defensive error handling.

## Testing Decisions

- Tests should assert observable behavior and VS Code API interactions, not exact diff UI pixels.
- Tests should cover registration of the new diff tool in the editor tool category.
- Tests should cover input validation for source mode versus explicit entry mode.
- Tests should cover rejection of explicit entries with neither side.
- Tests should cover that no public status field is required to open modified, added, or deleted entries.
- Tests should cover that one-sided entries are passed to `vscode.changes` with the missing side omitted.
- Tests should cover that no custom empty-document URI provider is required for one-sided entries in the first pass.
- Tests should cover that `vscode.changes` is invoked with the expected title and normalized triples.
- Tests should cover that the diff service returns a `diffId` and stores normalized entries in the registry.
- Tests should cover that the registry stores one-sided entries even when VS Code tab metadata would be incomplete.
- Tests should cover that `file:` source URIs resolve to workspace file or folder entries under the existing safety model.
- Tests should cover that unsafe `file:` URIs are rejected.
- Tests should cover that `git+file:` URIs require a ref.
- Tests should cover that `git+file:` file sources use the built-in Git API to produce VS Code Git document URIs.
- Tests should cover that `git+file:` folder/tree sources use Git diff capabilities to enumerate changed paths.
- Tests should cover clear errors when the Git extension is unavailable or disabled.
- Tests should cover clear errors when a requested Git repository cannot be found.
- Tests should cover two-file comparisons.
- Tests should cover two-folder comparisons with modified, added, and deleted files.
- Tests should cover Git ref versus working tree comparisons.
- Tests should cover Git ref versus Git ref comparisons.
- Tests should cover Git ref versus `HEAD` comparisons.
- Tests should cover subfolder/path filtering within Git comparisons.
- Tests should cover include filters.
- Tests should cover exclude filters.
- Tests should cover max-file guard behavior before opening a diff.
- Tests should cover explicit entry mode with workspace file URIs.
- Tests should cover explicit entry mode with VS Code Git document URIs.
- Tests should cover explicit entry mode with one side missing.
- Tests should cover that existing annotation tools still work with path targets.
- Tests should cover that annotation tools can target explicit document URIs.
- Tests should cover that per-range annotation targets can use document URIs where per-range path targeting exists today.
- Tests should cover that path and URI target inputs are mutually exclusive where appropriate.
- Tests should cover active-editor fallback for ordinary workspace files.
- Tests should cover active-editor fallback for Git or diff-side document URIs.
- Tests should cover clear-by-URI for highlights.
- Tests should cover clear-by-URI for inline callouts.
- Tests should cover clear-by-URI for gutter markers.
- Tests should cover clear-by-URI for hover notes.
- Tests should cover clear-by-URI for guided explanation comments where supported by VS Code comments.
- Tests should cover that clear-by-id removes annotations across path and URI targets.
- Tests should cover that global clear removes diff-aware annotations and existing annotation surfaces.
- Tests should cover that annotation state is keyed by document URI internally while preserving path compatibility.
- Tests should cover that editor context includes document URIs for active and visible editors.
- Tests should cover that editor context includes workspace-relative paths only when safe and available.
- Tests should cover that editor context associates visible diff-side editors with the diff registry when possible.
- Tests should cover selected-text reporting from diff-side editors using the existing opt-in context behavior.
- Tests should cover disposal of the diff registry and URI-targeted annotation state.
- Tests should use mocked VS Code APIs and mocked Git extension APIs where possible.
- Tests should avoid relying on actual rendered diff pixels, theme styling, or user settings.
- Tests should prefer public service methods and tool handlers over private implementation details.
- Tests should include a small extension-host smoke test only if mocked tests cannot protect a VS Code command boundary.

## Out of Scope

- A custom diff webview or side panel.
- Replacing VS Code's native diff editor.
- Persistent review state or persistent diff sessions.
- Source edits, patch application, accept/reject hunk actions, or automated conflict resolution.
- Git write operations such as checkout, branch creation, commit, reset, stash, or apply.
- A custom Git virtual document provider in the first pass.
- A public custom empty-document URI scheme.
- A public explicit change status field.
- Proposed VS Code multi-diff APIs as a dependency for core behavior.
- Pixel-perfect rendering guarantees for diff decorations.
- Folder comparison outside the existing workspace/repository safety model.
- Binary file diff rendering beyond what VS Code already supports.
- Notebook diff support.
- A full code review workflow with persistent comments, replies, resolve states, or approvals.
- Automatic semantic summarization of diffs.
- Hunk-level patch parsing as a required first-pass primitive.
- A separate `list_diff_entries_code` tool unless implementation or usage proves that opening and listing need to be split.
- A separate diff annotation tool family; existing annotation tools should become URI-capable instead.

## Further Notes

Spike findings that informed this PRD:

- `vscode.changes` can open a multi-file changes editor from explicit file triples.
- `vscode.changes` can open entries backed by custom virtual text document providers.
- `vscode.changes` exposes visible left and right diff panes through normal visible text editors, which means existing decoration and comment APIs can target those documents.
- VS Code's built-in Git extension API can create `git:` document URIs for a file at a ref, and those URIs work in `vscode.changes`.
- `vscode.changes` accepts one-sided added/deleted entries and renders missing sides with internal blank in-memory documents.
- VS Code tab input metadata may omit one-sided entries even when they are visible, so the extension should keep its own diff registry.
- Passing folder URIs to `vscode.diff` is not a viable folder-diff primitive; folder and tree comparisons need to be enumerated into file entries first.

This PRD intentionally keeps the public API focused on resources rather than classifications. A caller describes what to compare using URIs. The extension normalizes those resources into entries. VS Code renders the diff semantics. Existing annotation primitives then target the exact document URIs returned by the diff tool.

The desired long-term experience is that a user can say, “show me this branch vs main,” select a changed range in the native diff panel, ask “why did this change?”, and have the agent highlight, comment, or hover-note the relevant diff-side code without leaving VS Code's normal editor surfaces.
