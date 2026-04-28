# Implementation workflow

This workflow turns one selected PRD in `docs/` into verified implementation work.

This repo uses **PRDs for product intent** and **beans for execution state**. It does not use story files or a worklog.

## Required skills

Before planning or implementing PRD work, load and follow:

- `beans` — source of truth for bean CLI syntax, claiming, dependencies, parent/child relationships, and closure commands.
- `tdd` — source of truth for red → green → refactor, behavior-focused tests, and vertical tracer bullets.

Before running inspection, load and follow `inspecting-5p` if that inspection path is being used.

Do not proceed from memory if the relevant skill has not been loaded in the current session.

## Core principles

1. **The PRD is the product contract.**
   - PRDs describe intended behavior, scope, out-of-scope boundaries, and testing decisions.
   - PRDs are not implementation transcripts.

2. **Beans are the execution ledger.**
   - Implementation slices, bugs, review findings, dependencies, deferrals, and closure evidence live in beans.
   - Chat is coordination, not durable state.
   - This repo does not use a worklog.

3. **TDD is the implementation loop.**
   - One behavior-focused RED test.
   - Minimal GREEN implementation.
   - Refactor only while green.
   - Do not batch unrelated behaviors into one red/green pass.

4. **Prefer vertical slices.**
   - A slice should deliver one narrow observable behavior through the relevant layers.
   - Avoid horizontal tasks like “write all tests” or “implement all config.”

5. **Keep the tool/API surface composable.**
   - For this project, prefer small, reusable editor primitives over monolithic guided-exploration workflows.

## Bean model

Use one root bean for the selected PRD.

If the local bean type set has a `prd` type, use it. Otherwise use the available root type, usually `epic`, but refer to it in planning and close reasons as the **PRD root bean**.

Do not introduce a story layer for this repo.

```text
PRD root bean
├── Vertical slice task bean
├── Vertical slice task bean
│   └── Smaller slice task bean, only if needed
├── Bug bean from implementation or inspection
└── Refactor/docs/test task bean from accepted review finding
```

Rules:

- Every implementation task, bug, review finding, dependency, and follow-up created for a PRD must remain a descendant of the PRD root bean.
- Dependencies between beans must be explicit via bean dependencies, not implied by ordering in a markdown file.
- A ready bean is open, unclaimed, has no open blockers, and has no open child beans.
- A claimed bean belongs to one active agent. Other agents should not edit for it.
- A closed bean is done and has verification evidence in the close reason.

## Lean bean body

Do not over-prescribe bean bodies. A bean needs enough context for a fresh agent to continue safely, not a full implementation transcript.

Use this shape when creating implementation or finding beans:

```md
Refs:
PRD section, user story number, design decision, or inspection source.

Outcome:
The observable behavior this bean delivers or fixes.

Next RED:
The first behavior test to add, including the expected failure.

Scope:
Likely modules/files and important out-of-scope boundaries.

Verify:
Targeted command(s), plus any final gate if needed.

Stop:
Ambiguities or conditions that require asking instead of guessing.
```

Guidelines:

- Do not duplicate dependency lists in the body; use bean dependencies.
- Do not script every GREEN and REFACTOR step in advance. Let the TDD cycle respond to the RED result.
- If a bean starts to contain multiple independent behaviors, split it before editing.
- For inspection findings, use `Refs` for the inspection source and `Outcome` for the corrected behavior.

## PRD boundaries

Treat PRDs in `docs/` as reusable product specs.

After implementation begins, edit a PRD only when:

- the accepted behavior changes;
- the PRD is wrong or misleading;
- implementation proves the scope is ambiguous;
- the user explicitly asks to revise the product contract.

Do not edit a PRD to record:

- RED/GREEN history;
- current status;
- implementation order;
- inspection findings;
- command logs;
- commit lists;
- cleanup tasks.

Those belong in beans. Commit hashes belong in bean close reasons when commits exist.

## Phase A — Turn a PRD into ready beans

Input: one selected PRD.

Goal: create enough bean state that a fresh agent can pick any ready bean under the PRD root and know what to do.

Steps:

1. Load `beans` and `tdd`.
2. Read the selected PRD.
3. Create or find the PRD root bean.
4. Identify vertical behavior slices from the PRD’s user stories, implementation decisions, and testing decisions.
5. Create one self-contained bean per slice.
6. Add bean dependencies where order matters.
7. Stop planning when each ready bean is independently handoffable.

For the guided editor primitives PRD, natural slice candidates are:

- editor tool category registration and default config;
- shared workspace path/range utilities;
- editor context serialization;
- reveal range without selection mutation;
- multi-range highlights by annotation id;
- visible inline callouts by annotation id;
- clear annotations by id/path/all;
- definition navigation that returns the resulting location.

## Phase B — Implement one ready bean with TDD

Input: one ready, unclaimed bean under the active PRD root.

Goal: close the bean with verified work.

Loop:

1. Pick the highest-value ready unclaimed bean under the PRD root.
2. Claim it.
3. Load and follow `tdd`.
4. State the current RED target in chat for coordination.
5. Write exactly one behavior-focused test for the next vertical behavior.
6. Run the smallest useful verification command and confirm the test fails for the expected reason.
7. Implement the simplest solution that makes that test pass.
8. Run the same command and confirm green.
9. Refactor while green if the code is not yet clear, simple, or easy to change.
10. Repeat the red → green → refactor loop only if the bean still has another tightly coupled behavior.
11. If the next behavior is independent, split or create another bean instead of continuing inside the same bean.
12. Run the bean’s verification command(s).
13. Close the bean with a concise reason including what changed and what verification passed.

For this VS Code extension, prefer tests that assert observable behavior and VS Code API interactions through public service/tool interfaces.

Good tests for this repo include:

- tool registration and config gating;
- path and range conversion behavior;
- active-editor fallback and clear failures when no active editor exists;
- decoration application/clearing calls;
- cursor and selection preservation;
- definition navigation behavior and returned location.

Do not test pixel-perfect rendering, exact colors, or VS Code internals.

## Verification commands

Use the narrowest reliable command during TDD, then run the relevant full gate before closing a significant slice.

Common commands:

```bash
npm run compile
npm run lint
npm test
```

Notes:

- `npm test` runs the project test command; the package also has `pretest` wired to compile and lint.
- Use targeted tests where practical, but do not invent brittle test commands.
- Run `npm run package` only for release/package validation, not normal bean closure.

## Commit policy

Default: do not commit unless the user has explicitly chosen an autonomous commit workflow for the session.

If not committing:

- close beans with verification evidence;
- mention that changes are uncommitted if relevant;
- leave the user’s commit workflow untouched.

If autonomous commit mode is explicitly active:

- commit only a coherent bean or tightly coupled bean group;
- use a semantic, why-focused commit message;
- include relevant bean id(s) in the commit message when practical;
- close beans with the commit hash and verification summary.

## Phase C — Inspection

Input: a coherent verified diff for the active PRD.

Goal: turn concrete review feedback into beans, not chat-only notes or ad hoc fixes.

Steps:

1. Load `inspecting-5p` if using the 5-pass inspection flow.
2. Run inspection on the coherent diff.
3. Treat inspection as triage. Do not edit production code, tests, or docs while still collecting findings.
4. Deduplicate and reject speculative findings.
5. Create beans only for concrete accepted findings that require separate work.
6. Add dependencies if one finding must be fixed before another.
7. Return to Phase B for remediation.

Create beans for:

- correctness bugs;
- broken PRD acceptance behavior;
- security or safety issues;
- missing meaningful behavior tests;
- maintainability refactors needed to keep the feature understandable.

Do not create beans for:

- duplicate findings;
- broad speculative architecture advice;
- style issues already handled by linting;
- vague preferences with no clear closure condition;
- findings already covered by existing tests and behavior.

Inspection remediation rules:

- Correctness, regression, safety, and user-visible findings start with a RED regression test.
- Missing-coverage findings start with a behavior test. If it is already green, record that in the bean closure and avoid production edits unless another RED target appears.
- Refactor-only findings start from a named preservation target and a green characterization command. Refactor while green, then rerun the same command.
- Docs/process-only findings may use markdown or link validation instead of a code RED test, but must not be bundled with behavior changes.

Keep inspection bounded:

- Run one full inspection pass for a coherent diff.
- After remediation, run the smallest useful re-check.
- Do not enter endless inspection loops; further full rounds require user approval.

## Phase D — Driver loop

```text
PRD selected
→ create/find PRD root bean
→ create vertical slice beans
→ pick ready bean
→ claim bean
→ implement with TDD
→ verify and close bean
→ inspect coherent diff
→ accepted findings become beans
→ return to ready bean selection
→ repeat until PRD is complete or blocked
```

Decision rules after each closed bean:

- If ready beans exist under the PRD root, pick the highest-value unclaimed ready bean.
- If no ready beans exist but blocked beans remain, report the blockers and stop unless the blocker is resolvable by the agent.
- If no ready or blocked beans remain, run the appropriate inspection or completion verification.
- If inspection creates accepted finding beans, return to Phase B.
- If inspection creates no accepted finding beans and verification passes, the PRD implementation loop is complete.

## Completion condition

A PRD implementation is complete when all are true:

- all required implementation beans under the PRD root are closed;
- all accepted inspection finding beans are closed or explicitly deferred;
- no ready or blocked beans remain under the PRD root;
- required verification commands for the touched surface passed;
- the PRD acceptance criteria are satisfied;
- the PRD was not used as a progress log;
- no worklog/bookkeeping step remains.

At completion, report:

- the PRD root bean id;
- closed/deferred bean summary;
- verification commands run;
- remaining risks or explicit deferrals;
- commit hash(es), only if commits were made.
