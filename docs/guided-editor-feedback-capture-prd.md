# Guided Editor Feedback Capture PRD

## Problem Statement

The guided editor and diff primitives let an agent open native VS Code diffs, understand active diff-side context, annotate precise ranges, and clear temporary explanation state. They are useful when the agent is actively driving the interaction, but they do not yet give the developer a low-friction way to leave several pieces of review feedback directly from VS Code while staying in the editor.

A developer reviewing a diff often wants to select a span, leave a short note, select another span, leave another note, and only then ask the agent to organize and act on the whole batch. Today that requires switching back to chat after each selection, describing the selected text manually, or relying on the agent to poll editor context at the right moment. This interrupts review flow and makes feedback capture feel like a chat workflow rather than a native editor workflow.

The top-right editor title toolbar is the right surface for this interaction. VS Code already presents lightweight editor actions there, and the feedback workflow should feel similarly native: select text, click an icon or press a keybinding, type feedback, repeat, then finish the batch.

The feature should preserve the current design principles of the guided editor work: use native VS Code editor surfaces, keep feedback temporary until the agent acts, avoid source edits, avoid persistent review comments, avoid diagnostics, avoid custom diff webviews, keep MCP handlers thin, and keep durable execution state in the agent/task workflow rather than hidden editor state.

## Solution

Add a guided feedback capture workflow to the VS Code MCP extension.

The extension should contribute editor title toolbar actions and command-palette commands for:

- adding feedback for the current editor selection;
- finishing the current feedback session;
- cancelling or clearing the current feedback session.

When the user selects text and invokes Add Feedback, VS Code should open a text input. After submission, the extension should store a structured feedback item in an in-memory session and add a temporary visual marker or Guided Explanation-style comment so the user can see the feedback was captured.

A feedback item should capture the exact editor target at the time of submission:

- document URI;
- safe workspace-relative path when available;
- selected range;
- selected text, subject to size limits;
- user feedback text;
- language id and basic editor metadata;
- best-effort diff metadata when the selected document matches an opened diff registry entry, including diff id, entry label or index, and side.

The user can repeat Add Feedback multiple times. The extension keeps a draft session with a visible count and lightweight editor markers. When the user invokes Finish Feedback, the session becomes ready for the agent. The agent can then call MCP feedback tools to read or drain the ready batch, organize related feedback, ask clarifying questions if needed, and then act.

The primary MCP tools should be low-level and composable:

- `get_feedback_code` returns the active feedback session without clearing it.
- `drain_feedback_code` returns the ready feedback session and marks it drained or clears it, depending on the chosen lifecycle.
- `clear_feedback_code` cancels or clears draft/ready feedback state.

The user-facing experience should be:

1. Select text in a source editor or diff pane.
2. Click Add Feedback in the editor title toolbar, or use a configured keybinding.
3. Type a note and submit.
4. Repeat for as many spans as needed.
5. Click Finish Feedback.
6. Tell the agent they are done, or let the agent poll when appropriate.
7. The agent retrieves the structured batch, groups feedback by file and theme, asks questions only where needed, and acts.

## User Stories

1. As a developer reviewing a diff, I want to select changed text and click an Add Feedback icon, so that I can leave feedback without leaving VS Code.
2. As a developer reviewing a diff, I want Add Feedback to work on the right side of a diff, so that I can comment on newly added or changed code.
3. As a developer reviewing a diff, I want Add Feedback to work on the left side of a diff, so that I can comment on removed or replaced behavior.
4. As a developer reviewing a source file, I want Add Feedback to work outside diff panels, so that I can use the same workflow during ordinary code review.
5. As a developer reviewing a change, I want feedback capture to store the selected range, so that the agent can act on the exact span I meant.
6. As a developer reviewing a change, I want feedback capture to store selected text, so that the agent can understand the context even if the editor moves later.
7. As a developer reviewing a change, I want selected text capture to have a size limit, so that accidental huge selections do not flood the agent.
8. As a developer reviewing a change, I want feedback capture to store the document URI, so that virtual Git/diff documents remain targetable.
9. As a developer reviewing a change, I want feedback capture to store a workspace path when safely available, so that agent summaries can use readable file references.
10. As a developer reviewing a diff, I want feedback capture to store diff side metadata, so that the agent knows whether I commented on old or new code.
11. As a developer reviewing a diff, I want feedback capture to store the diff entry label or index, so that related feedback can be grouped by changed file.
12. As a developer reviewing a change, I want a text box to appear when I add feedback, so that I can type the note immediately.
13. As a developer reviewing a change, I want submitting the text box to add one feedback item, so that repeated feedback is fast and predictable.
14. As a developer reviewing a change, I want dismissing the text box to add nothing, so that accidental invocations are harmless.
15. As a developer reviewing a change, I want to leave multiple feedback items in one session, so that I can complete my review before the agent responds.
16. As a developer reviewing a change, I want a Finish Feedback icon, so that I can explicitly tell the extension the batch is ready for the agent.
17. As a developer reviewing a change, I want a Cancel Feedback icon, so that I can abandon a draft session if I change my mind.
18. As a developer reviewing a change, I want Cancel Feedback to confirm before deleting multiple items, so that I do not accidentally lose a review batch.
19. As a developer reviewing a change, I want a visible count of captured feedback, so that I know how many items are in the current batch.
20. As a developer reviewing a change, I want captured feedback to be visibly marked in the editor, so that I can see which spans I already commented on.
21. As a developer reviewing a change, I want feedback markers to be temporary, so that they do not become persistent review comments or source changes.
22. As a developer reviewing a change, I want feedback markers to be clearable with the feedback session, so that the editor returns to a clean state.
23. As a developer reviewing a change, I want Add Feedback to fail clearly when there is no selection, so that I know what to do next.
24. As a developer reviewing a change, I want Add Feedback to reject unsupported or unsafe editor documents, so that accidental sensitive virtual documents are not exposed.
25. As a developer reviewing a change, I want Add Feedback to work even if the selected document has no workspace path, so long as it is a safe diff-side document.
26. As a developer reviewing a change, I want the feedback input to accept short notes quickly, so that capture does not interrupt review flow.
27. As a developer reviewing a change, I want the feedback input to support reasonably long notes, so that nuanced feedback is possible.
28. As a developer reviewing a change, I want feedback capture to avoid editing source files, so that notes remain review intent rather than code changes.
29. As a developer reviewing a change, I want feedback capture to avoid diagnostics, so that my notes do not pollute the Problems panel.
30. As a developer reviewing a change, I want feedback capture to avoid persistent review comments, so that temporary agent collaboration does not create repository state.
31. As a developer reviewing a change, I want feedback toolbar icons in the editor title area, so that the workflow is discoverable near the diff controls.
32. As a developer reviewing a change, I want keyboard shortcuts to be possible, so that I can capture feedback without moving to the mouse.
33. As a developer reviewing a change, I want command-palette access to the same actions, so that I can use the workflow without memorizing shortcuts.
34. As a developer reviewing a change, I want Finish Feedback to leave the batch available to the agent, so that my comments are not lost before retrieval.
35. As a developer reviewing a change, I want feedback state to survive editor focus changes during the session, so that I can comment across multiple files.
36. As a developer reviewing a change, I want feedback state to be scoped to the extension session, so that stale feedback does not unexpectedly reappear later.
37. As a developer reviewing a change, I want the agent to retrieve the batch after I finish, so that I do not need to paste every comment into chat.
38. As a developer reviewing a change, I want the agent to organize feedback by file, diff side, and theme, so that the response is easier to review.
39. As a developer reviewing a change, I want the agent to ask clarifying questions only when needed, so that obvious comments turn directly into action.
40. As a developer reviewing a change, I want the agent to preserve the original feedback text, so that my intent is not lost during summarization.
41. As a developer reviewing a change, I want the agent to cite feedback ids, so that I can refer to a specific captured item in follow-up discussion.
42. As a developer reviewing a change, I want the agent to distinguish questions from requested edits when possible, so that it does not over-apply exploratory notes.
43. As a developer reviewing a change, I want the agent to be able to clear processed feedback, so that old batches do not get processed twice.
44. As a developer reviewing a change, I want the agent to be able to fetch but not clear feedback, so that I can preview what was captured.
45. As a developer reviewing a change, I want the agent to be able to drain ready feedback, so that processing is atomic and repeatable.
46. As a developer reviewing a change, I want finished feedback to remain visible until cleared or drained, so that I can confirm it was captured.
47. As a developer reviewing a change, I want captured feedback markers to use a consistent visual style, so that they are distinguishable from explanation highlights.
48. As a developer reviewing a change, I want feedback markers to avoid overwhelming the diff UI, so that code remains readable.
49. As a developer reviewing a change, I want feedback session state to be inspectable by MCP, so that agent workflows can poll or retrieve it explicitly.
50. As an agent user, I want to say “done” after finishing feedback in VS Code, so that the agent knows to call the feedback retrieval tool.
51. As an agent user, I want the extension to handle the native capture flow and the agent to handle interpretation, so that each side does what it is best at.
52. As an agent author, I want structured feedback items, so that I do not need to infer file/range/context from prose.
53. As an agent author, I want feedback item ids, so that I can report which comments I handled.
54. As an agent author, I want feedback session status, so that I can distinguish draft feedback from ready feedback.
55. As an agent author, I want feedback item timestamps, so that I can preserve review order when useful.
56. As an agent author, I want feedback item diff metadata when available, so that I can avoid confusing old and new code.
57. As an agent author, I want selected text truncation metadata, so that I know when context may be incomplete.
58. As an agent author, I want stable MCP tools for get, drain, and clear, so that feedback capture can be composed into higher-level workflows.
59. As an extension maintainer, I want feedback capture in a deep service module, so that UI command handling, storage, markers, and MCP serialization stay testable.
60. As an extension maintainer, I want toolbar command handlers to be thin, so that behavior is tested through the feedback service and MCP tools.
61. As an extension maintainer, I want feedback state in memory only for the first pass, so that the feature stays temporary and low-risk.
62. As an extension maintainer, I want feedback capture to reuse existing location, context, annotation, and diff-registry utilities where appropriate, so that targeting behavior stays consistent.
63. As an extension maintainer, I want feedback capture to use stable VS Code APIs, so that the feature remains maintainable.
64. As an extension maintainer, I want the editor title icons to use VS Code menu contributions, so that the UI feels native and can overflow gracefully.
65. As an extension maintainer, I want context keys for active feedback state, so that Finish and Cancel only appear when useful.
66. As an extension maintainer, I want tests for source editors and diff-side documents, so that the feature remains safe across both editor surfaces.
67. As an extension maintainer, I want tests for no-selection and unsafe-document cases, so that privacy and safety boundaries are explicit.
68. As an extension maintainer, I want lifecycle disposal tests, so that temporary feedback does not leak across MCP server restarts or extension deactivation.
69. As a reviewer, I want a captured-feedback summary to be easy for the agent to turn into tasks or edits, so that feedback collection leads to concrete progress.
70. As a reviewer, I want this workflow to avoid a custom webview, so that I can keep using VS Code's normal diff and editor controls.

## Implementation Decisions

- Add a guided feedback capture feature built around VS Code editor title toolbar commands.
- Contribute Add Feedback, Finish Feedback, and Cancel Feedback commands.
- Use codicon-based icons for the editor title toolbar.
- Also expose the commands through the command palette.
- Document optional keybindings rather than hardcoding global defaults in the first pass.
- Show Add Feedback when an editor can accept text selection feedback.
- Show Finish and Cancel only while a feedback session is active.
- Use VS Code context keys to control feedback toolbar visibility and session state.
- Add a feedback capture service that owns session state, item ids, range capture, selected-text limits, marker lifecycle, status transitions, and MCP serialization.
- Keep toolbar command handlers thin: read active editor selection, ask for feedback text, call the feedback service, and update context keys.
- Keep MCP handlers thin: call the feedback service and return structured JSON.
- Use one active feedback session in the first pass.
- Use in-memory state only in the first pass.
- Give each session a generated session id.
- Give each feedback item a generated item id.
- Store session status as draft, ready, drained, or cancelled.
- Store item creation order and timestamp.
- Store the submitted feedback text exactly as typed.
- Capture the active editor document URI for each item.
- Capture a safe workspace-relative path only when available.
- Capture the selected range using the existing editor coordinate convention.
- Capture selected text with a configurable maximum character count.
- Mark selected text as truncated when the size limit is hit.
- Capture language id and basic editor metadata where useful.
- Capture best-effort diff metadata from the existing diff registry when the selected document URI matches an opened diff entry.
- Treat left and right diff sides distinctly.
- Reject Add Feedback when there is no active editor.
- Reject Add Feedback when the active selection is empty.
- Reject or redact unsafe non-file virtual documents that are not known diff-side documents.
- Preserve support for workspace files, Git document URIs, and registered diff-side URIs.
- Use a native text input for the first pass.
- If native input proves too limiting for multiline feedback, consider a later QuickPick or custom input flow, but do not add a custom webview in the first pass.
- Add a temporary visual confirmation after feedback is submitted.
- Prefer reusing existing temporary annotation/comment mechanisms for feedback markers where practical.
- Feedback markers should be visually distinct from the current guided explanation focus.
- Feedback markers should not create diagnostics.
- Feedback markers should not create persistent code review comments.
- Feedback markers should not edit source files.
- Finish Feedback should mark the active session as ready.
- Finish Feedback should not automatically invoke an agent; the agent retrieves ready feedback through MCP.
- Cancel Feedback should clear draft feedback and associated markers.
- Cancel Feedback should confirm before discarding multiple captured items.
- Clear Feedback MCP behavior should be explicit about whether it clears draft, ready, or all sessions.
- Provide `get_feedback_code` to inspect feedback without mutating state.
- Provide `drain_feedback_code` to retrieve ready feedback and mark it consumed.
- Provide `clear_feedback_code` to cancel or clear feedback state.
- Consider `list_feedback_code` unnecessary in the first pass if only one active session exists.
- Include feedback counts and session status in MCP results.
- Include enough structured data that an agent can group by file, side, item type, and review order.
- Dispose feedback state and markers with the editor/MCP lifecycle.
- Avoid proposed VS Code APIs.
- Avoid a custom webview.
- Avoid persistent storage in the first pass.
- Avoid requiring Git operations or repository writes.
- Ensure the workflow works in native VS Code diff editors opened by the diff primitive.
- Ensure the workflow also works in ordinary source editors.
- Treat a ready feedback session as temporary handoff state, not as a durable issue tracker.

## Testing Decisions

- Tests should assert observable behavior and VS Code API interactions, not pixel-perfect toolbar rendering.
- Tests should cover command contribution metadata at the package/configuration level.
- Tests should cover Add Feedback command behavior with an active source editor selection.
- Tests should cover Add Feedback command behavior with an active diff-side document URI.
- Tests should cover no-active-editor failure.
- Tests should cover empty-selection failure.
- Tests should cover unsafe virtual document rejection or redaction.
- Tests should cover selected text truncation and truncation metadata.
- Tests should cover storing document URI, safe path, range, selected text, language id, and feedback text.
- Tests should cover storing diff metadata when the URI matches the diff registry.
- Tests should cover missing diff metadata when the URI does not match the registry but is otherwise safe.
- Tests should cover multiple feedback items in one session.
- Tests should cover preserving item order and ids.
- Tests should cover session status transitions from draft to ready to drained.
- Tests should cover Cancel Feedback clearing draft items and markers.
- Tests should cover confirmation behavior before cancelling multiple items where practical.
- Tests should cover `get_feedback_code` returning feedback without clearing it.
- Tests should cover `drain_feedback_code` returning ready feedback and preventing duplicate processing.
- Tests should cover `clear_feedback_code` clearing feedback state and markers.
- Tests should cover context key updates for active session and item count where practical.
- Tests should cover feedback marker creation and cleanup through VS Code API interactions.
- Tests should cover lifecycle disposal with the editor/MCP server lifecycle.
- Tests should prefer service-level tests for feedback state and command-level tests for VS Code command behavior.
- Tests should mock VS Code input boxes and command/context APIs rather than requiring human input.
- Tests should avoid relying on exact icon placement in the editor title toolbar because VS Code may move actions into overflow.
- Tests should reuse existing editor context, annotation, and diff-service test patterns as prior art.
- Tests should verify behavior through public service methods, command handlers, and MCP tool handlers rather than private implementation details.

## Out of Scope

- Persistent review comments, replies, resolve states, approvals, or code review workflows.
- Source edits as part of feedback capture.
- Patch application, accept/reject hunk actions, or automated remediation during capture.
- Diagnostics or Problems panel entries for feedback.
- A custom feedback webview in the first pass.
- Proposed VS Code APIs.
- Multi-user collaboration or shared feedback sessions.
- Durable feedback storage across VS Code restarts.
- Synchronizing feedback to GitHub, Jira, or another external tracker in the first pass.
- Automatically waking or controlling the agent after Finish Feedback unless a separate agent notification mechanism exists.
- Semantic classification of feedback with machine learning during capture.
- Rich threaded conversations inside VS Code.
- Notebook feedback capture.
- Binary file feedback capture.
- Pixel-perfect icon placement guarantees in the editor title toolbar.

## Further Notes

The desired long-term experience is that a reviewer can stay inside the native VS Code diff UI, select several exact spans, leave concise notes through toolbar actions, click Finish, and then ask the agent to process the batch. The agent receives structured feedback rather than a vague chat transcript and can respond with a clear plan, questions, or code changes.

This feature complements the guided editor diff primitives. The diff primitive opens native diffs and returns exact document URIs; feedback capture uses those URIs to preserve review intent. The annotation primitives provide temporary visual confirmation; feedback capture turns those interactions into a batch the agent can retrieve and act on.

Because MCP is request/response, Finish Feedback should mark the session ready but should not assume the agent has been notified. In normal usage, the user can say “done” after finishing, and the agent can call the feedback retrieval tool. Future integrations may add polling or event-based notification if the agent harness supports it.
