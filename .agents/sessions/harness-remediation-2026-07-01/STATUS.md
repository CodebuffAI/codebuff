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
- [~] M4 — Registry, schema, API/ABI alignment (retained as local tool/schema/config contract alignment) (M4 scoped: tool registry/SDK dispatch/ToolHelpers/agent declarations/hasNoValidation/setup/read_docs surfaces identified)
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


<!-- update_plan_status:appended -->
## M2 cancellation follow-up resumed — 2026-07-02T06:28:43.713Z

Resumed from injected durable artifacts. Current checkpoint: confirm remaining SDK child-spawning surfaces after prior AbortSignal work in `run_terminal_command` and `code_search`, then implement the smallest cancellation parity batch if any gaps remain.


<!-- update_plan_status:appended -->
## M2 foreground child-process cancellation follow-up validation — 2026-07-02 — 2026-07-02T06:37:35.005Z

Completed the focused M2 cancellation follow-up for remaining SDK foreground ripgrep usage.

Files changed:
- `sdk/src/tools/find-files-matching-content.ts` — added optional `signal?: AbortSignal`; already-aborted signals now short-circuit before spawning ripgrep; mid-flight aborts settle with `{ errorMessage }` and SIGTERM the ripgrep child.
- `sdk/src/run.ts` — forwards the SDK run signal into `findFilesMatchingContent` dispatch.
- `sdk/src/__tests__/find-files-matching-content.test.ts` — added already-aborted and mid-flight abort regression tests.

Scope decision:
- `apply_patch` has no child process in the SDK implementation.
- `background-jobs` and `browser-logs` intentionally manage long-lived processes outside this foreground cancellation path.
- `git_status` uses short-lived git child processes but is not yet threaded through the SDK run signal; leave for a later M2 sweep if broader git helper cancellation is needed.

Validation:
- `cd sdk && bun test src/__tests__/find-files-matching-content.test.ts src/__tests__/code-search.test.ts src/__tests__/run-terminal-command.test.ts`: 51/51 pass.
- `cd sdk && bun run typecheck`: pass.

Next checkpoint:
- Run configured file-change hooks / reviewer gate for `sdk/src/tools/find-files-matching-content.ts`, `sdk/src/run.ts`, and `sdk/src/__tests__/find-files-matching-content.test.ts`.


<!-- update_plan_status:appended -->
## M2 foreground cancellation follow-up hook validation — 2026-07-02 — 2026-07-02T07:00:49.435Z

Configured file-change hooks for the focused SDK cancellation batch passed.

Files checked:
- `sdk/src/tools/find-files-matching-content.ts`
- `sdk/src/run.ts`
- `sdk/src/__tests__/find-files-matching-content.test.ts`

Hook result:
- `cd sdk && bun run typecheck`: pass.

Next checkpoint:
- Independent code review of the focused M2 cancellation delta, then either address blockers or close this checkpoint and move to the next M2/M3 item.


<!-- update_plan_status:appended -->
## M2 foreground cancellation follow-up reviewed — 2026-07-02 — 2026-07-02T07:05:57.715Z

Independent code review of the focused M2 cancellation delta passed with `LOOKS_GOOD`.

Reviewed files:
- `sdk/src/tools/find-files-matching-content.ts`
- `sdk/src/run.ts`
- `sdk/src/__tests__/find-files-matching-content.test.ts`

Reviewer summary:
- Already-aborted and mid-flight abort paths are covered.
- Abort settlement happens before killing the ripgrep child, avoiding close-event races.
- Abort listeners are removed on settle.
- SDK dispatch forwards `signal` correctly.

Next checkpoint:
- Continue M2 with the next remaining child-spawning/cancellation surface, likely short-lived SDK git helper cancellation, unless source verification shows it is out of dispatch scope.


<!-- update_plan_status:appended -->
## M2 git_status cancellation validation — 2026-07-02 — 2026-07-02T07:10:25.315Z

Completed the focused M2 cancellation follow-up for the SDK `git_status` foreground git process.

Files changed:
- `sdk/src/tools/git-status.ts` — added optional `signal?: AbortSignal` to `runGit` and `gitStatus`; already-aborted signals short-circuit before spawning `git`; mid-flight aborts settle with an error result and SIGTERM the git child.
- `sdk/src/run.ts` — forwards the SDK run signal into `gitStatus` dispatch.
- `sdk/src/__tests__/git-status.test.ts` — added already-aborted and mid-flight abort regression tests.

Validation:
- `cd sdk && bun test src/__tests__/git-status.test.ts src/__tests__/find-files-matching-content.test.ts src/__tests__/code-search.test.ts src/__tests__/run-terminal-command.test.ts`: 53/53 pass.
- `cd sdk && bun run typecheck`: pass.

Next checkpoint:
- Run configured file-change hooks / reviewer gate for the focused M2 cancellation files.


<!-- update_plan_status:appended -->
## M2 git_status reviewer blocker — 2026-07-02 — 2026-07-02T07:12:08.972Z

Independent review found one BLOCKING issue in the focused M2 `git_status` cancellation delta:

- `runGit` handles child `'error'` events but not synchronous `spawn('git', ...)` throws. A synchronous spawn exception would reject instead of resolving to the existing git tool error-result shape.

Next action:
- Wrap the `spawn` call in `try/catch`, resolve `{ stdout: '', stderr: error.message, exitCode: -1 }`, add regression coverage, then rerun the same focused validation and review.


<!-- update_plan_status:appended -->
## M2 git_status reviewer blocker fixed — 2026-07-02 — 2026-07-02T07:14:35.427Z

Resolved the reviewer BLOCKING finding for the focused M2 `git_status` cancellation delta.

Fix:
- `sdk/src/tools/git-status.ts#runGit` now catches synchronous `spawn('git', ...)` throws and resolves to the existing `{ stdout: '', stderr, exitCode: -1 }` result shape instead of rejecting.
- `sdk/src/__tests__/git-status.test.ts` now covers synchronous spawn failure.
- Nullable `child.stdout` / `child.stderr` streams are guarded with optional chaining to satisfy Node child-process typings.

Validation after fix:
- `cd sdk && bun test src/__tests__/git-status.test.ts src/__tests__/find-files-matching-content.test.ts src/__tests__/code-search.test.ts src/__tests__/run-terminal-command.test.ts`: 54/54 pass.
- `cd sdk && bun run typecheck`: pass.

Next checkpoint:
- Run configured file-change hooks for the focused M2 files, then rerun independent review.


<!-- update_plan_status:appended -->
## M2 find-files reviewer blocker — 2026-07-02 — 2026-07-02T07:16:19.774Z

Independent review found a new BLOCKING issue in the focused M2 cancellation delta:

- `sdk/src/tools/find-files-matching-content.ts` calls `spawn(rgPath, args, ...)` without a synchronous `try/catch`, so a sync spawn failure would reject instead of resolving to the tool's JSON `{ errorMessage }` result shape.

Next action:
- Wrap the ripgrep spawn call in `try/catch`, resolve a structured `{ errorMessage }` result, add a regression test, rerun focused SDK tests/typecheck and review.


<!-- update_plan_status:appended -->
## M2 focused validation — git_status/find_files cancellation — 2026-07-02T07:20:08.728Z

Focused M2 SDK cancellation validation passed after fixing nullable stream guards in `findFilesMatchingContent`.

Validated:
- `cd sdk && bun test src/__tests__/git-status.test.ts src/__tests__/find-files-matching-content.test.ts src/__tests__/code-search.test.ts src/__tests__/run-terminal-command.test.ts` — PASS, 55/55 tests.
- `cd sdk && bun run typecheck` — PASS.

Current checkpoint: run configured file-change hooks for `sdk/src/tools/find-files-matching-content.ts`, `sdk/src/run.ts`, `sdk/src/__tests__/find-files-matching-content.test.ts`, `sdk/src/tools/git-status.ts`, and `sdk/src/__tests__/git-status.test.ts`, then rerun review with the prior blockers explicitly resolved.


<!-- update_plan_status:appended -->
## M2 review blocker — findFilesMatchingContent async child error — 2026-07-02T07:21:24.478Z

Focused review returned BLOCKING: `findFilesMatchingContent` handles synchronous ripgrep spawn throws but lacks an async `childProcess.on('error')` handler. Required next action: add async child-process error handling that preserves the existing `{ errorMessage }` tool-result shape, add a regression test where mocked ripgrep emits `error` after spawn, then rerun focused SDK tests/typecheck/hooks/review.


<!-- update_plan_status:appended -->
## M2 focused validation — async ripgrep child error fix — 2026-07-02T07:22:48.907Z

Focused validation passed after adding async ripgrep child `error` handling to `findFilesMatchingContent`.

Validated:
- `cd sdk && bun test src/__tests__/git-status.test.ts src/__tests__/find-files-matching-content.test.ts src/__tests__/code-search.test.ts src/__tests__/run-terminal-command.test.ts` — PASS, 56/56 tests.
- `cd sdk && bun run typecheck` — PASS.

Next checkpoint: run configured file-change hooks for the focused M2 file set and rerun review with prior blockers listed as resolved.


<!-- update_plan_status:appended -->
## M2 review blocker — duplicate findFilesMatchingContent error handlers — 2026-07-02T07:24:34.409Z

Focused review returned BLOCKING: `findFilesMatchingContent` now has duplicate `childProcess.once('error')` handlers; the new generic handler makes the existing actionable ripgrep-specific error message unreachable. Required next action: remove the duplicate handler, preserve one intended error path, update the async-error regression assertion, then rerun focused SDK tests/typecheck/hooks/review.


<!-- update_plan_status:appended -->
## M2 focused validation — duplicate error handler blocker fixed — 2026-07-02T07:25:59.864Z

Focused validation passed after removing the duplicate generic `findFilesMatchingContent` child `error` handler and preserving the existing actionable ripgrep-specific error message.

Validated:
- `cd sdk && bun test src/__tests__/git-status.test.ts src/__tests__/find-files-matching-content.test.ts src/__tests__/code-search.test.ts src/__tests__/run-terminal-command.test.ts` — PASS, 56/56 tests.
- `cd sdk && bun run typecheck` — PASS.

Next checkpoint: run configured hooks for the focused M2 file set and rerun review with the duplicate-handler blocker listed as resolved.


<!-- update_plan_status:appended -->
## M2 review passed — focused SDK cancellation delta — 2026-07-02T07:27:13.795Z

Focused review passed after the duplicate `findFilesMatchingContent` child-error handler was removed and the actionable ripgrep-specific error path was preserved.

Final validation for this checkpoint:
- Focused SDK tests: PASS, 56/56.
- SDK typecheck: PASS.
- Configured file-change hook `typecheck-sdk`: PASS.
- Code review: LOOKS_GOOD.

Completed focused M2 batch:
- `findFilesMatchingContent` accepts `AbortSignal`, short-circuits already-aborted calls, kills the ripgrep child on mid-flight abort, handles synchronous spawn throws, and preserves async ripgrep child-error diagnostics.
- SDK tool dispatch forwards the run `signal` into `find_files_matching_content` and `git_status`.
- `gitStatus`/`runGit` accept optional `AbortSignal`, short-circuit already-aborted calls, kill git on mid-flight abort, and preserve existing error-result shape for synchronous spawn failures.
- Regression coverage added for cancellation, sync spawn throws, and async child errors.

Next checkpoint: continue M2 with the next cancellation/process surface from the durable plan (for example remaining provider/model-discovery/retry-sleep or CLI ownership surfaces), after verifying current source contracts before editing.


<!-- update_plan_status:appended -->
## M2 retry-sleep cancellation checkpoint — 2026-07-02 — 2026-07-02T07:32:36.875Z

Implemented a minimal abortable retry-delay fix for SDK LLM stream retries: `promptAiSdkStream` now waits via `waitForBackoffDelay({ delayMs, signal })` instead of an unabortable `setTimeout`, so user cancellation interrupts retry backoff promptly while preserving normal retry behavior.

Focused validation passed:
- `cd sdk && bun test src/__tests__/retry-config.test.ts src/__tests__/git-status.test.ts src/__tests__/find-files-matching-content.test.ts src/__tests__/code-search.test.ts src/__tests__/run-terminal-command.test.ts` — 68/68 pass
- `cd sdk && bun run typecheck` — pass

Next checkpoint: run configured file-change hooks for the full pending M2 file set and request focused code review.


<!-- update_plan_status:appended -->
## M2 retry-sleep reviewer blocker — 2026-07-02 — 2026-07-02T07:34:42.919Z

Reviewer found a blocking race in `waitForBackoffDelay`: the signal can abort after timer creation but before the abort listener is registered, causing the retry sleep to wait the full delay. Next action: add a post-listener `signal.aborted` check with cleanup/reject and targeted regression coverage.


<!-- update_plan_status:appended -->
## M2 retry-sleep blocker resolved — 2026-07-02 — 2026-07-02T07:37:18.115Z

Resolved the reviewer-blocking abort race in `waitForBackoffDelay`: after registering the abort listener, the helper now re-checks `signal.aborted` and runs the same cleanup/reject path if the signal aborted during setup. Added regression coverage that aborts during timer setup.

Focused validation passed after the fix:
- `cd sdk && bun test src/__tests__/retry-config.test.ts src/__tests__/git-status.test.ts src/__tests__/find-files-matching-content.test.ts src/__tests__/code-search.test.ts src/__tests__/run-terminal-command.test.ts` — 69/69 pass
- `cd sdk && bun run typecheck` — pass

Next checkpoint: rerun configured file-change hooks and focused review.


<!-- update_plan_status:appended -->
## M2 SDK cancellation batch approved — 2026-07-02 — 2026-07-02T07:38:18.187Z

Focused M2 SDK cancellation batch is validated and review-approved.

Covered surfaces:
- `find_files_matching_content`: SDK dispatch forwards `AbortSignal`; already-aborted calls short-circuit; mid-flight abort kills ripgrep; synchronous spawn throws and async child errors return structured error results.
- `git_status`: SDK dispatch forwards `AbortSignal`; already-aborted calls short-circuit; mid-flight abort kills git; synchronous spawn throws preserve the existing structured error-result shape.
- LLM stream retry backoff: `promptAiSdkStream` uses `waitForBackoffDelay({ delayMs, signal })`; the helper handles already-aborted, mid-delay abort, and abort-during-setup race paths.

Validation:
- Focused SDK tests: 69/69 pass.
- SDK typecheck: pass.
- Configured file-change hook `typecheck-sdk`: pass.
- Focused code review: LOOKS_GOOD.

Next checkpoint: continue M2 by scoping the next provider/model-discovery cancellation surface, preserving current local/BYOK behavior.


<!-- update_plan_status:appended -->
## M2 model-discovery cancellation checkpoint — 2026-07-02T07:42:18.587Z

Implemented optional `AbortSignal` forwarding for `discoverProviderModels`; added focused coverage that verifies fetch receives the signal and fetch aborts propagate. Focused validation passed: `cd sdk && bun test src/__tests__/model-provider.test.ts src/__tests__/retry-config.test.ts src/__tests__/git-status.test.ts src/__tests__/find-files-matching-content.test.ts src/__tests__/code-search.test.ts src/__tests__/run-terminal-command.test.ts` (exit 0) and `cd sdk && bun run typecheck` (exit 0).


<!-- update_plan_status:appended -->
## M2 model-discovery cancellation review approved — 2026-07-02T07:43:54.947Z

Focused review passed (`LOOKS_GOOD`) after validation. Current M2 cancellation batch now includes foreground child-process cancellation, abortable retry sleep, and model-discovery fetch signal forwarding with targeted regression coverage.


<!-- update_plan_status:appended -->
## M2 check_job validation — 2026-07-02T07:48:45.385Z

Focused validation passed for the pending cancellation/check_job batch. SDK: targeted tests (`model-provider`, `retry-config`, `git-status`, `find-files-matching-content`, `code-search`, `run-terminal-command`) passed and `bun run typecheck` passed. Agent-runtime: `src/tools/handlers/tool/__tests__/check-job.test.ts` passed and `bun run typecheck` passed after typing the mock client tool callback.


<!-- update_plan_status:appended -->
## M2 check_job review approved — 2026-07-02T07:49:58.241Z

Focused review passed (`LOOKS_GOOD`) for the pending cancellation/check_job batch after green focused validation and configured hooks. The runtime `check_job.kill_on_timeout` forwarding fix is approved with handler-level regression coverage.


<!-- update_plan_status:appended -->
## M2 CLI ownership validation — 2026-07-02T07:54:58.725Z

Focused validation passed for the CLI stale-owner checkpoint: `cd cli && bun test src/hooks/helpers/__tests__/send-message.test.ts` (40/40), `cd cli && bun run typecheck`, SDK targeted cancellation tests/typecheck, and agent-runtime `check-job` test/typecheck are green. Added `createRunOwnership` and wired `useSendMessage` checkpoint/final persistence/finally cleanup through per-run ownership + abort checks so stale completions cannot clobber newer run state.


<!-- update_plan_status:appended -->
## Reviewer blocker — CLI provider readiness owner release — 2026-07-02T07:56:18.541Z

BLOCKING review finding: `useSendMessage` provider-readiness early return inside the streaming `try` did not call `releaseRunOwner()`, so it could leave `activeRunOwnerRef.current` pointing at a completed/failed run. Next action: add the missing release and focused coverage for current-owner release on early-return cleanup.


<!-- update_plan_status:appended -->
## Reviewer blocker resolved — provider readiness owner release — 2026-07-02T07:57:39.428Z

Resolved the focused review blocker by calling `releaseRunOwner()` on the `!providerReadiness.ok` early return in `useSendMessage`. Added `createRunOwnership` coverage proving early-return cleanup releases the current owner. Reran focused validation: CLI `send-message.test.ts` 41/41, CLI typecheck, SDK targeted tests/typecheck, and agent-runtime check-job test/typecheck all pass.


<!-- update_plan_status:appended -->
## Reviewer blocker — provider-readiness branch coverage — 2026-07-02T07:58:52.249Z

Second focused review blocker: although `releaseRunOwner()` is now called in the provider-readiness early return, coverage only tested the generic ownership helper, not the provider-readiness cleanup semantics/branch. Required next action: extract provider-readiness cleanup into a small helper used by `useSendMessage`, test that helper releases queue/chain/owner state, and update the stale abort-flow comment.


<!-- update_plan_status:appended -->
## Reviewer blocker resolved — provider-readiness cleanup coverage — 2026-07-02T08:00:56.174Z

Resolved the provider-readiness branch coverage blocker by extracting `cleanupProviderReadinessFailure`, wiring `useSendMessage` to it, adding direct coverage that it sets the user error, stops the timer, releases queue/chain locks, and releases run ownership, and updating the stale abort-flow comment. Reran CLI focused validation: `cd cli && bun test src/hooks/helpers/__tests__/send-message.test.ts` passes 42/42 and `cd cli && bun run typecheck` passes.


<!-- update_plan_status:appended -->
## M2 CLI ownership checkpoint approved — 2026-07-02T08:06:40.659Z

Focused review passed (`LOOKS_GOOD`) after resolving the provider-readiness cleanup coverage blocker. Current validated gate: CLI send-message ownership tests pass 42/42, CLI typecheck passes, configured hooks pass (`typecheck-sdk`, `typecheck-cli`, `typecheck-agent-runtime`), and prior SDK/agent-runtime focused validation in this checkpoint remains green. The CLI stale-owner checkpoint is complete: late checkpoints/final persistence/finally cleanup are guarded by per-run ownership + AbortSignal checks, provider-readiness early return cleanup is centralized and covered, and stale abort-flow comments are updated.


<!-- update_plan_status:appended -->
## M2 queue watchdog blocker resolution — 2026-07-02T08:15:17.416Z

Resolved reviewer blocker: extracted the real queued-send cleanup path into `runQueuedMessage`, wired `useMessageQueue.processNextMessage` through it, and added focused tests that execute stale `.finally()` and stale watchdog callbacks to verify they cannot clear a newer processing lock/timer. Focused validation passed: `cd cli && set -o pipefail && bun test src/hooks/__tests__/use-queue-controls.test.ts`, `cd cli && set -o pipefail && bun test src/hooks/helpers/__tests__/send-message.test.ts`, and `cd cli && bun run typecheck`.


<!-- update_plan_status:appended -->
## M2 queue ownership checkpoint — 2026-07-02T08:22:00.308Z

Completed the remaining CLI queue/watchdog/streamMessageId abort-cleanup checkpoint. The `useMessageQueue` queue-processing lifecycle now uses an extracted `runQueuedMessage` path with owner-token guarded completion/watchdog cleanup, lock acquisition before queue mutation, and focused coverage that invokes real stale `.finally()` and captured stale watchdog callbacks after a newer queued send starts.

Validation:
- `cd cli && set -o pipefail && bun test src/hooks/__tests__/use-queue-controls.test.ts 2>&1 | tail -220` passed (8 pass).
- `cd cli && set -o pipefail && bun test src/hooks/helpers/__tests__/send-message.test.ts 2>&1 | tail -220` passed (42 pass).
- `cd cli && bun run typecheck` passed.
- Configured hooks passed: `typecheck-sdk`, `typecheck-cli`, `typecheck-agent-runtime`.
- Focused code review passed: `LOOKS_GOOD`, confirming real stale `.finally()` and captured stale watchdog callback coverage.


<!-- update_plan_status:appended -->
## Eval timeout review blocker — 2026-07-02T08:32:54.761Z

Focused review found a blocking cleanup-seam issue: `runWithTimeoutSignal` calls `operation(controller.signal)` before entering `withTimeout`, so synchronous operation throws bypass the timeout wrapper semantics. Next action: wrap the operation in `Promise.resolve().then(...)` and add sync-throw coverage.


<!-- update_plan_status:appended -->
## Eval timeout cleanup checkpoint approved — 2026-07-02T08:34:09.680Z

Completed eval timeout cleanup checkpoint. `runAgentOnCommit` now uses `runWithTimeoutSignal` so the 60-minute eval timeout aborts the exact signal passed to runner execution and final-check commands. Runner interfaces and implementations accept `RunnerOptions.signal`; final-check commands receive the same signal and preserve `FinalCheckOutput` shape on abort. Focused validation passed: `cd evals && set -o pipefail && bun test buffbench/__tests__/agent-runner.test.ts` (3 tests) and `cd evals && bun run typecheck`. Configured hooks skipped because eval files have no matching hook. Focused review passed `LOOKS_GOOD` after adding timeout-to-runner signal coverage and synchronous setup failure normalization.


<!-- update_plan_status:appended -->
## Eval external runner abort checkpoint — 2026-07-02T08:44:44.369Z

Resolved the reviewer blocker for external spawned runner abort behavior. Added focused in-flight fake `ClaudeRunner` coverage that waits for the spawned fake CLI readiness marker before aborting, verifies abort is not misclassified as startup failure, and verifies abort close handling does not run normal diff cleanup that would stage a dirty marker. Validation passed: `cd evals && set -o pipefail && bun test buffbench/__tests__/agent-runner.test.ts 2>&1 | tail -280` (5 pass, 0 fail) and `cd evals && bun run typecheck 2>&1 | tail -260`. Configured hooks skipped because none matched eval files. Focused review passed: `LOOKS_GOOD`.


<!-- update_plan_status:appended -->
## M2 reconciliation checkpoint — 2026-07-02T08:49:23.373Z

Reconciled durable M2 state after approved cancellation/ownership/eval batches. PLAN now marks verified SDK child-process cancellation, LLM retry-sleep cancellation, model-discovery abort forwarding, runtime `check_job`, CLI send/queue ownership, and eval timeout/external-runner abort work complete, while leaving unverified local cancellation-contract documentation, custom/runtime client-tool dispatch forwarding, and background-job contract coverage as pending. Tracker rows now reflect approved M2 status for CLI ownership, eval timeout/final-check cleanup, `check_job.kill_on_timeout`, model-discovery abort forwarding, and overall cancellation propagation. Next checkpoint: scope the residual M2 cancellation contract/custom-runtime/background-job edge surfaces before moving to M1 or M3.


<!-- update_plan_status:appended -->
## Residual M2 client/custom tool cancellation checkpoint — 2026-07-02T08:58:57.277Z

Completed the residual M2 signal-forwarding sweep.

- Confirmed background `check_job` timeout semantics are already wired/documented.
- Confirmed the remaining concrete gap was client/custom tool cancellation observability.
- Added optional `signal?: AbortSignal` to runtime `RequestToolCallFn` dispatch.
- Forwarded the run signal through native `requestClientToolCall`, runtime custom/MCP client-tool dispatch, SDK custom-tool handlers, and SDK MCP `callMCPTool` request options.
- Added optional SDK `CustomToolExecutionContext` with `signal` for custom tool handlers while preserving backwards-compatible one-argument handlers.
- Added focused coverage:
  - `sdk/src/__tests__/run-handle-event.test.ts` verifies SDK custom tools receive the run signal in context.
  - `sdk/src/__tests__/run-handle-event.test.ts` verifies SDK MCP tool calls pass the run signal to `callMCPTool` request options.
  - `packages/agent-runtime/src/__tests__/tool-validation-error.test.ts` verifies runtime custom-tool dispatch passes the run signal to `requestToolCall`.
- Validation passed:
  - `cd sdk && bun test src/__tests__/run-handle-event.test.ts` (4 pass)
  - `cd packages/agent-runtime && bun test src/__tests__/tool-validation-error.test.ts`
  - `cd common && bun run typecheck`
  - `cd sdk && bun run typecheck`
  - `cd packages/agent-runtime && bun run typecheck`
  - configured hooks: `typecheck-common`, `typecheck-sdk`, `typecheck-agent-runtime`
- Focused review passed after MCP blocker resolution: `LOOKS_GOOD`.

Next checkpoint: reconcile/close M2 or move to the next durable milestone.


<!-- update_plan_status:appended -->
## M2 closure — background-job timeout contract — 2026-07-02T09:28:48.162Z

Closed the remaining M2 cancellation/background-job timeout checkpoint.

Completed:
- Added focused SDK coverage in `sdk/src/__tests__/check-job.test.ts` for both `checkJob` follow-timeout branches:
  - default follow-timeout sends SIGTERM and reports `killed: true` for a still-running job;
  - `kill_on_timeout: false` leaves the running job alive and does not emit `killed`.
- Updated the tests after review to use schema-valid integer `timeout_seconds: 1` and deterministic fake `Date.now` instead of fractional timeout input or real waiting.
- Reconciled `PLAN.md` so M2 is marked done and the local cancellation contract is explicit: run-scoped SDK/runtime/eval work receives `AbortSignal`; background jobs remain running unless an explicit kill path or `check_job` follow-timeout cleanup applies.
- Reconciled `M0-LOCAL-TRIAGE-TRACKER.md` so cancellation propagation is approved/closed for M2.

Validation:
- `cd sdk && bun test src/__tests__/check-job.test.ts` — 12 pass.
- `cd sdk && bun run typecheck` — passed.
- configured hook `typecheck-sdk` — passed.
- focused review after deterministic timeout fix — `LOOKS_GOOD`.

Next checkpoint: move to M3 freshness/index/cache correctness unless the final gate reports a blocker.


<!-- update_plan_status:appended -->
## M3 freshness checkpoint — markStale query suppression — 2026-07-02T09:33:25.712Z

Implemented the first minimal M3 freshness fix: `IndexManager.query()` no longer serves ready-but-stale in-memory results after `markStale()` sets `forceRefresh`; it starts the refresh path and returns `ready: false` with empty results until the index refresh completes. Added focused coverage in `packages/indexer/src/index-manager.test.ts` using a real temporary project. Focused validation passed: `cd packages/indexer && bun test src/index-manager.test.ts` (3 pass) and `cd packages/indexer && bun run typecheck`.


<!-- update_plan_status:appended -->
## M3 freshness checkpoint — pending refresh race fixed — 2026-07-02T09:43:46.706Z

Resolved the reviewer-identified M3 race: `ensureBuilt()` previously cleared `forceRefresh` before `_build()` completed, allowing subsequent `query()` calls to serve the old ready index while refresh was still pending. Added `staleRefreshPending` so `query()` and `waitUntilReady()` keep treating the loaded index as not-ready until the refresh settles. Added focused repeated-query coverage in `packages/indexer/src/index-manager.test.ts` using the semantic embedder seam to hold refresh pending deterministically. Validation passed: `cd packages/indexer && bun test src/index-manager.test.ts` (4 pass) and `cd packages/indexer && bun run typecheck`; configured hooks passed (`typecheck-sdk`, `typecheck-indexer`).


<!-- update_plan_status:appended -->
## M3 command-mode freshness checkpoint — 2026-07-02T09:47:05.081Z

Added focused command-mode freshness coverage in `packages/indexer/src/index-manager.test.ts`: after a real temporary project builds command-mode results from `package.json`, updating scripts plus `markStale()` now suppresses stale command results until refresh completes, then returns the new package script snippet and not the removed script. Focused validation passed: `cd packages/indexer && bun test src/index-manager.test.ts` (5 pass) and `cd packages/indexer && bun run typecheck`.


<!-- update_plan_status:appended -->
## M3 same-size/same-mtime hash freshness checkpoint — 2026-07-02T09:50:05.903Z

Implemented the same-size/same-mtime freshness strategy in `packages/indexer/src/metadata-indexer.ts`: incremental `updateMetadataIndex()` now hashes current file contents before deciding whether an existing indexed file is unchanged, so content edits are detected even when filesystem metadata is unchanged. Added focused coverage in `packages/indexer/src/metadata-indexer.test.ts` that rewrites a file to the same size, restores the prior mtime at filesystem precision, and verifies the hash changes. Focused validation passed: `cd packages/indexer && bun test src/metadata-indexer.test.ts` (7 pass) and `cd packages/indexer && bun run typecheck`.


<!-- update_plan_status:appended -->
## M3 same-size/same-mtime coverage strengthened — 2026-07-02T09:51:48.333Z

Resolved the review coverage blocker for same-size/same-mtime freshness: the regression now uses a same-size Markdown edit and asserts reindexed metadata changes (`Alpha` heading/concept removed, `Bravo` heading/concept added), not just that the stored hash changed. Focused validation passed after the fix: `cd packages/indexer && bun test src/metadata-indexer.test.ts` (7 pass, 39 expect calls) and `cd packages/indexer && bun run typecheck`.


<!-- update_plan_status:appended -->
## M3 same-size/same-mtime blocker resolved — 2026-07-02T13:07:56.878Z

Resolved the reviewer blocker for incremental metadata hash-read failures. `updateMetadataIndex()` now tolerates hash/read failures for walked files by excluding failed paths from incremental token scoring and dropping stale metadata instead of crashing or poisoning refresh for other changed files. Focused validation passed: `cd packages/indexer && bun test src/metadata-indexer.test.ts`, `cd packages/indexer && bun run typecheck`, configured file-change hooks, and focused review (`LOOKS_GOOD: coverage: covered.`).


<!-- update_plan_status:appended -->
## M3 extension casing/language-table checkpoint complete — 2026-07-02T13:19:13.245Z

Closed the M3 extension normalization item. `code-map` now provides a frozen canonical supported-code-extension list derived from `languageTable`, language lookup normalizes extension casing, the indexer builds a private Set from that canonical list, and query `fileTypes` filters normalize dot prefixes/casing. Focused validation passed: `cd packages/code-map && bun test __tests__/languages.test.ts __tests__/languages-m7.test.ts`, `cd packages/code-map && bun run typecheck`, `cd packages/indexer && bun test src/metadata-indexer.test.ts src/query.test.ts`, `cd packages/indexer && bun run typecheck`, configured hooks, and focused review (`LOOKS_GOOD: coverage: covered.`). Next checkpoint: provider config cache invalidation for expanded `openbuff.d` fragments.


<!-- update_plan_status:appended -->
## Provider config cache checkpoint — 2026-07-02T13:31:04.344Z

Completed the M3 provider-config cache invalidation checkpoint. `loadProviderConfigSync()` now invalidates when expanded implicit `openbuff.d` fragments change or are added, and both dependency discovery plus the actual loader clean recursion stacks via `try/finally` so malformed repeated fragments cannot poison later traversal or be misclassified as cycles.

Validation passed:
- `cd sdk && bun test src/__tests__/model-provider.test.ts`
- `cd sdk && bun run typecheck`
- Configured hook: `typecheck-sdk`
- Focused review: `LOOKS_GOOD`


<!-- update_plan_status:appended -->
## Background job read-offset checkpoint — 2026-07-02T13:46:54.606Z

Completed the M3 background-job read-offset recovery checkpoint. SDK background job metadata now persists `readOffset`, recovered jobs clamp persisted offsets to the current log size, and invalid/missing offsets fall back to the beginning without replaying already-consumed output after recovery.

Validation passed:
- `cd sdk && bun test src/__tests__/check-job.test.ts` (15 tests, 34 expects)
- `cd sdk && bun run typecheck`
- Configured hook: `typecheck-sdk`
- Focused review after blocker fix: `LOOKS_GOOD`


<!-- update_plan_status:appended -->
## M3 gate/reviewer reuse freshness checkpoint — 2026-07-02T13:51:47.867Z

Completed the gate/reviewer reuse freshness checkpoint. Conversation `<gate-state>` reuse now requires the same fresh content/status/validation fingerprint match as durable pass reuse, so matching file names alone cannot bypass validation/review after local file content changes.

Validation passed:
- `cd agents && bun test __tests__/base2.test.ts e2e/reviewer-spawn-conditions.e2e.test.ts e2e/gate-lifecycle.e2e.test.ts`
- `cd agents && bun run typecheck`
- configured hook `typecheck-agents`
- focused code review returned `LOOKS_GOOD: coverage: covered.`

Next checkpoint: begin M4 local tool/schema/config contract alignment.


<!-- update_plan_status:appended -->
## Reviewer blocker resolved — static-review-only reviewer join — 2026-07-02T14:01:07.366Z

Resolved the blocking reviewer finding in the base2 static-review-only path. `check_background_agent` no longer waits only for `LOOKS_GOOD`; it waits for the background reviewer job result and lets the existing reviewer parser accept `LOOKS_GOOD`/`NON_BLOCKING` as passing verdicts or surface `BLOCKING` feedback promptly after the job returns.

Files changed:
- `agents/base2/base2.ts`
- `agents/__tests__/base2.test.ts`

Validation:
- `cd agents && bun test __tests__/base2.test.ts` exited 0.
- Configured hooks for the pending gate file set passed: `typecheck-sdk`, `typecheck-agents`, and `typecheck-indexer` all exited 0.

Next checkpoint: allow the automated reviewer gate to re-review the blocker resolution, then continue the durable plan from M4 tool/schema/config contract alignment if the gate passes.


<!-- update_plan_status:appended -->
## M4 scoped — local tool/schema/config contract surfaces — 2026-07-02T14:04:18.696Z

Completed M4 scoping for local tool/schema/config contract alignment.

Primary source surfaces:
- `common/src/tools/constants.ts` — canonical `toolNames` and `publishedTools` lists.
- `common/src/tools/list.ts` — canonical `toolParams`, `clientToolCallSchema`, and `clientToolNames`.
- `packages/agent-runtime/src/tools/handlers/list.ts` — runtime handler map; currently typed as exhaustive over `ToolName`.
- `sdk/src/run.ts` — SDK `handleToolCall` dispatch. It validates all canonical tool names with `clientToolCallSchema`, but only implements/overrides a subset and otherwise returns `Tool not implemented in SDK...`.
- `sdk/src/tools/index.ts` — exported SDK `ToolHelpers` surface; currently only exposes a small subset of SDK-local helpers.
- `agents/types/tools.ts` and `common/src/templates/initial-agents-dir/types/tools.ts` — generated agent-facing tool declarations.
- `scripts/check-tool-registration.ts` — readiness guard; useful but currently text-substring based and deterministic-edit-doc oriented.
- `agents/base2/base2.ts` — `hasNoValidation` option exists in prompts, while runtime gate currently derives from hard-coded ids.
- `sdk/src/provider-config.ts` and `cli/src/utils/openbuff-provider.ts` — `/setup` and config write/merge flow; current merge preserves routing fields and hooks but scoped follow-up should verify `failoverModels` and `maxAgentSteps` preservation.
- `common/src/tools/params/tool/read-docs.ts` — `max_tokens` schema default is `10_000`; description still says `Defaults to 20000`.

Existing tests to extend:
- `common/src/tools/__tests__/tool-registration-consistency.test.ts` — constants/list/generated type consistency.
- `agents/tool-reachability.test.ts` and `agents/__tests__/base2.test.ts` — agent tool exposure and gate behavior.
- `sdk/src/__tests__/run-*.test.ts` and/or a new focused SDK tool-dispatch consistency test — SDK dispatch/unsupported-tool behavior.
- `cli/src/utils/__tests__/openbuff-provider.test.ts` and `sdk/src/__tests__/model-provider.test.ts` — setup/provider config merge behavior.
- `common/src/tools/__tests__/compile-tool-definitions.test.ts` or a new common tool schema test — read_docs default/description drift.

Proposed first implementation batch:
1. Fix `read_docs.max_tokens` description to match the actual `10_000` default and add a schema/default regression.
2. Fix `hasNoValidation` runtime gate to derive from the factory option, with custom `createBase2('default', { hasNoValidation: true })` coverage.
3. Add a focused config merge regression preserving `failoverModels` and `maxAgentSteps` across `/setup`/`writeProviderConfigFile` merge.

Proposed second implementation batch:
1. Add/generated consistency checks across `ToolHelpers`, SDK dispatch, common `publishedTools`/`clientToolNames`, runtime handlers, and generated agent tool declarations.
2. Decide per-tool whether SDK-local unsupported public tools should gain dispatch, require client override, or be documented/typed as runtime-only.
3. Tighten `scripts/check-tool-registration.ts` away from incidental substring matches if still needed after table-driven tests.


<!-- update_plan_status:appended -->
## M4 first-batch validation — read_docs and hasNoValidation — 2026-07-02T14:08:49.867Z

Completed the first M4 contract-alignment batch:

- `read_docs` schema/default drift: updated the parameter description to match the schema default and added a regression in `common/src/tools/__tests__/tool-registration-consistency.test.ts`.
- `hasNoValidation` runtime gate semantics: `agents/base2/base2.ts` now derives validation/reviewer gates from the captured `hasNoValidation` option, with a serialized-handle fallback for legacy/generated handleSteps execution.
- Static-review-only reviewer join blocker remains resolved: `check_background_agent` joins without a `wait_for` token so LOOKS_GOOD, NON_BLOCKING, and BLOCKING verdicts all flow through the shared reviewer parser.

Validation:
- `cd common && bun test src/tools/__tests__/tool-registration-consistency.test.ts` passed.
- `cd agents && bun test __tests__/base2.test.ts` passed after adding the serialized fallback.
- Configured hooks passed: `typecheck-common`, `typecheck-sdk`, `typecheck-agents`, `typecheck-indexer`.


<!-- update_plan_status:appended -->
## M4 config merge preservation checkpoint — 2026-07-02T14:11:34.235Z

Completed `/setup` config merge preservation for run/failover options:

- `writeProviderConfigFile` now preserves existing `failoverModels` and `maxAgentSteps` when merging a new provider preset into an existing `openbuff.json`.
- Expanded the existing merge regression in `sdk/src/__tests__/model-provider.test.ts` to cover default routing, modes/agents, failover models, and max agent steps together.

Validation:
- `cd sdk && bun test src/__tests__/model-provider.test.ts` passed.
- Configured hooks for the touched SDK/common/agents files passed: `typecheck-common`, `typecheck-sdk`, `typecheck-agents`.

Next M4 checkpoint: registry/tool-surface consistency verification.


<!-- update_plan_status:appended -->
## Config merge checkpoint — 2026-07-02T15:21:47.952Z

Completed the config merge preservation checkpoint. The config merge work for `failoverModels` / `maxAgentSteps` has been implemented and the configured file-change hooks passed for the pending gate files (`typecheck-sdk`, `typecheck-agents`, `typecheck-indexer`). Next checkpoint: continue from the next incomplete durable plan item after this checkpoint.


<!-- update_plan_status:appended -->
## Config Merge Checkpoint — 2026-07-02T16:02:24.692Z

Config merge preservation checkpoint completed. The config merge changes for `failoverModels` / `maxAgentSteps` were implemented and validated. Configured file-change hooks passed for common, sdk, agents, and indexer, and the reviewer gate returned LOOKS_GOOD for the pending gate files.


<!-- update_plan_status:appended -->
## M4 registry drift checkpoint — read_docs generated type descriptions — 2026-07-02T16:09:29.419Z

Completed the smallest M4 registry/tool-surface consistency fix for the `read_docs.max_tokens` contract. The canonical schema/description already used the 10,000-token default, but the generated agent-facing tool type files still advertised `Defaults to 20000`. Updated both generated type surfaces and strengthened `common/src/tools/__tests__/tool-registration-consistency.test.ts` so future drift is caught in generated files as well as the canonical tool params.

Validation:
- `cd common && bun test src/tools/__tests__/tool-registration-consistency.test.ts` — pass (4 tests, 61 expects).
- Configured hooks for touched files — pass: `typecheck-common`, `typecheck-agents`.

Next checkpoint: continue M4 registry/tool-surface consistency verification across SDK dispatch/helpers, runtime handlers, agent declarations, and unsupported-tool behavior.


<!-- update_plan_status:appended -->
## M4 SDK Dispatch Helper Regression Completed — 2026-07-02T16:14:24.203Z

Completed M4 SDK dispatch/helper consistency checkpoint.

Validation:
- `cd sdk && bun test src/__tests__/run-handle-event.test.ts` passed: 6 tests, 15 expects.
- `cd common && bun test src/tools/__tests__/tool-registration-consistency.test.ts` passed: 4 tests, 61 expects.
- File-change hooks passed: `typecheck-common`, `typecheck-sdk`, `typecheck-agents`.

Implementation notes:
- SDK `overrideTools` now accepts every published tool name, not only natively dispatched client tools.
- Published tools without native SDK handlers now return the explicit SDK unsupported-tool error unless an override is supplied.
- Added regression coverage for `read_docs` override handling and unsupported-tool error behavior.


<!-- update_plan_status:appended -->
## Reviewer Blocker Resolved — 2026-07-02T16:18:18.702Z

Resolved reviewer blocker for SDK override validation boundary.

Fix:
- Added regression coverage for an overridden native client tool (`glob`) with invalid input.
- Confirmed the override is not called when `clientToolCallSchema` rejects malformed native client-tool input.

Validation:
- `cd sdk && bun test src/__tests__/run-handle-event.test.ts` passed: 7 tests, 19 expects.
- `cd common && bun test src/tools/__tests__/tool-registration-consistency.test.ts` passed: 4 tests, 61 expects.
- File-change hooks passed: `typecheck-common`, `typecheck-sdk`, `typecheck-agents`.


<!-- update_plan_status:appended -->
## M4 validation update — 2026-07-02T16:27:24.677Z

Completed focused validation for the generated agent tool declaration registry consistency regression.

Validation passed:
- `cd common && bun test src/tools/__tests__/tool-registration-consistency.test.ts` (4 pass, 0 fail)
- File-change hook: `typecheck-common`


<!-- update_plan_status:appended -->
## Broader validation results — 2026-07-02T16:33:18.652Z

Ran broader validation for the accumulated changed worktree.

Passed:
- `bun run typecheck` (all workspace typechecks passed: .agents, common, sdk, agents, agent-runtime, scripts, evals, cli, code-map, indexer, internal)
- `cd common && bun test`
- `cd agents && bun test __tests__`
- `cd sdk && bun test`
- `cd cli && NODE_ENV=production bun test`
- `cd packages/code-map && bun test`
- `cd packages/indexer && bun test`
- `cd evals && bun test`
- `cd scripts && bun test`

Failure found:
- `cd packages/agent-runtime && bun test` failed in `src/__tests__/structural-read.test.ts` only.
- Focused repro `cd packages/agent-runtime && bun test src/__tests__/structural-read.test.ts` failed 2 tests: `read_outline handler (AST-backed) > produces a structural outline with line spans and imports` and `read_outline handler (AST-backed) > falls back gracefully and never throws on unknown extensions`.
- Error: `TypeError: undefined is not an object (evaluating 'fileContext.projectRoot')` at `packages/agent-runtime/src/tools/handlers/tool/read-outline.ts:44`.

Next checkpoint: inspect `packages/agent-runtime/src/__tests__/structural-read.test.ts` and `packages/agent-runtime/src/tools/handlers/tool/read-outline.ts`; likely align the focused tests or handler call path with the newer required `fileContext.projectRoot` contract.


<!-- update_plan_status:appended -->
## Agent-runtime structural-read fix — 2026-07-02T16:37:06.124Z

Fixed and validated the `read_outline` structural-read regression.

Change:
- Updated `packages/agent-runtime/src/__tests__/structural-read.test.ts` so direct `handleReadOutline` calls include `mockFileContext`, matching the handler's required `fileContext.projectRoot` containment contract.

Validation passed:
- `cd packages/agent-runtime && bun test src/__tests__/structural-read.test.ts` (12 pass, 0 fail)
- File-change hook: `typecheck-agent-runtime`


<!-- update_plan_status:appended -->
## Set Output Prompt Tool Availability Alignment — 2026-07-02T16:48:55.953Z

Completed set_output prompt/tool availability alignment item.

- Removed the model-visible `set_output` mention from `agents/thinker/thinker.ts`; thinker still has programmatic `handleSteps` output capture, but the model is no longer told to call a tool it cannot access.
- Added `agents/tool-reachability.test.ts` coverage ensuring structured-output agent prompts without `set_output` in `toolNames` do not mention `set_output`.
- Focused validation passed: `cd agents && bun test tool-reachability.test.ts` (6 pass, 0 fail).
- Hook passed: `typecheck-agents`.


<!-- update_plan_status:appended -->
## M4 env/config docs validation — 2026-07-02T16:57:54.382Z

Docs-only env/config/migration drift fix completed and validated.

- Updated docs to reflect implemented compatibility env contract: `OPENBUFF_CHATGPT_OAUTH_TOKEN` alias exists with legacy-first SDK precedence, and `NEXT_PUBLIC_OPENBUFF_APP_URL` is an optional schema field while `NEXT_PUBLIC_CODEBUFF_APP_URL` remains the primary required app URL accessor.
- Pending docs files: `docs/environment-variables.md`, `docs/codebuff-to-openbuff-migration.md`, `docs/local-mode.md`, `docs/architecture.md`.
- File-change hooks were invoked for those docs files and skipped because no configured hook matches docs-only changes.
- Focused sanity check passed with `rg` confirming the new compatibility notes are present and no stale `only CODEBUFF_API_KEY`/`Other legacy CODEBUFF_` drift pattern remains in the touched docs.
- Static reviewer returned `LOOKS_GOOD` for docs accuracy/clarity.


<!-- update_plan_status:appended -->
## M5 provider/MCP hygiene focused validation — 2026-07-02T17:11:49.554Z

Completed focused M5 provider/MCP hygiene validation for the common MCP/cache-debug batch.

Files covered:
- `common/src/mcp/client.ts` — MCP client cache identity now includes hashed, env-substituted stdio env and remote headers without exposing raw values.
- `common/src/mcp/__tests__/client.test.ts` — regression coverage for HTTP/SSE header identity and stdio env identity redaction.
- `common/src/util/cache-debug.ts` — provider request cache-debug normalization redacts prompt text and secret-like nested fields while preserving structural metadata.
- `common/src/util/__tests__/cache-debug.test.ts` — regression coverage for prompt redaction, nested secret redaction, data URL summarization, and argument preservation.

Validation:
- `cd common && bun test src/mcp/__tests__/client.test.ts src/util/__tests__/cache-debug.test.ts && bun run typecheck` — PASS, 21 tests, 53 expects, common typecheck pass.
- Configured hook `typecheck-common` — PASS.

Next checkpoint: let the automated validation/reviewer gate evaluate the pending M5 files, then continue the next M5 item only if the gate passes.


<!-- update_plan_status:appended -->
## M5 MCP duplicate-case cache-key blocker resolved — 2026-07-02T17:14:34.804Z

Resolved the reviewer BLOCKING finding for MCP cache-key duplicate-case handling.

Fix:
- `common/src/mcp/client.ts#hashRecordValues` now lowercases keys before sorting and collision handling.
- Duplicate normalized keys use an explicit deterministic last-wins policy, matching JavaScript object insertion semantics and avoiding insertion-order-dependent post-sort overwrites.
- `common/src/mcp/__tests__/client.test.ts` now covers differently cased duplicate header keys producing the same cache identity as the normalized last value, without exposing raw secrets.

Validation after fix:
- `cd common && bun test src/mcp/__tests__/client.test.ts src/util/__tests__/cache-debug.test.ts && bun run typecheck` — PASS, 22 tests, 56 expects, common typecheck pass.
- Configured hook `typecheck-common` — PASS.

Next checkpoint: rerun the automated reviewer gate for the pending M5 files.


<!-- update_plan_status:appended -->
## M5 runtime cache-debug snapshot redaction validation — 2026-07-02T17:22:28.270Z

Completed the runtime cache-debug snapshot redaction follow-up for M5.

Files changed:
- `packages/agent-runtime/src/util/cache-debug.ts` — provider request snapshot enrichment now redacts string prompt `content` fields and secret-like nested fields (`Authorization`, `X-Api-Key`, `apiKey`, `token`, `secret`) in both raw and normalized provider request bodies while preserving data-URL summaries and tool-call `arguments` strings.
- `packages/agent-runtime/src/util/__tests__/cache-debug.test.ts` — added regression coverage proving stored provider request snapshots do not contain raw prompt text or provider secrets.

Validation:
- `cd packages/agent-runtime && bun test src/util/__tests__/cache-debug.test.ts && bun run typecheck` — PASS, 13 tests, 33 expects, typecheck pass.
- Configured hook `typecheck-agent-runtime` — PASS.

Next checkpoint: allow the automated reviewer gate to evaluate the pending M5 files, then continue remaining M5 provider-discovery/custom-endpoint items if the gate passes.


<!-- update_plan_status:appended -->
## M5 provider discovery auth completed — 2026-07-02T18:25:31.097Z

Completed M5 provider-discovery auth configurability for custom endpoints.

Changes:
- Added `discovery.auth` schema/type support with `auto | provider | none`.
- Discovery now sends provider Authorization by default for inferred endpoints and same-origin explicit endpoints, omits it for cross-origin custom endpoints in `auto`, supports `provider` opt-in, and supports `none` opt-out.
- Added SDK tests for same-origin default auth, cross-origin default omission, cross-origin opt-in, and inferred-endpoint opt-out.
- Documented model discovery auth behavior in `docs/configuration.md`.

Validation:
- `cd sdk && bun test src/__tests__/model-provider.test.ts` passed.
- File-change hooks passed: `typecheck-common`, `typecheck-sdk`, `typecheck-agent-runtime`.

Next checkpoint:
- Continue M5 with remote MCP cache identity/redaction items, or move to the next plan item if those are already covered by the current dirty-tree changes.


<!-- update_plan_status:appended -->
## M5 MCP cache hygiene validation — 2026-07-02T18:29:09.955Z

M5 remote MCP cache identity/redaction follow-up validated. Scoped existing implementation for remote MCP client cache keys and cache-debug redaction; no additional source edits were needed in this step. Validation passed:
- `cd common && bun test src/mcp/__tests__/client.test.ts src/util/__tests__/cache-debug.test.ts` -> 22 pass, 0 fail.
- `cd packages/agent-runtime && bun test src/util/__tests__/cache-debug.test.ts` -> 13 pass, 0 fail.
Configured file-change hooks were also run for the pending cache-debug/MCP files before targeted validation. Next checkpoint: proceed to the next incomplete M5/harness-remediation plan item after the automated validation/reviewer gate clears the current pending file set.


<!-- update_plan_status:appended -->
## M5 combined validation hooks passed — 2026-07-02T18:30:15.081Z

Configured validation hooks passed for the current pending M5 file set:
- `typecheck-common` -> PASS.
- `typecheck-sdk` -> PASS.
- `typecheck-agent-runtime` -> PASS.

This confirms the combined cache-debug, provider discovery auth, SDK test, and configuration documentation changes typecheck cleanly across affected packages. Current checkpoint: await/clear the automated reviewer gate for `common/src/util/cache-debug.ts`, `packages/agent-runtime/src/util/cache-debug.ts`, `sdk/src/provider-config.ts`, `sdk/src/model-discovery.ts`, `sdk/src/__tests__/model-provider.test.ts`, and `docs/configuration.md`, then resume the next incomplete M5/harness-remediation plan item.


<!-- update_plan_status:appended -->
## M6 scoping started — 2026-07-02T18:31:37.839Z

Starting M6 error handling, diagnostics, and bounded local resource use. First checkpoint: scope current implementation and tests across runtime stream/tool parsing, code-map/indexer parse diagnostics, SDK model-discovery timeout/cancellation behavior, and eval harness final-check/error summarization, then choose the smallest safe implementation batch.


<!-- update_plan_status:appended -->
## M6 first batch selected — 2026-07-02T18:33:36.245Z

Selected first M6 implementation batch: bound unterminated XML tool-call buffering in `packages/agent-runtime/src/util/stream-xml-parser.ts`, surface parser errors through `processStreamWithTools`, and add focused regression coverage. This is narrower than the full M6 surface and directly addresses the unbounded streamed tool-call buffer item without touching unrelated diagnostics/eval/indexer areas.


<!-- update_plan_status:appended -->
## M6 bounded XML parser batch complete — 2026-07-02T18:38:40.327Z

Completed the first M6 implementation batch for bounded streamed XML tool-call parsing.

Changes:
- `packages/agent-runtime/src/util/stream-xml-parser.ts` now tracks structured parser errors, reports invalid XML tool-call JSON/missing tool names, and bounds unterminated tool-call buffering with a default 64 KiB limit.
- `packages/agent-runtime/src/tool-stream-parser.ts` forwards XML parser errors as print-mode `error` chunks instead of silently dropping malformed XML tool calls.
- `packages/agent-runtime/src/util/__tests__/stream-xml-parser.test.ts` covers invalid JSON reporting and clearing an over-limit unterminated buffer.
- `packages/agent-runtime/src/__tests__/tool-stream-parser.test.ts` covers parser errors surfacing through `onResponseChunk`.

Validation:
- `cd packages/agent-runtime && bun test src/util/__tests__/stream-xml-parser.test.ts src/__tests__/tool-stream-parser.test.ts` — PASS, 27 tests, 73 expects.
- Configured hook `typecheck-agent-runtime` — PASS.

Next checkpoint: continue M6 by selecting the next narrow diagnostics/resource-use item, likely tree-sitter/indexer parse diagnostics or malformed tool input structured errors, after the automated validation/reviewer gate clears the current pending file set.


<!-- update_plan_status:appended -->
## M6 combined validation hooks passed — 2026-07-02T18:39:38.780Z

Combined configured validation hooks passed for the pending M5/M6 file set:
- `typecheck-common` -> PASS.
- `typecheck-sdk` -> PASS.
- `typecheck-agent-runtime` -> PASS.

Current checkpoint: continue M6 with the next narrow diagnostics/resource-use batch after the bounded XML parser batch.


<!-- update_plan_status:appended -->
## M6 malformed tool input scoping started — 2026-07-02T18:40:11.606Z

Starting the next M6 batch. Candidate chosen for scoping: malformed tool input parse-error handling in `packages/agent-runtime/src/tool-stream-parser.ts`, because the current path logs non-JSON AI SDK tool-call input to `console.debug` and then relies on downstream behavior. Goal is to verify the downstream error surface and decide whether a minimal structured error improvement is safe without changing valid tool execution.


<!-- update_plan_status:appended -->
## M6 malformed tool input diagnostics — 2026-07-02T18:40:32.791Z

Starting next M6 batch: malformed tool input parse-error diagnostics. Scope is adjacent to the bounded XML parser work; do not revisit completed M5 or XML-buffer work unless validation points back there.


<!-- update_plan_status:appended -->
## M6 malformed input scope — 2026-07-02T18:41:42.489Z

Scoped selected M6 malformed-input path: `packages/agent-runtime/src/util/parse-tool-calls-from-text.ts` silently drops malformed XML tool calls, and `run-programmatic-step.ts` executes the resulting text/tool-call segments. Focused fix should add structured parse-error segments and have the programmatic-step path surface them without executing malformed calls.


<!-- update_plan_status:appended -->
## M6 malformed input diagnostics result — 2026-07-02T18:45:08.570Z

Completed M6 malformed tool input diagnostics batch.

Changed behavior:
- `parseTextWithToolCalls` now emits `parse_error` segments for malformed `<codebuff_tool_call>` blocks instead of silently dropping them.
- Programmatic STEP_TEXT handling surfaces those parse-error segments through `onResponseChunk({ type: 'error', message })` without executing malformed tool calls.
- Existing `parseToolCallsFromText` convenience API still returns only valid parsed tool calls.

Validation:
- `cd packages/agent-runtime && bun test src/util/__tests__/parse-tool-calls-from-text.test.ts src/__tests__/run-programmatic-step.test.ts src/util/__tests__/stream-xml-parser.test.ts src/__tests__/tool-stream-parser.test.ts` passed.
- File-change hook `cd packages/agent-runtime && bun run typecheck` passed.


<!-- update_plan_status:appended -->
## M6 malformed input validation complete — 2026-07-02T18:46:38.664Z

Combined configured validation hooks passed for the pending M5/M6 file set after the malformed STEP_TEXT diagnostics batch:
- `typecheck-common` -> PASS.
- `typecheck-sdk` -> PASS.
- `typecheck-agent-runtime` -> PASS.

Targeted malformed-input/stream-parser tests also passed:
- `cd packages/agent-runtime && bun test src/util/__tests__/parse-tool-calls-from-text.test.ts src/__tests__/run-programmatic-step.test.ts src/util/__tests__/stream-xml-parser.test.ts src/__tests__/tool-stream-parser.test.ts` -> PASS.

Next checkpoint: continue M6 with another narrow diagnostics/resource-use batch without revisiting completed M5, bounded XML, or malformed STEP_TEXT work unless validation/review points back there.


<!-- update_plan_status:appended -->
## M6 code-map/indexer diagnostics start — 2026-07-02T18:47:12.808Z

Starting next M6 batch: code-map/indexer parse diagnostics. Scope first across tree-sitter parse error handling, metadata indexing diagnostics, and existing tests; keep the batch narrow and avoid revisiting completed parser/provider/MCP work.


<!-- update_plan_status:appended -->
## M6 parse diagnostics result — 2026-07-02T18:55:18.728Z

M6 code-map/indexer parse diagnostics batch completed.

Implemented:
- `packages/code-map/src/parse.ts` now accumulates structured parse diagnostics for language-config misses, source reader failures, and parse/query failures while keeping parse failures non-fatal.
- `packages/indexer/src/types.ts` adds optional `MetadataIndex.parseDiagnostics`.
- `packages/indexer/src/metadata-indexer.ts` propagates code-map diagnostics into the metadata index and records top-level parse exceptions without dropping the rest of the index.
- Focused coverage added in `packages/code-map/__tests__/parse.test.ts` and `packages/indexer/src/metadata-indexer.test.ts`.

Validation:
- `cd packages/code-map && bun test __tests__/parse.test.ts` passed: 23 pass, 0 fail.
- `cd packages/indexer && bun test src/metadata-indexer.test.ts` passed: 11 pass, 0 fail.
- Configured hook `cd packages/indexer && bun run typecheck` passed after fixing the mixed `import type` syntax.
- `cd packages/code-map && bun run typecheck` passed.

Next checkpoint: continue M6 with the next isolated diagnostics/resource-bound surface from the durable plan, after confirming the next incomplete item.


<!-- update_plan_status:appended -->
## M6 format-value hardening start — 2026-07-02T19:09:19.341Z

Starting focused M6 batch: harden `packages/agent-runtime/src/util/format-value.ts` so validation/error reporting cannot throw while trying to format problematic values. Target tests will cover circular references, BigInt, primitives, truncation, and fallback behavior. Scope is limited to formatting error-display values; no tool execution behavior changes intended.


<!-- update_plan_status:appended -->
## M6 format-value hardening result — 2026-07-02T19:12:36.404Z

Completed focused M6 format-value hardening batch.

Implemented:
- `packages/agent-runtime/src/util/format-value.ts` now catches `JSON.stringify` failures and returns a bounded fallback string instead of throwing while formatting validation/error messages.
- Focused coverage added in `packages/agent-runtime/src/util/__tests__/format-validation-issues.test.ts` for primitives, circular objects, BigInt, and truncation after fallback formatting.

Validation:
- `cd packages/agent-runtime && bun test src/util/__tests__/format-validation-issues.test.ts` passed: 9 pass, 0 fail.
- `cd packages/agent-runtime && bun run typecheck` passed.
- Configured hook `typecheck-agent-runtime` passed for touched files.

Next checkpoint: continue M6 with the next isolated diagnostics/resource-bound surface, likely model discovery/final-check timeouts, `initCommand` semantics, or eval per-agent error summarization.


<!-- update_plan_status:appended -->
## M6 Model Discovery Timeout Checkpoint — 2026-07-02T19:17:17.489Z

Completed M6 model-discovery timeout/cancellation checkpoint. `discoverProviderModels` now applies a default 30s abort timeout around discovery fetches, composes it with a caller-provided `AbortSignal`, preserves the legacy exact signal forwarding behavior when `timeoutMs: 0`, and surfaces timeout errors clearly. Focused test coverage added for disabled-timeout signal forwarding and hung-fetch abort behavior in `sdk/src/__tests__/model-provider.test.ts`. Validation passed: `cd sdk && bun test src/__tests__/model-provider.test.ts -t "model discovery"`, `cd sdk && bun run typecheck`, and configured hook `typecheck-sdk` for `sdk/src/model-discovery.ts` + `sdk/src/__tests__/model-provider.test.ts`.

Next checkpoint: continue M6 with the next isolated diagnostics/resource-bound surface, likely `initCommand` parsing semantics or eval per-agent error summarization, without revisiting completed parser/parse-diagnostics/format-value/model-discovery batches unless validation or review points back.


<!-- update_plan_status:appended -->
## M6 InitCommand Semantics Checkpoint — 2026-07-02T19:23:22.218Z

Completed M6 `initCommand` semantics checkpoint. BuffBench repo setup now treats `initCommand` as an explicit trusted shell command via exported `executeInitCommand`, avoiding the previous naive space-splitting that broke quoted arguments, redirection, and compound shell setup commands. README wording now documents this as a trusted shell setup command run from the repo root. Focused test coverage added in `evals/buffbench/__tests__/agent-runner.test.ts` for quoted shell semantics and redirection.

Validation passed: `cd evals && bun test buffbench/__tests__/agent-runner.test.ts` (6 pass, 0 fail), `cd evals && bun run typecheck`, and configured hooks were checked but skipped because eval files have no matching hook.

Next checkpoint: continue M6 with the remaining isolated diagnostics/resource-bound item: improve per-agent eval error summarization so one failed agent does not hide all agents for a commit.


<!-- update_plan_status:appended -->
## M6 eval per-agent error summarization completed — 2026-07-02T19:29:36.193Z

Completed M6 eval per-agent error summarization batch.

Changes:
- `evals/buffbench/run-buffbench.ts` now catches failures per agent within a commit, records a zero-score failed run for that agent, and lets sibling agents on the same commit continue contributing valid runs.
- Added `summarizeAgentRuns` so averages and score distribution exclude only runs with that agent's own error, instead of excluding every agent run from a commit where any agent failed.
- Added focused coverage in `evals/buffbench/__tests__/run-buffbench.test.ts` for same-commit sibling-agent preservation and low-score-but-non-error handling.

Validation:
- `cd evals && bun test buffbench/__tests__/run-buffbench.test.ts` passed: 2 tests, 0 failures.
- `cd evals && bun run typecheck` passed.
- `run_file_change_hooks` for `evals/buffbench/run-buffbench.ts` and `evals/buffbench/__tests__/run-buffbench.test.ts` reported no matching configured hooks.

Next checkpoint: confirm the next incomplete M6/M7 item from PLAN and continue without revisiting completed parser, parse-diagnostics, format-value, model-discovery timeout, initCommand, or eval-summary batches unless validation/review points back.


<!-- update_plan_status:appended -->
## M7 hosted-product wording audit completed — 2026-07-02T19:35:08.100Z

M7 hosted-product wording audit completed. Classified broad hosted/backend/billing/credits/subscription hits across docs, agents, CLI, common, sdk, packages, evals, and scripts. Most hits were intentional local/BYOK guardrails, legacy/upstream documentation, provider-owned ChatGPT/Codex subscription wording, test fixtures, or historical plan artifacts. Applied focused stale wording fixes in `cli/src/utils/status-indicator-state.ts` and `cli/src/utils/constants.ts` so active CLI comments no longer imply a hosted backend or Openbuff billing model.

Validation: `cd cli && bun run typecheck` passed; configured hook `typecheck-cli` passed for the touched CLI files; `bun scripts/byok-wording-guard.ts` passed with no unallowlisted hosted-product wording. Targeted search confirmed the replaced CLI phrases (`Not connected to backend`, `auth service is unreachable`, `cost mode for billing`) no longer appear in active CLI TypeScript.

Next checkpoint: continue M8 evals and plan-sharding correctness, starting with scoping the plan-sharding default prompt/shard-count signal tests unless the automated gate reports a blocker first.


<!-- update_plan_status:appended -->
## M8 plan-sharding repeated-agent counting completed — 2026-07-02T19:38:54.587Z

M8 plan-sharding correctness batch completed for repeated `spawn_agents` counting and default live-eval prompt breadth. `evals/buffbench/plan-sharding-signals.ts` now preserves duplicate requested agent types from top-level `spawn_agents` payloads and counts repeated `file-picker`/`code-searcher` requests for the minimum-shard rule before `subagent_start` events arrive. `evals/buffbench/run-plan-sharding-eval.ts` now uses a default prompt that clearly exercises broad-audit minimum-shard gates across multiple subsystems. Focused regression coverage was added in `evals/buffbench/__tests__/plan-sharding-signals.test.ts`.

Validation: `cd evals && bun test buffbench/__tests__/plan-sharding-signals.test.ts` passed; `cd evals && bun run typecheck` passed. Configured file-change hooks had no matching hook for the touched eval files, so targeted validation is the controlling validation result.

Next checkpoint: continue M8 with the remaining eval correctness items, likely planner-output coverage validation or judge/task `spec` parity, unless the automated validation/reviewer gate reports a blocker first.


<!-- update_plan_status:appended -->
## M8 planner-output coverage validation — 2026-07-02T19:56:34.367Z

Completed the next focused M8 eval correctness fix for planner-output coverage.

Changes:
- `evals/buffbench/run-plan-sharding-eval.ts` now layers `evaluatePlannerOutputCoverage` onto the live plan-sharding evaluation, so broad-audit evals fail when emitted planner text does not mention the audited domains. The summary artifact now records `plannerOutputCoverage`, and CLI output prints missing planner-output domains.
- `evals/buffbench/__tests__/plan-sharding-signals.test.ts` now covers planner-output coverage directly, including prompt-only domain mentions not counting as coverage and pass-to-fail downgrading when planner output misses a domain.

Validation:
- `cd evals && bun test buffbench/__tests__/plan-sharding-signals.test.ts && bun run typecheck` — PASS.

Next checkpoint:
- Continue M8 with judge/task `spec` parity or eval helper registry smoke coverage, unless the pending validation/reviewer gate reports a blocker for the current M8 file set.


<!-- update_plan_status:appended -->
## Validation checkpoint — 2026-07-02T19:57:49.529Z

Validation gate completed after the focused M8 eval correctness fix. Configured hooks passed for common, sdk, cli, agent-runtime, and indexer typechecks. Targeted eval validation from the prior step also passed: `cd evals && bun test buffbench/__tests__/plan-sharding-signals.test.ts && bun run typecheck`. Next checkpoint: continue to the next incomplete harness remediation item, if any, from PLAN.md/STATUS.md.


<!-- update_plan_status:appended -->
## M8 judge spec parity completed — 2026-07-02T20:01:20.458Z

Completed the M8 judge/task `spec` parity fix. `judgeCommitResult` now includes the generated task `spec` in the judge prompt under `## Task Specification (Expected observable outcome)` and the judge system prompt now tells judges to consider both prompt and specification. Added regression coverage in `evals/buffbench/__tests__/run-buffbench.test.ts` proving both judge calls receive the spec text. Validation passed: `cd evals && bun test buffbench/__tests__/run-buffbench.test.ts && bun run typecheck` (3 tests pass, evals typecheck pass). Next M8 checkpoint: continue with eval helper registry smoke coverage unless the validation/reviewer gate reports a blocker.


<!-- update_plan_status:appended -->
## M8 Eval Helper Registry Smoke Coverage — 2026-07-02T20:07:35.615Z

Completed focused M8 eval helper registry smoke coverage. `generateEvalTask` now registers the current helper agents required by the graveyard exploration agents (`file-picker`, `file-lister`, `code-searcher`, `directory-lister`, `glob-matcher`) alongside `file-explorer` and `find-all-referencer`. Added regression coverage in `evals/buffbench/__tests__/run-buffbench.test.ts` asserting the full helper registry is passed to `OpenbuffClient.run`. Validation passed: `cd evals && bun test buffbench/__tests__/run-buffbench.test.ts && bun run typecheck` (4 tests pass, evals typecheck pass). Next checkpoint: run configured file-change hooks for the changed eval files, then continue to the next M8 item or final gate as directed.


<!-- update_plan_status:appended -->
## M8 Eval Helper Registry Hook Result — 2026-07-02T20:08:42.383Z

Configured file-change hooks were requested for `evals/buffbench/eval-task-generator.ts` and `evals/buffbench/__tests__/run-buffbench.test.ts`; the harness reported `hooks_skipped` because no configured hook matched those eval files. Targeted validation remains the source of truth for this item: `cd evals && bun test buffbench/__tests__/run-buffbench.test.ts && bun run typecheck` passed.


<!-- update_plan_status:appended -->
## M9 final closure started — 2026-07-02T20:41:17.048Z

Started M9 final local-model closure after reconciling M7/M8 as complete. Scope for this checkpoint is final closure rather than new remediation: sweep remaining LOW/deferred tracker rows, run registry/drift checks and relevant validation, update tracker statuses where prior milestones already resolved findings, and produce a closure report mapping audit findings to fixed/downgraded/discarded/deferred/accepted status. Initial command discovery confirms the relevant native guards include `scripts` package checks (`guard:byok-wording`, `guard:memory-drift`, `guard:sync-agent-config`) plus package validation commands recorded in the tracker.


<!-- update_plan_status:appended -->
## M9 scope — inputs and remaining tracker debt — 2026-07-02T20:43:23.682Z

M9 closure inputs scoped.

Authoritative inputs:
- Remediation plan/status/lessons: `.agents/sessions/harness-remediation-2026-07-01/{PLAN.md,STATUS.md,LESSONS.md}`.
- Tracker to reconcile: `.agents/sessions/harness-remediation-2026-07-01/M0-LOCAL-TRIAGE-TRACKER.md`.
- Audit inventory/coverage: `.agents/sessions/harness-audit-2026-06-30/{AUDIT-REPORT.md,COVERAGE-MATRIX.md,findings/*.md}`.
- Native guard/validation scripts: `scripts/package.json`, `scripts/byok-wording-guard.ts`, `scripts/memory-drift-guard.ts`, `scripts/sync-agent-config.ts`, `scripts/check-tool-registration.ts`, plus package validation commands already recorded in the tracker.

Remaining tracker debt is mostly stale tracker status rather than confirmed unimplemented source work. Many rows still say `todo` despite completed M1-M8 STATUS evidence: M1 path/cwd/read-outline/code-search containment; M3 index/provider/background/gate freshness; M4 registry/config/docs contracts; M5 provider/MCP/redaction; M6 parser/diagnostics/timeout/init/eval summaries; M7 wording cleanup; M8 plan-sharding/judge/helper registry. M9 should reconcile those rows first, then classify true residual LOW/deferred items as accepted debt/deferred unless a native guard exposes a concrete regression.

Initial M9 residual groups to classify:
- Opportunistic LOW/deferred rows: `SEC-L01`, `SEC-L02`, `COR-L01-L07`, `STATE-L01-L04`, `ERR-L01-L03`, `PERF-L01-L03`, `DEP-M04/DEP-L02`, `DEP-L01`, `TEST-L01-L03`, `ABI-L01-L05`.
- Medium rows likely already closed by M1-M8 evidence but tracker-stale: `SEC-H01`, `SEC-H03-H05`, `SEC-M01`, `SEC-M04`, `COR-H03-H06`, `COR-M01`, `COR-M08-M21`, `ERR-H01`, `ERR-M01-M08`, `PERF-M01-M02`, `DEP-M03`, `ABI-H01-H02`, `ABI-M01-M13`, `TEST-M01-M08`.
- Rows needing explicit acceptance/defer rationale rather than new source edits unless validation fails: `SEC-M03` gate path containment, `SEC-M05/DEP-M02` CDN parser WASM dependency hygiene, `SEC-M06` eval log token metadata, `COR-M12` BYOK cost-accounting namespace, `PERF-M03-M07` CLI render/perf lows, `COR-M21` substring-based tool-registration script weakness.


<!-- update_plan_status:appended -->
## M9 closure classifications complete — 2026-07-02T20:46:26.148Z

Completed M9 closure classification sharding across audit/debt groups.

Shard outcomes:
- Local filesystem/edit/cancellation/freshness: most M1-M3 rows are fixed with recorded validation; residual accepted/deferred items are gate-path absolute hardening (`SEC-M03`), broader `basedOnRead`/large-file `occurrenceIndex` freshness (`SEC-H02/COR-H01/STATE-H01` residual + `COR-M20`), and non-abort CLI low-priority races/perf polish.
- Registry/schema/config/provider/MCP/docs: M4/M5/M7 rows are fixed or contract-clarified; residual accepted/deferred items are BYOK cost-accounting namespace (`COR-M12`), hardcoded support-agent model/config sync debt if guards fail (`DEP-M01`), substring-based `check-tool-registration` weakness (`COR-M21`) mitigated by table-driven tests, and intentional `set_output` exceptions.
- Diagnostics/resource/evals: M6/M8 parser/timeout/init/judge/plan-sharding/helper-registry rows are fixed with targeted validation; residual accepted/deferred items include runtime trimming/message low edge cases, invalid `glob.cwd` broadening, eval token metadata logging (`SEC-M06`), and eval-analysis score aggregation polish.
- Scripts/config/LOW debt: `SEC-L01`, low dependency/performance/test/API drift rows, CDN parser WASM hygiene (`SEC-M05/DEP-M02`), and base2 cleanup constants are M9 accepted/deferred debt unless native guards expose a concrete regression.

Decision: proceed to M9 validation/guard step before editing tracker/closure report. If guards pass or only expose unrelated accepted debt, write final closure report and update tracker statuses. If a guard fails on a concrete planned closure invariant, treat it as the controlling next action.


<!-- update_plan_status:appended -->
## M9 final closure artifacts complete — 2026-07-02T20:57:49.224Z

M9 final local-model closure artifacts are complete.

Completed:
- Created `.agents/sessions/harness-remediation-2026-07-01/M9-FINAL-CLOSURE-REPORT.md` mapping audit finding families to fixed, downgraded, discarded, deferred, or accepted-debt status.
- Updated `.agents/sessions/harness-remediation-2026-07-01/M0-LOCAL-TRIAGE-TRACKER.md` with final M9 reconciliation guidance and validation outcomes.
- Resolved the M9 memory-drift staleness failure by updating `scripts/memory-drift-guard.ts`, refreshing `cli/knowledge.md`, `cli/tmux.knowledge.md`, and `common/knowledge.md`, and adding regression coverage in `scripts/__tests__/memory-drift-guard.test.ts`.

Validation recorded for closure:
- `cd scripts && bun run guard:byok-wording && bun run guard:sync-agent-config && bun run guard:memory-drift` passed after the staleness fix.
- `cd scripts && bun run typecheck && bun run test` passed.
- `bun run typecheck` passed.
- Latest configured file-change hooks passed: `typecheck-common`, `typecheck-sdk`, `typecheck-cli`, `typecheck-agent-runtime`, `typecheck-indexer`.

Current phase: awaiting the automated validation/reviewer gate for the M9 closure artifact set. If it passes, final user-visible closure summary can be provided. If it reports a blocker, treat that blocker as the controlling next action.


<!-- update_plan_status:appended -->
## M9 reviewer blocker resolved — memory-drift untracked knowledge coverage — 2026-07-02T21:02:09.659Z

Resolved the M9 reviewer blocker for memory-drift untracked `knowledge.md` behavior. Added regression coverage for an untracked `knowledge.md` inside an initialized git repo with committed sibling `src/`, confirming `checkStaleness` skips when git history cannot provide a real freshness signal. Targeted validation passed: `cd scripts && bun run guard:memory-drift && bun test __tests__/memory-drift-guard.test.ts && bun run typecheck` (memory drift guard 0 findings; 29 tests passing; scripts typecheck passing). Follow-up review returned `LOOKS_GOOD` and confirmed the coverage addresses the blocker. Next checkpoint: await final validation/reviewer gate for the M9 closure file set.


<!-- update_plan_status:appended -->
## Post-push CI drift fix — generated .agents tool declaration — 2026-07-02T23:04:21.027Z

CI verification after pushing `7e1470851` exposed generated tool declaration drift in the `CI` workflow: `bun run generate-tool-definitions` changed `.agents/types/tools.ts` for the `read_docs.max_tokens` default description from 20000 to 10000. Regenerated the declaration locally. Validation for the follow-up fix: `.agents` typecheck passed via configured hook `typecheck-.agents`; the generated-definition diff now consists only of the intended `.agents/types/tools.ts` update to be committed, matching the CI-generated output. Next checkpoint: commit the generated declaration follow-up, push, and re-check GitHub Actions.


<!-- update_plan_status:appended -->
## CI verification resume — 2026-07-02T23:23:17.053Z

Resuming push/CI verification. Latest CI run `28627223646` on `main` completed with CI failure in `build-and-check` Typecheck. Failure is in `@codebuff/cli`: TypeScript cannot find declarations for `react-dom/server` in multiple CLI component tests. Next action: add the missing CLI workspace dev dependency / type visibility fix, validate `@codebuff/cli` typecheck, then push and re-check CI.


<!-- update_plan_status:appended -->
## CI typecheck fix validation — 2026-07-02T23:26:33.236Z

Applied the CI typecheck fix by adding `@types/react-dom@19.2.3` to `cli/package.json` devDependencies via Bun, updating `bun.lock`. Validation passed locally: `cd cli && bun run typecheck` and root `bun run typecheck` both exit 0. Next checkpoint: commit/push the fix and verify the new GitHub Actions run completes successfully.


<!-- update_plan_status:appended -->
## CI verification complete — 2026-07-02T23:35:35.649Z

Pushed commit `a7d4b4501` (`fix(cli): add react-dom types for server rendering tests`) to `main`. GitHub Actions for the pushed commit completed: `CI` success, `Evals` success, `CLI Release Staging` skipped as expected. Local validation before push: `cd cli && bun run typecheck` and root `bun run typecheck` both passed. CI URL: https://github.com/AnzoBenjamin/openbuff/actions/runs/28628133624. Evals URL: https://github.com/AnzoBenjamin/openbuff/actions/runs/28628133618.

