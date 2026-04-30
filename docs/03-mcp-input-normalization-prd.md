# MCP Input Normalization and Domain Type Tightening PRD

## Problem Statement

The MCP tool layer uses Zod schemas, but many schemas and internal types still allow illegal or ambiguous states. The code often represents distinct modes as optional fields on one object, then checks combinations at runtime.

Examples to inspect before implementing:

- `src/tools/editor-tools.ts` duplicates tool input interfaces and Zod schemas.
- `src/editor/diff-service.ts` represents source mode and explicit-entry mode as one optional-field interface.
- `src/editor/location-utils.ts` uses `{ path?: string; uri?: string }` instead of an explicit target union.
- `src/tools/symbol-tools.ts` contains production `any` usage.
- IDs such as annotation IDs, diff IDs, feedback session IDs, and feedback item IDs are all plain strings.

The desired shape is to normalize raw MCP inputs at the edge into explicit domain types, so service code operates on safe, resolved, discriminated objects.

## Decisions

- Backward compatibility with ambiguous or unsafe inputs is not required.
- Public MCP tools may reject ambiguous input more aggressively.
- Single-workspace behavior remains intentional.
- Temporary editor, diff, annotation, and feedback state remains memory-only.
- This PRD should not change product behavior except for clearer validation failures.

## Scope

### In scope

- Use `z.infer<typeof schema>` or equivalent to avoid duplicated tool input interfaces.
- Add schema-level validation for:
  - `path` xor `uri`;
  - diff source mode xor explicit entries mode;
  - explicit diff entries with at least one side;
  - positive line numbers;
  - bounded max values;
  - non-empty IDs, titles, and messages where needed.
- Normalize raw tool input into discriminated unions.
- Add branded IDs where IDs cross module boundaries:
  - `AnnotationId`
  - `DiffId`
  - `FeedbackSessionId`
  - `FeedbackItemId`
- Replace production `any` in symbol tools with `unknown` or explicit interfaces.
- Add a small helper for JSON text MCP responses if it reduces repetition.
- Prepare code for `exactOptionalPropertyTypes` by omitting optional properties instead of setting them to `undefined`.

### Out of scope

- Durable persistence.
- Multi-root workspace support.
- New MCP tools.
- Public behavior changes unrelated to validation.
- Enabling stricter TypeScript flags globally; that belongs in the stricter TypeScript PRD.

## Proposed Design

### Editor targets

Replace raw target shapes like:

```ts
{ path?: string; uri?: string }
```

with an internal discriminated union:

```ts
type EditorTarget =
  | { kind: 'activeEditor' }
  | { kind: 'workspacePath'; path: WorkspacePath }
  | { kind: 'documentUri'; uri: vscode.Uri };
```

The MCP layer can still accept omitted path/URI where active-editor fallback is intended, but the service layer should receive an explicit target mode.

### Diff requests

Replace optional-field diff input with a normalized internal union:

```ts
type DiffRequest =
  | {
      mode: 'source';
      title: string;
      leftUri: SourceUri;
      rightUri: SourceUri;
      include: string[];
      exclude: string[];
      maxFiles?: number;
    }
  | {
      mode: 'entries';
      title: string;
      entries: NonEmptyArray<ExplicitDiffEntry>;
      include: string[];
      exclude: string[];
      maxFiles?: number;
    };
```

Raw MCP input should be parsed and normalized before diff normalization/opening begins.

### Feedback lifecycle

Use the existing `FeedbackSessionStatus` union as the basis for a stronger state shape:

```ts
type FeedbackSession =
  | { status: 'empty' }
  | { status: 'draft'; id: FeedbackSessionId; items: FeedbackItem[] }
  | { status: 'ready'; id: FeedbackSessionId; items: NonEmptyArray<FeedbackItem> }
  | { status: 'drained'; id: FeedbackSessionId }
  | { status: 'cancelled'; id: FeedbackSessionId };
```

This can be introduced incrementally. The main goal is to make impossible lifecycle states harder to construct.

### Branded IDs

Introduce minimal branded ID helpers, for example:

```ts
type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type DiffId = Brand<string, 'DiffId'>;
export type AnnotationId = Brand<string, 'AnnotationId'>;
export type FeedbackSessionId = Brand<string, 'FeedbackSessionId'>;
export type FeedbackItemId = Brand<string, 'FeedbackItemId'>;
```

Avoid over-engineering. Brand IDs that cross modules or are easy to mix up.

## Implementation Slices

### Slice 1 — Shared schemas

Create reusable schemas for common primitives:

```ts
const nonEmptyString = z.string().trim().min(1);
const positiveLine = z.number().int().positive();
const zeroBasedCharacter = z.number().int().min(0);
const annotationModeSchema = z.enum(['replace', 'add']);
const annotationKindSchema = z.enum(['focus', 'related', 'previous', 'question', 'warning', 'info']);
```

Use these from editor tools and any other tool schema that accepts line/range data.

### Slice 2 — Path/URI XOR schema

Create a schema helper for target inputs:

```ts
const targetSchema = z.object({
  path: z.string().optional(),
  uri: z.string().optional()
}).superRefine((value, ctx) => {
  if (value.path && value.uri) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide either path or uri, not both.'
    });
  }
});
```

Normalize successful values into `EditorTarget`.

### Slice 3 — Diff schema

Reject at the tool edge:

- neither source nor entries;
- both source and entries;
- only one source URI;
- empty entries;
- explicit entry with neither side.

Keep one-sided explicit entries valid.

### Slice 4 — Remove duplicated tool interfaces

In `src/tools/editor-tools.ts`, replace manually duplicated interfaces like:

```ts
interface SetHighlightToolInput { ... }
```

with schema-derived types or inferred callback shapes. This keeps runtime validation and TypeScript surfaces aligned.

### Slice 5 — Branded IDs

Add branded ID types and constructors. Use them at least for diff registry, annotation groups, and feedback session/item IDs.

### Slice 6 — Remove production `any` from symbol tools

Replace:

- `processHoverContent(content: any)` with `unknown` and type guards.
- `children?: any[]` with `childrenCount?: number` or a named symbol type.
- `flatSymbols: any[]` with `SerializedDocumentSymbol[]`.

## Tests

Add or update tests for:

- path and URI together rejected;
- invalid annotation kind rejected;
- invalid line numbers rejected;
- source/entries ambiguity rejected at the tool layer;
- empty diff entries rejected;
- one-sided explicit diff entries accepted;
- non-empty string validation for IDs/titles/messages where introduced;
- symbol hover content conversion without `any`.

## Verification

Run:

```bash
npm run compile
npm run lint
npm test
```

Optional exploratory check after implementation:

```bash
npx tsc -p ./ --noEmit --exactOptionalPropertyTypes
```

The optional check does not need to pass in this PRD unless explicitly expanded.

## Acceptance Criteria

- MCP schemas reject ambiguous target and diff modes before service calls.
- `src/tools/editor-tools.ts` no longer duplicates large input interfaces separately from schemas.
- Internal code uses discriminated unions for editor target and diff request shapes.
- IDs that cross module boundaries are branded or centrally constructed.
- Production `symbol-tools.ts` no longer uses `any`.
- Full verification passes.

## New Session Prompt

Implement this PRD in `/Users/henrique/me/oss/vscode-mcp-server`. Decisions: no backward compatibility for ambiguous or unsafe inputs, first workspace only, memory-only temporary state. Add stronger Zod schemas, normalize raw tool input into discriminated unions, remove duplicated tool interfaces where possible via `z.infer`, add branded IDs for diff/annotation/feedback IDs, remove production `any` in symbol tools, add schema/unit tests, and run `npm run compile`, `npm run lint`, and `npm test`.
