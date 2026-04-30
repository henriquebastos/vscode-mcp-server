# Stricter TypeScript Adoption PRD

## Problem Statement

The repo already has `strict: true`, but additional TypeScript checks would catch useful issues and make future refactors safer:

- `noUncheckedIndexedAccess`
- `exactOptionalPropertyTypes`
- `noImplicitReturns`
- `noFallthroughCasesInSwitch`

Exploratory checks show these flags currently reveal real issues, but also cause test churn. This PRD should be implemented after the config, workspace boundary, and input-normalization refactors when possible.

## Decisions

- Prefer safety and explicitness over backward compatibility.
- Do not enable `skipLibCheck: false` yet; dependency declarations currently block it.
- Avoid large formatting-only churn.
- Fix production code first, then tests.
- Keep behavior changes out of scope unless a type finding exposes a real bug.

## Scope

### In scope

- Enable `noUncheckedIndexedAccess`.
- Enable `noImplicitReturns`.
- Enable `noFallthroughCasesInSwitch`.
- Try `exactOptionalPropertyTypes`; enable it if churn is reasonable.
- Consider `noUnusedParameters` only if low-churn.
- Add small test helpers to reduce repetitive non-null assertions.
- Optionally add a small number of high-value type-aware ESLint rules.

### Out of scope

- `skipLibCheck: false`.
- Large style rewrites.
- Product behavior changes.
- Durable state.
- Multi-root support.

## Known Findings From Exploratory Checks

### `noUncheckedIndexedAccess`

Command:

```bash
npx tsc -p ./ --noEmit --noUncheckedIndexedAccess
```

Known production findings included:

- `src/editor/diff-service.ts`: indexed string access in glob conversion can be `undefined`.
- `src/editor/navigation-service.ts`: `definitions[0]` can be `undefined` to the type checker.
- Multiple `workspaceFolders[0]` accesses in older tools can be `undefined` even after checking `workspaceFolders` exists.

### `exactOptionalPropertyTypes`

Command:

```bash
npx tsc -p ./ --noEmit --exactOptionalPropertyTypes
```

Common pattern to fix:

```ts
return { path: input.path, uri: input.uri };
```

Prefer omitting absent optional fields:

```ts
const target: AnnotationTargetInput = {};
if (input.path) {
  target.path = input.path;
}
if (input.uri) {
  target.uri = input.uri;
}
return target;
```

The better long-term fix is using discriminated unions from the input-normalization PRD.

### `skipLibCheck: false`

Command:

```bash
npx tsc -p ./ --noEmit --skipLibCheck false
```

This currently fails in dependency declarations from the MCP SDK. Do not enable this flag in this PRD.

## Implementation Slices

### Slice 1 — Enable and fix `noUncheckedIndexedAccess`

- Run the exploratory command.
- Fix production findings with explicit guards.
- Fix test findings with helpers instead of broad `!` assertions where practical.

Suggested test helper:

```ts
export function assertDefined<T>(value: T | undefined, message?: string): T {
  assert.ok(value, message ?? 'Expected value to be defined');
  return value;
}
```

Then enable in `tsconfig.json`.

### Slice 2 — Enable return/switch checks

Run:

```bash
npx tsc -p ./ --noEmit --noImplicitReturns --noFallthroughCasesInSwitch
```

Fix findings and enable:

```jsonc
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true
```

### Slice 3 — Try `exactOptionalPropertyTypes`

Run:

```bash
npx tsc -p ./ --noEmit --exactOptionalPropertyTypes
```

If production and test churn is reasonable:

- omit undefined optional fields;
- improve optional output builders;
- prefer discriminated unions where prior PRDs introduced them;
- enable the flag.

If churn is too broad, leave a short note in this PRD or create a follow-up issue/bean explaining the blockers.

### Slice 4 — Optional ESLint tightening

Consider adding only low-churn rules, such as:

- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-floating-promises`
- `@typescript-eslint/consistent-type-imports`

Do not add broad style rules during this PRD.

## Tests

No new product tests are required unless a stricter flag exposes behavior that is currently untested. Update existing tests for type-safe indexing and optional handling.

## Verification

Run after each flag is enabled:

```bash
npm run compile
npm run lint
npm test
```

Also run each exploratory `npx tsc ...` command before committing a flag.

## Acceptance Criteria

- `noUncheckedIndexedAccess` is enabled and passing.
- `noImplicitReturns` is enabled and passing.
- `noFallthroughCasesInSwitch` is enabled and passing.
- `exactOptionalPropertyTypes` is either enabled and passing or explicitly deferred with blockers documented.
- `skipLibCheck` remains enabled unless the dependency issue is separately resolved.
- Full verification passes.

## New Session Prompt

Implement this PRD in `/Users/henrique/me/oss/vscode-mcp-server`. Start with `noUncheckedIndexedAccess`, then `noImplicitReturns` and `noFallthroughCasesInSwitch`, then try `exactOptionalPropertyTypes`. Fix production first, tests second. Do not enable `skipLibCheck: false`. Keep changes focused on type safety, avoid behavior changes, and run `npm run compile`, `npm run lint`, and `npm test`.
