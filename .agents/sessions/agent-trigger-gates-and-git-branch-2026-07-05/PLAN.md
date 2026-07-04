# PLAN — Agent trigger gates + git_branch tool

> Paired with SPEC.md in `.agents/sessions/agent-trigger-gates-and-git-branch-2026-07-05/`.

## Milestones

### M1 — `git_branch` agent tool registration (R2)
- [x] P1.1 Verify `base2-deep.ts` `handleSteps` sharing pattern via `read_outline` (resolves SPEC Q1). (RESOLVED Q1: base2-deep.ts imports createBase2 (line 7) and createBaseDeep (line 285) calls createBase2 — no own handleSteps. Gates land once in createBase2.)
- [x] P1.2 Grep for `git_status` client-side handler registration (resolves SPEC Q2) — confirm the registration point in `sdk/src/run.ts` or `packages/agent-runtime/src/tools/...`. (RESOLVED Q2: three-layer wiring confirmed — (1) agent-runtime handler `packages/agent-runtime/src/tools/handlers/tool/git-status.ts` forwards via requestClientToolCall, (2) registered in `packages/agent-runtime/src/tools/handlers/list.ts` line 79 `git_status: handleGitStatus`, (3) client-side dispatch in `sdk/src/run.ts` ~line 640 calls `gitStatus()`. Mirror for git_branch at all three layers plus `common/src/tools/list.ts` + `common/src/tools/constants.ts` + `agents/types/tools.ts`.)
- [ ] P1.3 Create `common/src/tools/params/tool/git-branch.ts` mirroring `git-status.ts` (R2a).
- [ ] P1.4 Add `'git_branch'` to `ToolName` + `git_branch: GitBranchParams` to `ToolParamsMap` + `GitBranchParams` interface in `agents/types/tools.ts` (R2b, R2c).
- [ ] P1.5 Create `packages/agent-runtime/src/tools/handlers/tool/git-branch.ts` mirroring `handleGitStatus` (R2d).
- [ ] P1.6 Register `git_branch` client-side handler to call `gitBranch()` from `sdk/src/tools/git-branch.ts` (R2e).
- [ ] P1.7 Add `git_branch` to the `toolNames` registry in `common/src/tools/constants.ts` (R2f).
- [x] P1.8 Add params + handler unit tests (R4b). (15/15 pass)
- [ ] P1.9 Run `cd common && bun run typecheck` + `cd packages/agent-runtime && bun run typecheck` + `cd sdk && bun run typecheck` → all green.
- **Owner:** editor agent (P1.3–P1.7), test-writer agent (P1.8), basher (P1.9).
- **Dependencies:** None. This is standalone plumbing.
- **Validation gate VG1:** Typechecks pass across all three packages. Params schema test passes. Handler test passes. The orchestrator can invoke `git_branch` (verified by it appearing in `ToolName` and the tool registry — a full spawn test is covered in M3).

### M2 — git-committer branch capability (R3)
- [ ] P2.1 Add `branch_name` + `branch_switch` to git-committer `inputSchema.params` (R3a).
- [ ] P2.2 Add `'git_branch'` to git-committer `toolNames` (R3b).
- [ ] P2.3 Add the `git_branch` yield to `handleSteps` before the existing `run_terminal_command 'git status --short'` step, gated on `params?.branch_name` (R3c).
- [ ] P2.4 Update `instructionsPrompt` to mention branch creation when `branch_name` is provided (R3d).
- [ ] P2.5 Update `spawnerPrompt` to mention branch capability (R3e).
- [ ] P2.6 Extend `agents/__tests__/git-committer.test.ts`: assert `git_branch` in toolNames, `branch_name` in inputSchema, instructionsPrompt mentions branch creation, `handleSteps is serializable` test still passes (R4c).
- [x] P2.7 Run `cd agents && bun run typecheck` + `bun test agents/__tests__/git-committer.test.ts` → green.
- **Owner:** editor agent (P2.1–P2.5), test-writer agent (P2.6), basher (P2.7).
- **Dependencies:** M1 (git_branch tool must be registered before git-committer can reference it in toolNames; otherwise typecheck fails).
- **Validation gate VG2:** git-committer typechecks. Git-committer tests pass including the new branch assertions. `handleSteps is serializable` test still passes (no top-level lexical binding capture).

### M3 — Automated phase-gates in `handleSteps` (R1)
- [x] P3.1 Choose a glob-matching utility in the codebase (picomatch / micromatch — verify via grep) for the security-sensitive pattern check (R1a). (self-contained string/regex glob, no micromatch (handleSteps is .toString()-serialized))
- [ ] P3.2 Add `preEditSecurityReviewDone: boolean`, `testWriterGateDone: boolean`, `docWriterGateDone: boolean` fields to `Base2ActiveWorkState` (resolves R1d idempotency).
- [ ] P3.3 Implement `securityReviewerGate(activeWorkState, pendingGateFiles)` — returns `spawn_agent_inline` yield or `null`. Match against the security glob patterns from `securityReviewSection` (R1a).
- [ ] P3.4 Implement `testWriterGate(activeWorkState, pendingGateFiles)` — returns `spawn_agent_inline` yield or `null`. Detect non-test source files in packages with test suites (R1b).
- [ ] P3.5 Implement `docWriterGate(activeWorkState, pendingGateFiles)` — returns `spawn_agent_inline` yield or `null`. Detect exported-symbol / docs-referenced files (R1c).
- [ ] P3.6 Wire the three gates into the validation/reviewer gate loop in `createBase2.handleSteps` (lines ~610-720 of `base2.ts`), AFTER validation passes and BEFORE/AFTER the existing code-reviewer gate per R1d ordering: security-reviewer → [validation → code-reviewer] → test-writer → doc-writer → final_response_allowed. (security-reviewer fires BEFORE validation; test-writer + doc-writer fire AFTER the code-reviewer gate passes (per R1d ordering: security-reviewer → [validation → code-reviewer] → test-writer → doc-writer → final_response_allowed).)
- [/] P3.7 Mirror the gate additions in `base2-deep.ts` if it has its own `handleSteps` copy (P1.1 result determines this). (base2-deep.ts shares createBase2.handleSteps — not needed.)
- [ ] P3.8 Guard all three gates with `runValidationGate` (reuse existing flag) so `base2-fast` / `base2-fast-no-validation` skip them (R1e).
- [ ] P3.9 Reset the three `*GateDone` flags when `pendingGateFiles` changes to a new set (compare via `gateFileSetsEqual`).
- **Owner:** editor agent (P3.1–P3.8).
- **Dependencies:** None strictly on M1/M2, but M3 spawns the existing agents (security-reviewer, test-writer, doc-writer) which are already defined. Implementation can proceed in parallel with M1/M2 but **validation of M3 requires M1 complete** (test-writer gate passes `test_command` that may use the new tool). Recommend M1 → M2 → M3 ordering to minimize merge conflicts in `agents/types/tools.ts` and `base2.ts`.
- **Validation gate VG3:** `agents/__tests__/gate-aux-triggers.test.ts` passes (security glob match → security-reviewer spawn; non-test source in package with tests → test-writer spawn; docs-referenced file → doc-writer spawn). `agents/__tests__/reviewer-spawn-conditions.e2e.test.ts` still passes (existing code-reviewer gate unchanged). `cd agents && bun run typecheck` green.

### M4 — Tests (R4) + Docs (R5)
- [ ] P4.1 Add `agents/__tests__/gate-aux-triggers.test.ts` (R4a) — unit tests for all three new gates.
- [ ] P4.2 Add `common/src/tools/params/tool/__tests__/git-branch.test.ts` (R4b part 1).
- [ ] P4.3 Add `packages/agent-runtime/src/tools/handlers/tool/__tests__/git-branch.test.ts` (R4b part 2).
- [ ] P4.4 Extend `agents/__tests__/git-committer.test.ts` (R4c) — done in P2.6.
- [ ] P4.5 Verify `agents/__tests__/quality-prompt-snapshot.test.ts` still passes unchanged (R4d) — `qualitySection`, `securityReviewSection`, `gitDisciplineSection` byte-match. If the snapshot test fails, it means the frozen prompt strings drifted — revert.
- [ ] P4.6 Update `docs/agents-and-tools.md` (R5a + R5b) — document the new automated gates and the `git_branch` tool.
- **Owner:** test-writer agent (P4.1–P4.3), doc-writer agent (P4.6), basher (P4.5).
- **Dependencies:** M1, M2, M3 complete.
- **Validation gate VG4:** All new tests pass. Snapshot test unchanged. Docs review by code-reviewer gate.

### M5 — Final validation + review
- [ ] P5.1 Run full typecheck across all affected packages: `agents`, `common`, `packages/agent-runtime`, `sdk`.
- [ ] P5.2 Run full test suite for affected packages.
- [ ] P5.3 Run `codebuff-local-cli` smoke test: spawn the orchestrator in default mode, ask it to "add a comment to `packages/sdk/src/auth-token.ts`" (matches `**/*token*` security glob), verify `security-reviewer` spawns automatically.
- [ ] P5.4 Spawn code-reviewer for static review of the diff once validation passes.
- **Owner:** basher (P5.1, P5.2), codebuff-local-cli (P5.3), automated code-reviewer gate (P5.4).
- **Dependencies:** M1–M4 complete.
- **Validation gate VG5:** Typecheck + tests green. Live smoke test shows security-reviewer auto-spawning. Reviewer LOOKS_GOOD or non-blocking findings resolved.

## Validation Gates Summary

| Gate | Command | Pass criterion |
|------|---------|-----------------|
| VG1 | `cd common && bun run typecheck && cd ../packages/agent-runtime && bun run typecheck && cd ../sdk && bun run typecheck` + params + handler tests | All green |
| VG2 | `cd agents && bun run typecheck && bun test agents/__tests__/git-committer.test.ts` | Green |
| VG3 | `cd agents && bun run typecheck && bun test agents/__tests__/gate-aux-triggers.test.ts agents/__tests__/reviewer-spawn-conditions.e2e.test.ts` | Green |
| VG4 | `cd agents && bun test agents/__tests__/quality-prompt-snapshot.test.ts && bun test agents/__tests__/new-bundled-agents.test.ts` | Snapshot unchanged; new tests green |
| VG5 | Full typecheck + test sweep + live smoke + code-reviewer gate | Green end-to-end |

## Checkpoint / Update Rules

- **STATUS.md** updated via `update_plan_status` at: start of each milestone (in_progress), end of each milestone (done/blocker), blocker discovery, validation gate run results.
- **LESSONS.md** updated via `update_plan_status` (append) whenever a gotcha is discovered — specifically around: (a) the client-side handler registration point (resolves Q2), (b) `base2-deep.ts` handleSteps copy-or-share (resolves Q1), (c) glob matching utility choice, (d) any over-triggering discovered during smoke tests.
- **PLAN.md / SPEC.md** rewritten via `create_plan` only if scope changes (e.g., a milestone is split, a non-goal becomes a goal, a new file is added to the modify list).
- **Session status** set via `update_plan_status(sessionStatus: ...)` — `active` at start, `completed` at M5 close, `paused` if the user defers.

<!-- current-task: VG3 — write agents/__tests__/gate-aux-triggers.test.ts (P4.1) + run typecheck -->
