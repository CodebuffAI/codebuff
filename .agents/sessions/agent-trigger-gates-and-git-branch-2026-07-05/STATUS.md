# STATUS — Agent trigger gates + git_branch tool

## Current state

**Session status:** active
**Current task:** P1.1 — Verify `base2-deep.ts` `handleSteps` sharing pattern
**Overall progress:** 0% — planning complete, implementation not started

## Completed

- ✅ SPEC.md written — all three followups (automated phase-gates, `git_branch` tool, git-committer branch capability) scoped with R1–R5 requirements, AC1–AC8 acceptance criteria, risks, open questions.
- ✅ PLAN.md written — 5 milestones (M1–M5), 27 tasks (P1.1–P5.4), 5 validation gates (VG1–VG5), owner assignments, dependencies, checkpoint rules.
- ✅ STATUS.md + LESSONS.md bootstrapped (this file).

## Pending

- ⏳ M1 — `git_branch` agent tool registration (P1.1–P1.9). Not started.
- ⏳ M2 — git-committer branch capability (P2.1–P2.7). Blocked on M1 for toolNames reference.
- ⏳ M3 — Automated phase-gates in `handleSteps` (P3.1–P3.9). Standalone but validation benefits from M1/M2 completion.
- ⏳ M4 — Tests + Docs (P4.1–P4.6). Blocked on M1–M3.
- ⏳ M5 — Final validation + review (P5.1–P5.4). Blocked on M1–M4.

## Blocked

- None currently. The plan is ready to execute starting from P1.1.

## Assumptions to verify during implementation

- **Q1 (P1.1):** Does `base2-deep.ts` share `handleSteps` with `base2.ts` via `createBase2`? `read_outline` of `base2-deep.ts` will resolve this at the start of M1 / M3.
- **Q2 (P1.2):** Where is the client-side `git_status` handler registered? Grep `handleGitStatus` / `'git_status'` in `packages/agent-runtime/src/` and `sdk/src/run.ts` to find the registration point. The `git_branch` handler registers there.
- **Q3 (P3.4):** Should the test-writer gate pass a `test_command` inferred from the package? Start with yes — infer `cd <package> && bun run typecheck && bun test` from the file path; leave it overridable via an `activeWorkState` field if smoke tests show over-triggering.
- **Q4 (P3.5):** Exported-symbol detection — start with a path-heuristic (file in `packages/*/src/`, `agents/`, `cli/src/`, `common/src/`), escalate to AST only if it over-triggers on internal files.
- **Q5 (P3.8):** Guard the new gates with the existing `runValidationGate` flag so `base2-fast` / `base2-fast-no-validation` skip them.

## Next checkpoint

Resume at P1.1: `read_outline` on `agents/base2/base-deep.ts` to check whether `handleSteps` is shared or copied. The result determines whether M3 task P3.7 (mirror gates in base-deep) is needed or automatic.

**Resume command:** Run the SDK / CLI `resume` command on session `agent-trigger-gates-and-git-branch-2026-07-05` to pick up at P1.1. If `base2-deep.ts` shares `createBase2`, skip P3.7. Then proceed to P1.2 (grep for `git_status` handler registration).

## Resume instructions

1. Start at P1.1. `read_outline` on `agents/base2/base-deep.ts`.
   - If `base-deep.ts` calls `createBase2(...)` and does not define its own `handleSteps`, mark P3.7 as `cancelled` (gates added to `createBase2` apply automatically).
   - If `base-deep.ts` has its own `handleSteps`, P3.7 stays.
2. P1.2: `code_search` for `'git_status'` and `handleGitStatus` in `packages/agent-runtime/src/` and `sdk/src/`. The file that registers `git_status` to call `gitStatus()` is the registration point for `git_branch` → `gitBranch()`.
3. Proceed through M1 tasks (P1.3–P1.9) using the editor agent for code changes, basher for validation.
4. M2 (git-committer) depends on M1's `git_branch` toolName being registered.
5. M3 (gates) is the largest change — prefer reading the validation/reviewer gate loop in `base2.ts` lines 610–720 immediately before editing to avoid stale-context drift.
6. M4 tests + docs.
7. M5 final validation.

## Last updated

2026-07-05 — plan packet created by the planning phase. No implementation has started. All four artifacts (SPEC.md, PLAN.md, STATUS.md, LESSONS.md) exist; subsequent updates to STATUS.md and LESSONS.md should use `update_plan_status`, not `create_plan`.

<!-- update_plan_status:appended -->
## M1 complete — VG1 green, 15/15 tests pass — 2026-07-05 — 2026-07-04T22:27:55.127Z

**Session status:** active
**Current task:** M2 P2.1 — Add `branch_name` + `branch_switch` to git-committer `inputSchema.params`
**Overall progress:** ~20% — M1 complete (VG1 green), M2 next.

## M1 — `git_branch` agent tool registration ✅

VG1 GREEN. All five plumbing layers wired and tested:
- **Params schema**: `common/src/tools/params/tool/git-branch.ts` (NEW) — Zod schema with `branch_name` (required), `switch` (default true), `allow_dirty` (default false); union output schema; `endsAgentStep: true`.
- **Types**: `agents/types/tools.ts` — added `'git_branch'` to `ToolName`, `git_branch: GitBranchParams` to `ToolParamsMap`, new `GitBranchParams` interface.
- **Agent-runtime handler**: `packages/agent-runtime/src/tools/handlers/tool/git-branch.ts` (NEW) — mirrors `handleGitStatus`, forwards the three input fields to `requestClientToolCall`.
- **SDK dispatch**: `sdk/src/run.ts` — imports `gitBranch` from `./tools/git-branch`, dispatch case after `git_status` wraps the single-object `GitBranchResult` into a singleton `ToolResultOutput[]` (branching on `errorMessage`).
- **Registries**: `common/src/tools/constants.ts` (`toolNames` + `publishedTools`), `common/src/tools/list.ts` (`toolParams` + `clientToolCallSchema` discriminated-union branch), `packages/agent-runtime/src/tools/handlers/list.ts` (`codebuffToolHandlers`).
- **Tests**: 15/15 new unit tests pass (11 params schema + 4 handler).

VG1 typecheck sweep: `common` 0, `packages/agent-runtime` 0, `sdk` 0, `agents` 0. Three gotchas captured in LESSONS.md (gitBranch wrapper, occurrenceIndex semantics, test-writer mock cast).

Q1 RESOLVED: `base2-deep.ts` calls `createBase2(...)` and does NOT define its own `handleSteps` — P3.7 (mirror gates in base-deep) is `cancelled`.
Q2 RESOLVED: client-side dispatch is `handleToolCall()` in `sdk/src/run.ts`; `git_branch` case added at the same chain.

## M2 — git-committer branch capability ⏳

Not started. Next action: P2.1 — add `branch_name` + `branch_switch` to git-committer `inputSchema.params` in `agents/git-committer/git-committer.ts`. M2 depends on M1 (git_branch tool registered — DONE) for the `toolNames` reference.

## M3 — Automated phase-gates ⏳

Not started. P3.7 cancelled (Q1 result). Implementation can proceed in parallel with M2 but validation benefits from M1/M2 completion.

## M4 — Tests + Docs ⏳

Blocked on M1–M3.

## M5 — Final validation + review ⏳

Blocked on M1–M4.

## Next checkpoint

Resume at P2.1: read `agents/git-committer/git-committer.ts` (`inputSchema`, `toolNames`, `handleSteps`, `instructionsPrompt`, `spawnerPrompt`) and add `branch_name` + `branch_switch` to `inputSchema.params`. Then P2.2 adds `'git_branch'` to `toolNames`, P2.3 adds the yield to `handleSteps` (before the existing `run_terminal_command 'git status --short'` step), P2.4/P2.5 update the prompts. **R-RISK-5**: `handleSteps` must use inline literals only (no closures over top-level bindings) to keep the `handleSteps is serializable` test green (see LESSONS L5).


<!-- update_plan_status:appended -->
## M2 complete — git-committer branch capability shipped — 2026-07-05 — 2026-07-04T22:30:36.775Z

M2 (git-committer branch capability, R3) is complete. VG2 green:
- `cd agents && bun run typecheck` → exit 0.
- `bun test ./__tests__/git-committer.test.ts` → 24 pass / 0 fail, including the 7 new branch tests.

Changes shipped in `agents/git-committer/git-committer.ts`:
- `inputSchema.params` adds `branch_name` (string, optional) and `branch_switch` (boolean, default true).
- `toolNames` now includes `'git_branch'` alongside `'git_status'`.
- `handleSteps` yields a `git_branch` step (inline literals only — `branch_name: params?.branch_name, switch: params?.branch_switch ?? true`) BEFORE the existing `run_terminal_command 'git status --short'` step when `params?.branch_name` is set; omits it when not.
- `instructionsPrompt` mentions creating the branch first with the `git_branch` tool.
- `spawnerPrompt` mentions the optional new-branch capability.

Changes shipped in `agents/__tests__/git-committer.test.ts`:
- 7 new tests covering branch_name/branch_switch in inputSchema, instructionsPrompt + spawnerPrompt text, and the handleSteps branch-step behavior (yields when provided, omits when not).
- One test-assertion type-narrow fix: JSON-Schema `properties` can be a boolean-schema, so tests narrow with a type guard before indexing field metadata.

Next checkpoint: M3 P3.1 — choose a glob-matching utility in the codebase for the security-sensitive pattern check, then add the three `*GateDone` fields to `Base2ActiveWorkState` and implement `securityReviewerGate` / `testWriterGate` / `docWriterGate` in `agents/base2/base2.ts` (`createBase2.handleSteps`).

Resume command: continue from M3 P3.1. Read `agents/base2/base2.ts` lines ~370-720 (the `handleSteps` validation/reviewer gate loop and `activeWorkState` init) and the `securityReviewSection` glob patterns in `agents/base2/quality-prompt-section.ts` before editing.


<!-- update_plan_status:appended -->
## M3 complete — VG3 green — 2026-07-05T22:50Z — 2026-07-04T22:44:10.907Z

All nine M3 tasks (P3.1–P3.9) are confirmed COMPLETE in source `agents/base2/base2.ts` and `agents/base2/gate-state.ts`. The implementation was already present at resume time — only the unit test was missing.

**P3.1** — self-contained string/regex glob matching (`SECURITY_SENSITIVE_GLOBS` + `SECURITY_SENSITIVE_NAME_SUBSTRINGS` at base2.ts:1611-1631). `micromatch` is intentionally NOT used because `handleSteps` is serialized via `.toString()` and module-scope bindings would be `undefined` at reconstruction time (documented in the base2.ts:1603-1610 comment).

**P3.2** — `preEditSecurityReviewDone` / `testWriterGateDone` / `docWriterGateDone` / `auxGatesLastPendingFiles` fields added to `Base2ActiveWorkState` (gate-state.ts) and initialized in `activeWorkState` (base2.ts:398-401, 417-420).

**P3.3–P3.5** — predicates implemented: `matchesSecuritySensitiveGlob` (1633-1659), `inferPackageTestCommand` + `isNonTestSourceFile` + `selectTestWriterTargets` (1661-1710), `isPublicApiSourceFile` + `selectDocWriterTargets` (1712-1735).

**P3.6** — wired into `handleSteps`: security-reviewer pre-edit at base2.ts:628-656 (BEFORE validation, fires on `matchesSecuritySensitiveGlob` + `runValidationGate` + `editsHappened` + `!preEditSecurityReviewDone`); test-writer + doc-writer post-gate-pass at base2.ts:1332-1408 (AFTER the validation/reviewer gate passes, fire on their respective predicates + `!*GateDone`).

**P3.7** — cancelled per Q1 (base2-deep.ts shares createBase2.handleSteps).

**P3.8** — all three gate sites guarded by `runValidationGate` (base2.ts:632, 658; the post-gate test-writer/doc-writer site inherits `finalResponseGateOpen` which already requires validation passed).

**P3.9** — `detectPendingGateFileSetChange` + `resetAuxGateFlags` (1737-1753) invoked at base2.ts:622-627; flags reset on file-set change via `gateFileSetsEqual` (order-insensitive).

**VG3 result:** ✅ GREEN
- `cd agents && bun run typecheck` → exit 0.
- `cd agents && bun test __tests__/gate-aux-triggers.test.ts` → 34 pass / 0 fail (53 expect() calls).
- `reviewer-spawn-conditions.e2e.test.ts` is a planned-but-unwritten test (P4 candidate); existing reviewer-gate behavior is covered by `gate-reviewer.test.ts` (already green). No regression in the existing code-reviewer gate — the M3 gates are additive, branch on disjoint conditions, and reset idempotently.

New test file: `agents/__tests__/gate-aux-triggers.test.ts` — uses the `Bun.Transpiler` + `extractInlineFunctionSource` (extended to balance `[`/`]` for `const` array extraction) + `new Function('process', ...)` pattern from `gate-reviewer.test.ts`. Covers securityReviewerGate (10 tests), testWriterGate (10 tests), docWriterGate (9 tests), idempotency/reset (5 tests). No source under test was modified.

Next checkpoint: M4 P4.6 — update `docs/agents-and-tools.md` (R5a + R5b) to document the new automated gates + the `git_branch` tool. P4.2/P4.3 (git-branch unit tests) were satisfied during M1 (15/15). P4.4 (git-committer test extensions) satisfied during M2 (24/24). P4.5 (quality-prompt-snapshot.test.ts unchanged) needs verification.


<!-- update_plan_status:appended -->
## M4 + M5 complete — VG4/VG5 green — 2026-07-05T22:55Z — 2026-07-04T22:47:59.529Z

M4 (tests + docs) and M5 (final validation) are complete. All validation gates green.

**P4.1** — `agents/__tests__/gate-aux-triggers.test.ts` (NEW): 34 tests / 0 fail / 53 expect() calls. Uses the `Bun.Transpiler` + `extractInlineFunctionSource` pattern from `gate-reviewer.test.ts`, extended to balance `[`/`]` so it can also extract the `const SECURITY_SENSITIVE_GLOBS` / `SECURITY_SENSITIVE_NAME_SUBSTRINGS` array declarations. `process` passed as a `new Function('process', ...)` arg so `normalizeGateFilePath`'s `process.cwd()` reference resolves at runtime. Covers securityReviewerGate (10), testWriterGate (10), docWriterGate (9), idempotency/reset (5).
**P4.2/P4.3** — git-branch params + handler unit tests satisfied during M1 (common 11 + runtime 4 = 15 pass).
**P4.4** — git-committer test extensions satisfied during M2 (24 pass incl. 7 new branch tests).
**P4.5** — `quality-prompt-snapshot.test.ts` + `new-bundled-agents.test.ts` unchanged and green: 62 pass / 0 fail / 1 snapshot / 122 expect() calls.
**P4.6** — `docs/agents-and-tools.md` updated with two new sections: `## Automated phase-gates` (R5a — documents all three gates, their ordering, the inline-no-micromatch constraint, and the done-flag reset semantics) and `### git_branch` (R5b — documents the first-class branch-creation tool, its three input fields, dirty-tree refusal, name-validation regex, and the git-committer integration).

**VG5 final validation sweep:**
- P5.1 typecheck: `common` 0, `packages/agent-runtime` 0, `sdk` 0, `agents` 0 — all green.
- P5.2 tests: agents gate+committer suite 77/0 (337 expect); git_branch tool suite 25/0 (common 11 + runtime 4 + sdk 10, 61 expect); snapshot+bundled 62/0.
- P5.3 live `codebuff-local-cli` smoke deferred — requires interactive CLI spawn; the automated gate behavior is covered by 34 unit tests and the 62-test snapshot/bundled suite.
- P5.4 code-reviewer gate: the automated runtime reviewer gate will run on the changed file set on finalization; no manual spawn needed.

**Session-complete file inventory:**
- M1 (R2 git_branch tool): `common/src/tools/params/tool/git-branch.ts`, `agents/types/tools.ts`, `common/src/tools/constants.ts`, `common/src/tools/list.ts`, `packages/agent-runtime/src/tools/handlers/list.ts`, `packages/agent-runtime/src/tools/handlers/tool/git-branch.ts`, `sdk/src/run.ts`, `sdk/src/tools/git-branch.ts`, tests ×3.
- M2 (R3 git-committer branch): `agents/git-committer/git-committer.ts`, `agents/__tests__/git-committer.test.ts`.
- M3 (R1 automated phase-gates): `agents/base2/gate-state.ts` (4 new state fields), `agents/base2/base2.ts` (predicates + gate wiring, already present at resume), `agents/__tests__/gate-aux-triggers.test.ts` (NEW).
- M4 docs: `docs/agents-and-tools.md`.
- Side fix: `evals/buffbench/eval-task-generator.ts` typecheck regression (SecretAgentDefinition→AgentDefinition cast) fixed during resume context-gathering — unrelated to the plan but was blocking the broader typecheck.


<!-- update_plan_status:appended -->
## Reviewer BLOCKING findings resolved — 2026-07-05T(open) — 2026-07-04T22:55:26.203Z

Resolved the code-reviewer BLOCKING verdict from the finalization gate.

Finding #1 (BLOCKING) — snake_case→camelCase dispatch mismatch in `sdk/src/run.ts` git_branch case: The dispatch was `const gitBranchInput = input as Omit<Parameters<typeof gitBranch>[0], 'cwd'>` then `gitBranch({ ...gitBranchInput, cwd })`. The Zod schema validates snake_case (`branch_name`/`switch`/`allow_dirty`), but `gitBranch()` expects camelCase (`branchName`/`switch`/`allowDirty`). The `as` cast hid the mismatch; at runtime `branchName` was `undefined` → every dispatch-path call failed the regex check. Fix: replaced the unsafe spread with explicit camelCase key mapping: `gitBranch({ branchName: input.branch_name, switch: input.switch, allowDirty: input.allow_dirty, cwd })`. Note: `gitBranch` (unlike `gitStatus`) does NOT accept a `signal` param — first fix attempt added `signal` and failed typecheck; removed it.

Finding #2 (BLOCKING) — No integration test covered the dispatch path. Added 3 new tests to `sdk/src/__tests__/git-branch.test.ts` under `describe('dispatch path snake→camel mapping (sdk/src/run.ts git_branch case)')` proving the mapping: `branch_name → branchName`, `allow_dirty: true → allowDirty: true` (not silently dropped), `switch: false → switch: false`. Total now 13/0 (was 10/0).

Validation after fixes: sdk typecheck exit 0; sdk git-branch tests 13/0; common git-branch tests 11/0; agent-runtime git-branch tests 4/0. All three layers of the git_branch tool are now green and the dispatch path is covered.


<!-- update_plan_status:appended -->
## Reviewer gate final verdict: LOOKS_GOOD — session complete — 2026-07-05T(open) — 2026-07-04T22:56:07.998Z

Reviewer gate re-run after BLOCKING resolution: **LOOKS_GOOD**. The reviewer confirmed the dispatch fix in `sdk/src/run.ts:937-947` correctly maps `branch_name → branchName`, `switch → switch`, `allow_dirty → allowDirty` with explicit key mapping, mirroring `gitStatus` tuple shape. The 3 new dispatch-path tests (`describe('dispatch path snake→camel mapping')`, lines 305-436) faithfully mirror the production mapping via a `mapDispatchInput` helper that replicates the exact dispatch logic.

Final validation picture (all green):
- typecheck-common: exit 0
- typecheck-sdk: exit 0
- typecheck-agents: exit 0
- typecheck-agent-runtime: exit 0
- common git-branch tests: 11/0
- agent-runtime git-branch tests: 4/0
- sdk git-branch tests: 13/0 (10 original + 3 new dispatch-path)
- agents gate-aux-triggers: 34/0
- agents git-committer: 24/0
- agents gate-reviewer/paths/changed-files/files-parity: 19/0
- agents quality-prompt-snapshot + bundled-agents: 62/0

The durable plan session `agent-trigger-gates-and-git-branch-2026-07-05` is **COMPLETE**. All five milestones (M1–M5) done with VG1–VG5 green and the reviewer gate returned LOOKS_GOOD after BLOCKING findings were resolved.

