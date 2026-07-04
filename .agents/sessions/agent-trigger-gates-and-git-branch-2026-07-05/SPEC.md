# SPEC — Agent trigger gates + git_branch tool

## Overview

Three followups packaged as one coordinated change:

1. **Automated phase-gates** for `security-reviewer`, `test-writer`, and `doc-writer` in the orchestrator's `handleSteps` so they trigger deterministically instead of relying on advisory prompt language.
2. **Register a `git_branch` agent tool** (mirroring `git_status`) so branch creation is a first-class agent operation available to the orchestrator and git-committer.
3. **Extend git-committer** with an optional `branch_name` param so it can create a branch before committing.

## Goals

- Increase trigger frequency of security-reviewer, doc-writer, and test-writer to match code-reviewer's automated gate behavior, so these agents run when their criteria are objectively met — not only when the LLM subjectively decides.
- Make branch creation an addressable agent operation: a `git_branch` tool the orchestrator can call directly (e.g., "start a feature branch") and that git-committer can call when the user asks to commit on a new branch.
- Preserve all existing guardrails: no push, no config changes, no secrets, dirty-tree refusal for branch creation, byte-frozen `qualitySection` immutability.

## Non-Goals

- Not changing the `code-reviewer` automated gate (works correctly today).
- Not changing the orchestrator's *advisory* prompt language (the security-sensitive file patterns section, git-discipline section) — it stays as guidance for cases the new automated gates don't cover.
- Not adding automated gates for the debugger (already phase-triggered via repeated-failure language; adding a hardcoded gate is a larger design change).
- Not extending git-committer to push, rebase, amend, or alter config — those stay forbidden.
- Not removing `run_terminal_command` from git-committer (still needed for `git status`, `git diff`, `git log`, `git add`, `git commit`).
- Not modifying the `gitBranch()` SDK helper behavior — only wrapping it in an agent-tool handler.

## Requirements

### R1 — Automated phase-gates in `handleSteps` (`agents/base2/base2.ts`)

After validation passes for a set of pending gate files, the orchestrator's `handleSteps` already auto-spawns `code-reviewer`. Add three new deterministic spawn steps keyed off the gate file set:

- **R1a — security-reviewer gate:** When the pending gate files intersect the security-sensitive glob patterns (the same patterns from `securityReviewSection`: `**/auth/**`, `**/oauth/**`, `**/credentials/**`, `**/session/**`, `**/crypto/**`, `**/keys/**`, `**/*secret*`, `**/*token*`, `**/*apikey*`, `**/billing/**`, `**/payment/**`, `**/stripe/**`, `.env*`, `**/.env*`, `**/secrets/**`, `**/vault/**`, `**/permissions/**`, `**/rbac/**`, `**/policy/**`), yield a `spawn_agent_inline { agent_type: 'security-reviewer', params: { changed_files: [...] } }` step BEFORE the existing code-reviewer gate. Mark `preEditSecurityReviewDone` in `activeWorkState` so it runs once per file set, not every loop.

- **R1b — test-writer gate:** When the pending gate files include non-test source files (exclude `**/__tests__/**`, `**/*.test.ts`, `**/*.spec.ts`) in a package that has a test suite (`packages/*/src/__tests__/`, `agents/__tests__/`, `common/src/__tests__/`, or any sibling `*.test.ts`), yield a `spawn_agent_inline { agent_type: 'test-writer', params: { target_files: [...], test_command: '<package test command>' } }` step AFTER the code-reviewer gate passes (so we don't write tests for code that fails review). Mark `testWriterGateDone` in `activeWorkState`. Heuristic: skip if the only edits are themselves test files, docs, configs, or generated/`*.generated.ts` files.

- **R1c — doc-writer gate:** When the pending gate files include changes to exported symbols (public API surface) OR files referenced by docs (`docs/**` content referencing the file path, or the file path appearing in `README.md`/`docs/*.md`), yield a `spawn_agent_inline { agent_type: 'doc-writer', params: { source_files: [...], target_doc_files: [...] } }` step AFTER the test-writer gate. Mark `docWriterGateDone`. Skip for trivial doc-irrelevant edits (test files, configs, `*.generated.ts`).

- **R1d — Gate ordering and idempotency:** The new gates run in order: security-reviewer → [validation → code-reviewer] → test-writer → doc-writer → final_response_allowed. Each gate records its completion in `activeWorkState` so it doesn't re-run on the next loop iteration for the same file set. Re-running the gate for a *new* set of pending files resets the per-set flags.

- **R1e — Skipable gates:** Add an `hasNoAuxGates` mirror of `hasNoValidation` (or reuse `hasNoValidation`) to disable these gates in `base2-fast` and `base2-fast-no-validation`. Don't change behavior for the default orchestrator.

### R2 — Register a `git_branch` agent tool

- **R2a — Tool params schema:** New file `common/src/tools/params/tool/git-branch.ts` mirroring `git-status.ts`. Params: `branch_name: string` (required), `switch: boolean` (default true), `allow_dirty: boolean` (default false). Zod schema. `endsAgentStep: true`. Output schema: `jsonToolResultSchema(z.union([z.object({ branch, created, switched, previousBranch? }), z.object({ errorMessage })]))`.

- **R2b — ToolName union:** Add `'git_branch'` to `ToolName` in `agents/types/tools.ts` (line 16, after `'git_status'`). Add `git_branch: GitBranchParams` to `ToolParamsMap`.

- **R2c — Params interface:** Add `GitBranchParams` interface to `agents/types/tools.ts` mirroring `GitStatusParams` (line 342).

- **R2d — Handler:** New file `packages/agent-runtime/src/tools/handlers/tool/git-branch.ts`. Pattern: copy the `requestClientToolCall` shape from `git-status.ts` handler. The handler forwards to the client, which calls the SDK `gitBranch()` function. (Existing `gitBranch` in `sdk/src/tools/git-branch.ts` already implements the logic; this is the agent-facing wrapper.)

- **R2e — Client-side handler registration:** Find the client-side tool handler registry (where `git_status` is registered to call `gitStatus()` in `sdk/src/tools/git-status.ts` / the SDK's `run.ts` / the runtime's client tool dispatcher) and register `git_branch` to call `gitBranch()` from `sdk/src/tools/git-branch.ts`. Verify the registration point during implementation by grepping for `git_status` handler registration.

- **R2f — Tool registry / `toolNames` constant:** Add `git_branch` to the `toolNames` constant in `common/src/tools/constants.ts` (or wherever the registry of $ToolParams is assembled — confirm the assembling file during implementation).

### R3 — Extend git-committer with branch creation

- **R3a — Add `branch_name` param:** In `agents/git-committer/git-committer.ts` `inputSchema.params`, add `branch_name: { type: 'string', description: 'If set, create and switch to this branch before committing.' }` and `branch_switch: { type: 'boolean', default: true }`. Optional.

- **R3b — Add `git_branch` to toolNames:** Add `'git_branch'` to git-committer's `toolNames` (currently `read_files`, `read_outline`, `code_search`, `run_terminal_command`, `git_status`).

- **R3c — handleSteps branch step:** When `params?.branch_name` is set, yield a `git_branch { branch_name, switch: params.branch_switch ?? true }` step BEFORE the existing `run_terminal_command 'git status --short'` step. The dirty-tree refusal in `gitBranch()` naturally guards against creating a branch over uncommitted work — but the orchestrator's `git_discipline` section already tells Buffy to commit/stash first, so this is the user's expected flow: "commit on a new branch" implies a clean tree or an explicit `allow_dirty: true`.

- **R3d — Update instructionsPrompt:** Add a sentence: "If `branch_name` is provided, create the branch first with the `git_branch` tool before staging and committing. If the working tree is dirty and `branch_name` was provided, commit the existing changes first on the current branch, then create the new branch (or instruct the caller to set `allow_dirty`)."

- **R3e — Update spawnerPrompt:** Change to mention branch capability: "Commits code changes to git with a well-crafted commit message. Spawn when you need to stage and commit related changes, optionally on a new branch."

### R4 — Tests

- **R4a — New automated gates unit tests:** Extend `agents/__tests__/gate-*` test files (or add `agents/__tests__/gate-aux-triggers.test.ts`) to verify that when the pending gate files match the security glob, the `handleSteps` generator yields a `spawn_agent_inline { agent_type: 'security-reviewer' }` step; similarly for test-writer (non-test source in a package with tests) and doc-writer (exported-symbol file referenced by docs). Use the existing `handleSteps` test harness pattern.

- **R4b — git_branch params + handler test:** Add `common/src/tools/params/tool/__tests__/git-branch.test.ts` (or extend the existing params tests) asserting the Zod schema validates `branch_name` required, `switch` defaults true, `allow_dirty` defaults false. Add `packages/agent-runtime/src/tools/handlers/tool/__tests__/git-branch.test.ts` mirroring the `git-status.ts` handler test, asserting it forwards the four input fields to `requestClientToolCall`.

- **R4c — Extend `agents/__tests__/git-committer.test.ts`:** Add tests asserting git-committer now includes `git_branch` in `toolNames`, accepts `branch_name` in `inputSchema.params`, and that the `instructionsPrompt` mentions creating a branch when `branch_name` is provided. The existing `does not expose write/edit tools` test stays green (git_branch is not a write/edit tool).

- **R4d — Snapshot tests:** Update `agents/__tests__/quality-prompt-snapshot.test.ts` ONLY if the `qualitySection` / `securityReviewSection` / `gitDisciplineSection` text strings change (they should NOT, per non-goals). If they don't change, the snapshot test stays green untouched.

### R5 — Docs

- **R5a — `docs/agents-and-tools.md`:** Document the new automated gates under the orchestration policy section: "security-reviewer, test-writer, and doc-writer run as automated phase-gates when their criteria are objectively met (security-glob match, non-test source in a package with tests, exported-symbol changes referenced by docs)."

- **R5b — `docs/agents-and-tools.md`:** Document the `git_branch` tool and the extended git-committer branch capability.

## Acceptance Criteria

- **AC1:** Editing a file matching `**/auth/**` in a default-mode session causes `security-reviewer` to spawn automatically (visible in `handleSteps` output stream), without the LLM choosing to spawn it.
- **AC2:** Editing `packages/sdk/src/tools/git-status.ts` (a non-test source file in a package with `sdk/src/__tests__/`) causes `test-writer` to spawn automatically after validation + code-reviewer pass.
- **AC3:** Editing `packages/sdk/src/tools/git-branch.ts` when `docs/agents-and-tools.md` references `git_branch` triggers `doc-writer` automatically.
- **AC4:** `git_branch` appears in the `ToolName` union, `ToolParamsMap`, `toolNames` registry, has a params schema and handler, and the orchestrator can invoke it via `spawn_agents` (test-writer path) or directly in its own `toolNames`.
- **AC5:** git-committer accepts `branch_name`, creates a branch via the `git_branch` tool when provided, then commits. Existing guardrails still hold: no push, no secrets, no config, no amend.
- **AC6:** `cd agents && bun run typecheck` passes. `cd packages/agent-runtime && bun run typecheck` passes. `cd common && bun run typecheck` passes. `cd sdk && bun run typecheck` passes.
- **AC7:** All affected unit tests pass: `agents/__tests__/git-committer.test.ts`, `agents/__tests__/new-bundled-agents.test.ts`, `agents/__tests__/quality-prompt-snapshot.test.ts` (unchanged), the new `gate-aux-triggers.test.ts`, the new git-branch params + handler tests, and the SDK `git-branch.test.ts` (unchanged — wrapper doesn't change the SDK function).
- **AC8:** `base2-fast` and `base2-fast-no-validation` skip the new gates (no spawn steps emitted), preserving fast-mode behavior.

## Relevant Files / Systems

### Files to modify
- `agents/base2/base2.ts` — add R1 gates to `handleSteps` (lines 347-2769 region; specifically the validation/reviewer gate loop around lines 610-720).
- `agents/base2/base-deep.ts` — the `base2-deep` variant may share the `handleSteps` body via `createBase2` (verify during implementation); if it has its own copy, mirror the gate additions.
- `agents/types/tools.ts` — `ToolName` union + `ToolParamsMap` + `GitBranchParams` (R2b, R2c).
- `agents/git-committer/git-committer.ts` — `inputSchema`, `toolNames`, `handleSteps`, `instructionsPrompt`, `spawnerPrompt` (R3).
- `common/src/tools/params/tool/git-branch.ts` — NEW (R2a).
- `packages/agent-runtime/src/tools/handlers/tool/git-branch.ts` — NEW (R2d).
- Client-side tool handler registry — verify registration point during implementation (R2e); likely `sdk/src/run.ts` or `packages/agent-runtime/src/tools/client-tool-handlers.ts` (grep `git_status` registration).
- `common/src/tools/constants.ts` (or equivalent registry) — add `git_branch` to the exported `toolNames` record (R2f).
- `docs/agents-and-tools.md` (R5).

### Files to add
- `common/src/tools/params/tool/git-branch.ts`
- `packages/agent-runtime/src/tools/handlers/tool/git-branch.ts`
- `agents/__tests__/gate-aux-triggers.test.ts` (or extend `agents/__tests__/reviewer-spawn-conditions.e2e.test.ts`)

### Files to update tests
- `agents/__tests__/git-committer.test.ts` — new branch tests (R4c).
- `agents/__tests__/new-bundled-agents.test.ts` — add `git_branch` to the toolNames assertion list if needed.
- `agents/__tests__/quality-prompt-snapshot.test.ts` — verify `qualitySection` still byte-matches; if `gitDisciplineSection` text changes (it shouldn't per non-goals), update the snapshot deliberately.

### Reference (unchanged)
- `sdk/src/tools/git-branch.ts` — `gitBranch()` function (already exists, already tested).
- `sdk/src/tools/git-status.ts` — `runGit()` + `gitStatus()` (reused by `git_branch` handler).
- `agents/security-reviewer/security-reviewer.ts`, `agents/doc-writer/doc-writer.ts`, `agents/test-writer/test-writer.ts` — agent definitions (no change; the gates spawn them with their existing params).

## Open Questions / Assumptions

- **Q1:** Does `base2-deep.ts` share `handleSteps` with `base2.ts` via `createBase2`, or does it have its own copy? If it has its own copy, the gates must be mirrored. **Assumption:** verify via `read_outline` on `base2-deep.ts` during implementation. If shared, gates land once in `createBase2`.
- **Q2:** Where is the client-side `git_status` handler registered? **Assumption:** grep for `handleGitStatus` / `git_status` in `packages/agent-runtime/src/` and `sdk/src/run.ts`, register `handleGitBranch` at the same point.
- **Q3:** Should the test-writer gate pass a `test_command` inferred from the package, or leave it blank and let the agent infer? **Assumption:** pass the inferred command (e.g., `cd <package> && bun run typecheck && bun test`) so the gate is deterministic; make it overridable via `activeWorkState.testWriterGateOverride` if needed later.
- **Q4:** Should the doc-writer gate detect "exported symbols" via AST (parse the edited file for `export` keywords) or via a simpler heuristic (file is in `packages/*/src/`, `agents/`, `cli/src/`, `common/src/`)? **Assumption:** start with the simpler heuristic (source-file paths in public-facing directories), escalate to AST only if the gate over-triggers on internal files.
- **Q5:** Will the new gates break `base2-fast` / `base2-fast-no-validation`? **Assumption:** guard them with the same `runValidationGate` check (`agentId !== 'base2-fast' && agentId !== 'base2-fast-no-validation'`), so fast mode skips them.

## Risks

- **R-RISK-1:** Over-triggering. The test-writer gate may spawn for every tiny source edit, which is expensive and slow. **Mitigation:** skip when edits are trivial (test files, configs, generated, or files with no sibling test file).
- **R-RISK-2:** The security glob is broad (`**/*token*` matches `agents/__tests__/new-bundled-agents.test.ts` which contains "token"). **Mitigation:** scope the glob to path segments, not substring match (use picomatch-style `**/token/**` and `**/*token*.{ts,js,tsx,jsx}` rather than bare substring).
- **R-RISK-3:** Client-side `git_branch` handler registration is missed and the tool silently fails at runtime. **Mitigation:** R2e requires a grep verification step during implementation; add the new tool to the existing `toolNames` parity test (if one exists) or create one.
- **R-RISK-4:** `qualitySection` snapshot test breaks. **Mitigation:** non-goal explicitly forbids changing it; the gate additions live in `handleSteps`, not in the frozen prompt strings.
- **R-RISK-5:** The extended git-committer `handleSteps` may close over a top-level binding and break the `handleSteps is serializable` test. **Mitigation:** use inline literals (mirror the existing pattern in `git-committer.ts` — `yield { toolName: 'git_branch', input: { branch_name: params?.branch_name, switch: params?.branch_switch ?? true } } as ToolCall<'git_branch'>`).
