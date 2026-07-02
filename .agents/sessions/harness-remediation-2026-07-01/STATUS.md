# Harness Audit Remediation Status

Session: `.agents/sessions/harness-remediation-2026-07-01/`
Source audit: `.agents/sessions/harness-audit-2026-06-30/AUDIT-REPORT.md`

## Current state

Status: planned
Current task: M0 — Re-verify audit findings against current dirty tree and create finding tracker

## Completed

- Durable remediation planning packet created:
  - `SPEC.md`
  - `PLAN.md`
  - `STATUS.md`
  - `LESSONS.md`
- Audit report and coverage matrix were read as planning inputs.

## Pending milestones

- [/] M0 — Triage and tracking foundation (replaced by local-model triage)
- [/] M1 — Security boundary fixes (replaced by local filesystem/edit safety and BYOK-aware hygiene)
- [ ] M2 — Cancellation and async ownership (retained as local process/cancellation reliability)
- [ ] M3 — Freshness, deterministic edits, and index/cache invalidation (retained as local state correctness)
- [ ] M4 — Registry, schema, API/ABI alignment (retained as local tool/schema/config contract alignment)
- [ ] M5 — Error handling and observability (retained as diagnostics/reliability)
- [ ] M6 — Performance and dependency hygiene (split across bounded resource use and cleanup/docs)
- [ ] M7 — Evals and plan-sharding correctness (retained after cleanup/docs milestone)
- [/] M8 — Documentation, cleanup, and final audit closure (replaced by M7 cleanup/docs and M9 closure)

## Known dirty-tree context

The repository already has unrelated modified/deleted/untracked files. Before implementation, inspect `git_status` and preserve unrelated user work. Do not stage or revert unrelated files unless explicitly requested.

## Next checkpoint

Start M0:
1. Read the current source ranges for the Top 10 findings.
2. Determine whether any dirty-tree changes already partially address them.
3. Create a finding tracker artifact under this session directory.
4. Record validation commands per package.

## Resume instructions

To resume, read:
- `.agents/sessions/harness-remediation-2026-07-01/SPEC.md`
- `.agents/sessions/harness-remediation-2026-07-01/PLAN.md`
- `.agents/sessions/harness-remediation-2026-07-01/STATUS.md`
- `.agents/sessions/harness-remediation-2026-07-01/LESSONS.md`
- `.agents/sessions/harness-audit-2026-06-30/AUDIT-REPORT.md`

Then continue from the current task in `PLAN.md` and update this status file after each checkpoint.

<!-- update_plan_status:appended -->
## Local-CLI recalibration — 2026-07-01 — 2026-07-01T05:43:54.545Z

SPEC.md and PLAN.md were substantially rewritten to use `docs/architecture.md` as the controlling product model: local-first CLI/SDK, BYOK provider calls directly from the user's machine, no hosted backend/web/billing/auth surface. The old hosted-security framing is no longer authoritative. Next checkpoint is M0: create/update a tracker that reclassifies every audit finding as keep/high local safety, keep/high correctness, keep/normal contract-reliability, downgrade optional integration, or discard/defer out-of-scope. Guard recommendations that would break custom providers, local model servers, explicit user paths, MCP integrations, or compatibility aliases must be dropped or rewritten before implementation.


<!-- update_plan_status:appended -->
## M0 started — local-model triage — 2026-07-01T05:48:04.642Z

Started M0. Current focus: create the remediation tracker, re-rank the audit Top 10 under the local CLI/BYOK model, identify guard-breaking recommendations to drop/rewrite, check dirty-tree overlap, and record validation commands.


<!-- update_plan_status:appended -->
## M0 complete — local-model triage tracker created — 2026-07-01T05:52:50.738Z

Completed M0. Created `.agents/sessions/harness-remediation-2026-07-01/M0-LOCAL-TRIAGE-TRACKER.md` with local-CLI classifications, a re-ranked Top 10, guard-breaking recommendations to drop/rewrite, dirty-tree overlap notes, and validation commands. Configured file-change hooks were skipped for the tracker because no hooks matched the changed markdown file. Next checkpoint: begin M1 by reading current source ranges for local filesystem/edit-safety items, especially the dirty-tree-overlapping deterministic edit files before making any source edits.


<!-- update_plan_status:appended -->
## M1 started — 2026-07-01T06:05:45.707Z

M1 — Local filesystem and edit safety is now in progress. Starting with current source/test range verification for dirty-tree-overlapping deterministic edit files before choosing the first minimal implementation batch. M0 tracker remains the controlling triage artifact for local-CLI classifications.


<!-- update_plan_status:appended -->
## M1 first implementation batch validation — 2026-07-01T06:18:32.141Z

Implemented the first M1 local edit/state safety batch in `packages/agent-runtime/src/tools/handlers/tool/read-files.ts`, `packages/agent-runtime/src/get-file-reading-updates.ts`, and `packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts`.

Behavior changed:
- `read_files` no longer clears `failedEditRequiresReadByPath`, stale edit promises, or grants strict read authorization for paths that were requested but not successfully loaded.
- Range-only reads are included in the client `requestFiles.filePaths` request so tests/clients that key responses by requested paths can return current disk content for range reads.

Validation:
- `bun test packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts` passed.

Next checkpoint:
- Run file-change hooks / reviewer gate for this M1 batch, then continue M1 with the next minimal local filesystem/edit safety item if the gate passes.


<!-- update_plan_status:appended -->
## M1 expanded local edit-safety batch validation — 2026-07-01T06:21:58.057Z

Expanded the first M1 batch to include `write_file` traversal-path fail-closed behavior.

Files changed:
- `packages/agent-runtime/src/tools/handlers/tool/read-files.ts`
- `packages/agent-runtime/src/get-file-reading-updates.ts`
- `packages/agent-runtime/src/tools/handlers/tool/write-file.ts`
- `packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts`

Behavior changed:
- `read_files` only clears stale edit gates/promises and grants strict read authorization for paths that actually load successfully.
- Range-only reads are included in `requestFiles.filePaths`, preserving current-content recovery for ranged reads.
- `write_file` now returns a structured traversal error before disk reads, promise registration, or client apply when `normalizeToolPath()` rejects a path.

Validation:
- `bun test packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts` passed after the expanded batch.

Next checkpoint:
- Run file-change hooks and reviewer gate for the expanded M1 batch.


<!-- update_plan_status:appended -->
## M1 first edit-safety batch validation — 2026-07-01T06:34:20.752Z

Focused validation passed: `bun test packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts` exited 0. Current M1 batch covers read_files failed-read gating, range-only read loading, changed-since-last-read notices after same-turn edits, and write_file traversal short-circuiting before client reads/applies. Next checkpoint: run configured hooks/reviewer for changed M1 files, then continue remaining M1 path-containment/edit-safety items if the gate passes.


<!-- update_plan_status:appended -->
## M1 first edit-safety batch reviewer blocker resolved — 2026-07-01T06:41:15.013Z

Resolved reviewer BLOCKING finding: symbol-only `read_files` calls now count as successful reads when `requestOptionalFile` loads content, clearing failed-edit gates and granting strict read-before-edit authorization for that path. Added regression coverage for symbol-only reads. Validation after the fix passed: `bun test packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts` exited 0; configured hook `cd packages/agent-runtime && bun run typecheck` exited 0; reviewer verdict `LOOKS_GOOD`. Next checkpoint: continue remaining M1 local filesystem/edit-safety work, especially project-boundary/path-containment contracts for `run_terminal_command.cwd`, `code_search.cwd`, `read_outline`, file/edit tools, and gate paths.


<!-- update_plan_status:appended -->
## M1 broader agent-runtime validation — 2026-07-01T06:45:16.478Z

Broader agent-runtime validation passed after the M1 edit-safety batch: `cd packages/agent-runtime && bun run typecheck && bun run test` exited 0. Initial attempt with `bun --cwd packages/agent-runtime run ...` printed Bun usage/help rather than running scripts; rerun with `cd packages/agent-runtime && ...` was the valid command. No failing tests or type errors were reported.


<!-- update_plan_status:appended -->
## M1 path-containment checkpoint started — 2026-07-01 — 2026-07-01T23:28:18.930Z

Resuming M1. Next checkpoint focuses on the path-containment contracts for `run_terminal_command.cwd`, `code_search.cwd`, `read_outline`, file/edit tools, and gate paths. First, re-read current source ranges for each surface to verify which tools promise project-root containment and which intentionally accept explicit absolute/user-selected paths, then identify a minimal containment fix.


<!-- update_plan_status:appended -->
## M1 path-containment checkpoint complete — 2026-07-01 — 2026-07-01T23:34:05.241Z

Completed M1 path-containment checkpoint for the `run_terminal_command.cwd` and `read_outline.path` surfaces.

Files changed:
- `sdk/src/tools/run-terminal-command.ts` — `cwd` is now run through `resolveFilePathWithinProject(cwd, '.')` before any child process is spawned. Both SYNC and BACKGROUND paths fail fast with a structured `{ command, errorMessage: "Invalid cwd: Path '<cwd>' is outside the project directory." }` result. The helper enforces lexical + realpath/symlink containment, so a user-supplied `/etc`, `../../outside`, or a symlinked escape cannot reach a child process.
- `packages/agent-runtime/src/tools/handlers/tool/read-outline.ts` — added a local `isPathInsideProject` helper (lexical + realpath, mirroring the SDK helper semantics; the package can't cross-import the SDK). `handleReadOutline` now rejects absolute paths and `..` traversal with the legacy `'Error: File does not exist.'` message so the tool-call contract stays stable for the runtime.
- `packages/agent-runtime/src/__tests__/read-outline-slices.test.ts` — added 3 regression tests under `read_outline path containment`: absolute-path rejection, parent-traversal rejection, and a positive case that project-relative paths still load.
- `sdk/src/__tests__/run-terminal-command.test.ts` (new file) — added 4 regression tests under `runTerminalCommand cwd containment`: absolute-path rejection, parent-traversal rejection, BACKGROUND-process rejection, and command-field preservation in the error result.

Validation:
- `bun test src/__tests__/read-outline-slices.test.ts` (cd packages/agent-runtime): 7/7 pass.
- `bun test src/__tests__/run-terminal-command.test.ts` (cd sdk): 4/4 pass.
- `bun run typecheck` (cd packages/agent-runtime): exit 0.
- `bun run typecheck` (cd sdk): exit 0.

Notes:
- `code_search.cwd` already had a lexical `startsWith(projectRoot + path.sep)` containment check; left unchanged for this checkpoint to keep the batch small. A future M1 batch can upgrade it to the shared realpath-aware helper for consistency with `list_directory` and `glob`.
- `gate-paths.ts` already rejects `..` segments lexically before normalization. No change needed for this checkpoint.

Next checkpoint: either continue M1 with `code_search.cwd` realpath upgrade + symlink regression tests, or move on to the M2 cancellation / local process reliability milestone.


<!-- update_plan_status:appended -->
## M1+M2 followup checkpoint — common/ helper + code_search symlink containment + AbortSignal threading — 2026-07-01 — 2026-07-01T23:52:22.110Z

Completed the three suggested followups from the M1 path-containment checkpoint.

**1. Promoted isPathInsideProject to common/ (shared helper)**
- `common/src/util/project-path-containment.ts` (new): `isPathInsideProject` and `resolveProjectPath` — lexical + realpath/symlink containment matching the SDK `resolveFilePathWithinProject` contract. Cache-free (runtime consumers invoke once per tool call, not per file).
- `common/src/util/__tests__/project-path-containment.test.ts` (new): 14 cases including symlink escape, sibling-directory prefix matches, and synthetic non-existent root fallback.
- Runtime `read_outline` refactored to import from `@codebuff/common/util/project-path-containment` (drops the inline duplicate noted in the M1 reviewer pass).

**2. Upgraded code_search.cwd to the realpath-aware helper**
- `sdk/src/tools/code-search.ts`: replaced the lexical `startsWith` check with `resolveFilePathWithinProject`; added a fast path for `cwd === projectRoot` since the helper returns null for the project root itself (empty relative path is treated as "not inside", which would have broken the `cwd: "."` happy path).
- `sdk/src/__tests__/code-search.test.ts`: added 2 symlink regression tests (escape rejected, in-project symlink allowed) plus 2 AbortSignal tests (already-aborted short-circuit, mid-flight kill).

**3. Threaded AbortSignal into run_terminal_command and code_search child process spawns**
- `sdk/src/tools/run-terminal-command.ts`: SYNC path now accepts an optional `signal`; on abort, SIGTERMs the child (with 5s SIGKILL escalation) and rejects with the signal's reason (or a generic `AbortError`). Background jobs are unaffected — caller can still `kill_job`.
- `sdk/src/tools/code-search.ts`: `signal` param added; short-circuits without spawning when already-aborted; SIGTERMs ripgrep on mid-flight abort; resolves with `errorMessage` from `signal.reason` (or `'Aborted'` if no reason).
- `sdk/src/run.ts`: `signal` plumbed from `RunOptions` through `handleToolCall` to both tool-dispatch branches (added `signal?: AbortSignal` to the `handleToolCall` param type).

**Validation**
- `bun test sdk/src/__tests__/code-search.test.ts src/__tests__/run-terminal-command.test.ts`: 40/40 pass (incl. 4 new tests).
- `bun test packages/agent-runtime/src/__tests__/read-outline-slices.test.ts`: 7/7 pass.
- `bun test common/src/util/__tests__/project-path-containment.test.ts`: 14/14 pass.
- `bun run typecheck` in `sdk` and `packages/agent-runtime`: exit 0.

**Next checkpoint (proposed)**
- Code review by independent reviewer (current M1+M2 batch has no reviewer pass yet).
- Consider also threading `signal` into the SDK's other child-spawning tools (`find_files_matching_content`, `apply-patch` shell exec if any) for full coverage.
- M3+ work from the original plan.


<!-- update_plan_status:appended -->
## M1+M2 reviewer-fix batch complete — 2026-07-02 — 2026-07-02T00:11:33.492Z

Resolved all three remaining reviewer follow-up notes from the M1+M2 pass.

**1. realpathOrLexical consolidation (reviewer A)**
- `common/src/util/project-path-containment.ts` is now the canonical implementation: `isPathInsideProject`, `resolveProjectPath`, `getProjectPathLookupKeys`, and `ContainedProjectPath`. Includes the per-project-root realpath cache (`projectRootRealpathCache`) and the synthetic-root fallback (matches the SDK contract exactly). Also added a `..config` regression test guard by anchoring the lexical check to `'..' + path.sep` instead of `startsWith('..')` (which would have over-rejected file names starting with two dots).
- `sdk/src/tools/path-utils.ts` is now a thin re-export of the common/ helpers (preserves the SDK's public API surface: `resolveFilePathWithinProject`, `ResolvedProjectPath`, `getProjectPathLookupKeys`, `isPathInsideProject`).
- `sdk/src/__tests__/path-utils.test.ts` updated to use `toMatchObject` so the new `realFullPath` field is accepted by the success-case assertions without breaking the rejection-case `toBeNull` checks.

**2. run-terminal-command TDZ hoist (reviewer B)**
- `sdk/src/tools/run-terminal-command.ts`: `let timer`, `let processFinished`, `let stdout`, `let stderr` are now declared *before* the `if (signal)` block. The abort listener (`onAbort`) and the abort-already short-circuit can now safely read those bindings even if a future refactor moves the listener registration earlier. Added a comment explaining the ordering invariant.

**3. read_outline projectRoot from session context (reviewer C)**
- `packages/agent-runtime/src/tools/handlers/tool/read-outline.ts`: switched from `process.cwd()` to `fileContext.projectRoot` (the agent session carries the canonical project root, not the working directory). The handler's params type now declares `fileContext: ProjectFileContext`.
- `packages/agent-runtime/src/__tests__/read-outline-slices.test.ts`: pre-existing handler tests and the 3 new containment tests all updated to pass `fileContext: { projectRoot: '/repo' }` so the synthetic-root lexical containment works deterministically.

**Validation**
- `bun test src/__tests__/path-utils.test.ts src/__tests__/code-search.test.ts src/__tests__/run-terminal-command.test.ts` (cd sdk): 51/51 pass.
- `bun test src/__tests__/read-outline-slices.test.ts` (cd packages/agent-runtime): 7/7 pass.
- `bun test src/util/__tests__/project-path-containment.test.ts` (cd common): 14/14 pass.
- `bun run typecheck` in `common`, `sdk`, `packages/agent-runtime`: all exit 0.

**Next checkpoint**
- Independent code review of the reviewer-fix batch (no reviewer pass yet for this delta).
- Continue M2 followups: thread `signal` into remaining SDK child-spawning tools (`find_files_matching_content`, `apply-patch` shell exec if any) for full coverage parity.
- M3+ work from the original plan.


<!-- update_plan_status:appended -->
## Final reviewer pass — 2026-07-02 — 2026-07-02T00:15:30.000Z — 2026-07-02T00:14:15.738Z

Final reviewer pass on the reviewer-fix batch returned `NON_BLOCKING` with 5 follow-up notes (logged in LESSONS.md): `isPathInsideProject` could short-circuit the realpath step on the hot path; the `split(path.sep).includes('..')` check is redundant; `run-terminal-command` already-aborted short-circuit could destroy the child handle for tidiness; `codeSearch` JSDoc could explain the resolve-vs-reject asymmetry; and the `read-outline.ts` `fileContext` type should be hoisted to a top-of-file import. All five are pure optimizations or documentation tidy-ups; no behavioral fixes. The reviewer-fix batch is fully closed.

Next checkpoint (cumulative across the session):
- Independent code review of the full M1+M2 delta (the original M1+M2 batch has no independent reviewer pass yet; the reviewer-fix batch is reviewed and passed).
- Continue M2 followups: thread `signal` into remaining SDK child-spawning tools (`find_files_matching_content`, `apply-patch` shell exec if any) for full coverage parity.
- Pick up the 5 NON_BLOCKING reviewer notes when convenient.
- M3+ work from the original plan.

