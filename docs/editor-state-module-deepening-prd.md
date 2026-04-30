# Editor State Module Deepening PRD

## Problem Statement

The guided editor modules have strong domain names and useful public interfaces, but several implementation files have grown into broad orchestration modules:

- `src/editor/annotation-service.ts` owns annotation state, decoration rendering, CodeLens provider state, comment threads, Markdown sanitization, gutter icon creation, clear semantics, and disposal.
- `src/editor/diff-service.ts` owns URI parsing, Git integration, folder enumeration, filter matching, diff entry normalization, VS Code command invocation, and diff registry state.
- `src/tools/editor-tools.ts` maps many MCP schemas and handlers in one large file.

The public service interfaces are worth preserving. The implementation should be deepened so pure state and normalization logic are isolated from VS Code adapters and MCP handlers.

## Decisions

- Keep public MCP tool names stable unless there is a strong reason to simplify.
- Keep temporary editor, diff, annotation, and feedback state memory-only.
- Keep native VS Code surfaces.
- Do not add webviews, side panels, or durable storage.
- Single-workspace behavior remains intentional.
- Product behavior should remain unchanged.

## Scope

### In scope

- Split annotation storage semantics from VS Code rendering.
- Split diff request/entry normalization from VS Code command invocation.
- Move in-memory diff registry to its own module if useful.
- Optionally convert feedback lifecycle transitions to a pure reducer.
- Add focused pure tests for extracted modules.
- Keep existing public service methods as wrappers where needed.

### Out of scope

- New MCP tools.
- Changing public tool names.
- Durable state.
- Multi-root support.
- Product behavior changes.
- Large formatting-only rewrites.

## Proposed Design

### Annotation architecture

Keep the public service shape:

```ts
class EditorAnnotationService {
  setHighlights(...)
  setInlineCallout(...)
  setGutterMarkers(...)
  setHoverNote(...)
  setCodeLensNote(...)
  setExplanationComment(...)
  clearAnnotations(...)
  dispose()
}
```

Internally split into:

```ts
class AnnotationStore {
  setSurfaceEntries(...): AnnotationOperationResult;
  clear(filter: AnnotationClearFilter): ClearAnnotationsResult;
  entries(): AnnotationEntry[];
  entriesForUri(uri: string): AnnotationEntry[];
}

class VsCodeAnnotationRenderer {
  apply(store: AnnotationStore): void;
  dispose(): void;
}
```

The exact names can differ. The invariant is that `replace` vs `add`, clear-by-id/path/URI/all, and unrelated-group preservation are testable without VS Code decoration mocks.

### Diff architecture

Keep the public service shape:

```ts
class EditorDiffService {
  openDiff(input: OpenDiffInput): Promise<OpenDiffResult>;
  getDiff(...);
  listDiffs(...);
  findEntryForUri(...);
}
```

Internally split into:

```ts
class DiffNormalizer {
  normalize(request: DiffRequest): Promise<NormalizedCommandEntry[]>;
}

class DiffRegistry {
  add(result: OpenDiffResult): DiffId;
  get(diffId: DiffId): StoredDiff | undefined;
  list(): StoredDiff[];
  findEntryForUri(uri: vscode.Uri): DiffEntryMatch | undefined;
}
```

The registry remains in memory only.

### Feedback architecture

Optionally extract lifecycle transitions into a pure reducer:

```ts
type FeedbackEvent =
  | { type: 'add'; item: FeedbackItem }
  | { type: 'finish' }
  | { type: 'cancel' }
  | { type: 'drain' }
  | { type: 'clear'; scope: FeedbackClearScope };

function feedbackReducer(state: FeedbackSession, event: FeedbackEvent): FeedbackSession;
```

`FeedbackCaptureService` can remain responsible for VS Code editor selection capture and temporary markers.

## Implementation Slices

### Slice 1 — Annotation store

Extract only state and clear semantics first.

Cover with pure tests:

- add mode appends entries;
- replace mode replaces only the relevant surface for that ID;
- clear by ID removes all surfaces for that ID;
- clear by URI removes matching URI entries;
- clear by path removes matching path entries;
- global clear removes everything;
- clearing one group preserves unrelated groups.

Keep `EditorAnnotationService` public methods unchanged.

### Slice 2 — Annotation renderer

Move VS Code decoration grouping and application out of the service:

- highlight application;
- inline callout application;
- gutter marker application;
- hover note application;
- visible editor reapplication.

Keep CodeLens and comment-thread adapters either in this renderer or in dedicated small adapters.

### Slice 3 — Diff normalizer

Extract pure or mostly pure logic for:

- source vs explicit entry normalization;
- filter matching;
- max-file guard;
- folder entry pairing;
- Git change orientation;
- one-sided entry handling.

Add focused tests for filter and orientation behavior.

### Slice 4 — Diff registry

Move the `diffs` map and diff ID generation out of `EditorDiffService`.

Keep behavior memory-only:

- registry is created with the editor diff service;
- registry is cleared on service disposal;
- `findEntryForUri(...)` continues to support editor context and feedback metadata.

### Slice 5 — Feedback lifecycle reducer

If time permits, extract the lifecycle state transitions from `FeedbackCaptureService`.

Test illegal transitions:

- finish empty session;
- add after ready;
- drain non-ready;
- clear with scoped mismatch;
- cancel clears marker-worthy items.

## Tests

Add new focused tests such as:

- `src/test/editor-annotation-store.test.ts`
- `src/test/editor-diff-normalizer.test.ts`
- `src/test/editor-feedback-state.test.ts`

Existing mocked VS Code tests should remain as integration-level protection and continue passing.

## Verification

Run:

```bash
npm run compile
npm run lint
npm test
```

## Acceptance Criteria

- Public MCP tool behavior is unchanged.
- Annotation state semantics are covered by pure tests.
- Diff normalization, filter, and orientation behavior are covered outside the VS Code command boundary.
- Feedback lifecycle illegal states are harder to express or covered by pure reducer tests.
- `annotation-service.ts` and `diff-service.ts` are materially smaller or have clearly delegated responsibilities.
- Full verification passes.

## New Session Prompt

Implement this PRD in `/Users/henrique/me/oss/vscode-mcp-server`. Decisions: keep temporary state memory-only, keep native VS Code surfaces, first workspace only, no durable persistence, no product behavior changes. Extract annotation state into a pure store, split VS Code annotation rendering/adapters, extract diff normalization and registry, optionally extract feedback lifecycle reducer, add focused pure tests, preserve public service/tool behavior, and run `npm run compile`, `npm run lint`, and `npm test`.
