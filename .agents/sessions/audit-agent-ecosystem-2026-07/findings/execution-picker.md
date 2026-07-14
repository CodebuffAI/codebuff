# Execution specialists — file-picker audit

Scope: active editor/basher definitions, their assigned tests, the orphaned best-of-N E2E, and directly invoked runtime/SDK contracts. Evidence is from the current working tree (the four editor/basher source/unit-test files are already user-modified). Targeted unit tests pass: `bun test agents/__tests__/editor.test.ts agents/__tests__/basher.test.ts` (65 pass).

## [HIGH] Security — agents/basher.ts:79 — arbitrary shell execution has no enforceable approval boundary

- **Risk:** A parent can pass any shell string to basher and the runtime executes it directly; the warnings about permission are only model-facing prose, so destructive, network, credential-reading, or out-of-project commands are not technically gated.
- **Fix:** Add a runtime command-policy/approval decision before execution (risk classification, explicit user grant/capability, auditable denial shape), with bypass only for a narrow allowlist of non-effectful validation commands.
- **Evidence:** `agents/basher.ts:79-139` forwards `params.command` directly; `packages/agent-runtime/src/tools/handlers/tool/run-terminal-command.ts:20-32` forwards it as `mode: 'assistant'`; `sdk/src/tools/run-terminal-command.ts:232-236` calls `bash -c <command>`. The only approval rules are advisory text in `common/src/tools/params/tool/run-terminal-command.ts:82-92`; cwd containment at `sdk/src/tools/run-terminal-command.ts:141-161` does not constrain absolute paths or side effects inside the shell program.

## [HIGH] Test coverage gaps / API contract — agents/e2e/editor-best-of-n.e2e.test.ts:12 — the best-of-N E2E tests a feature that is no longer active, and can pass vacuously

- **Risk:** The test name/documentation claims parallel implementors, selection, and applying the winner, but it registers a single leaf proposal agent and asserts words already present in the prompt/session; regressions or total absence of best-of-N are therefore invisible.
- **Fix:** Delete/rename this stale E2E if best-of-N is intentionally removed, or restore an active orchestrator and assert N child runs, selector input/verdict, canonical applied mutation receipt, and final file contents.
- **Evidence:** `agents/e2e/editor-best-of-n.e2e.test.ts:12-23` defines `editor-best-of-n-max` locally with `spawnableAgents: []` and no `handleSteps`; `:74-79` supplies `params.n` that nothing consumes; `:96-115` accepts terms such as `multiply`, `function`, and `number` that already occur in the request. `agents/tsconfig.json:14-19` excludes the test, while `agents/tool-reachability.test.ts:121-139` explicitly says best-of-N definitions were deleted; implementations remain only under `agents-graveyard/editor/best-of-n/`.

## [MEDIUM] Correctness / UX — agents/basher.ts:141 — `what_to_summarize` does not summarize or extract the requested information

- **Risk:** Callers pay the UX cost of specifying a focus but receive a fixed, truncated dump; a request such as “only failing tests” can still return unrelated stdout and omit the relevant tail, contradicting the spawner/system contract.
- **Fix:** Either rename it to `report_label`/`focus_label`, or implement deterministic focused extraction plus a clearly signaled fallback; if semantic summarization is desired, add an explicit provider step with failure-isolated fallback to the raw structured result.
- **Evidence:** The agent promises analysis at `agents/basher.ts:14,61-78`, but `:141-238` only appends fixed fields and bounded stdout/stderr. `agents/__tests__/basher.test.ts:257-285` explicitly verifies that no provider `STEP` occurs and only checks raw output inclusion.

## [MEDIUM] Error handling — sdk/src/tools/run-terminal-command.ts:288 — timeouts/spawn failures reject instead of returning a deterministic command result

- **Risk:** Basher advertises deterministic reporting, but a timeout or spawn error escapes the client tool promise; callers lose a normal `exitCode`/`timedOut`/partial-output shape and recovery becomes a generic tool/subagent failure.
- **Fix:** Convert timeout/spawn failures to the terminal output schema with `errorMessage`, `timedOut`, command, elapsed time, and bounded partial stdout/stderr; reserve promise rejection for cancellation/runtime corruption.
- **Evidence:** `sdk/src/tools/run-terminal-command.ts:288-301,372-389` rejects; `packages/agent-runtime/src/tools/handlers/tool/run-terminal-command.ts:31-32` and `agents/basher.ts:129-157` do not catch. `agents/__tests__/basher.test.ts:165-189` checks only timeout forwarding, with no timeout-result/recovery test.

## [MEDIUM] State mutation / recovery — sdk/src/tools/background-jobs.ts:327 — timeout and `kill_job` target only the shell PID, not its process tree

- **Risk:** Commands that spawn children (dev servers, package scripts, pipelines) may leave grandchildren running after timeout/kill while Openbuff reports the tracked shell as stopped, leaking ports/processes across turns.
- **Fix:** Launch and track a process group/job object, terminate the full tree (POSIX group signal; Windows tree/job-object equivalent), wait for confirmed exit, then report residual-process failure if cleanup is incomplete.
- **Evidence:** sync execution spawns a shell at `sdk/src/tools/run-terminal-command.ts:232-236` and timeout kills only `childProcess` at `:288-300`; background execution does the same at `sdk/src/tools/background-jobs.ts:327-343`, and `killBackgroundJob` calls only `job.child.kill(signal)`/`process.kill(pid)` at `:504-519`. `packages/agent-runtime/src/tools/handlers/tool/end-turn.ts:24-49` tells users `kill_job` manages leaked work, making complete cleanup part of the UX contract.

## [MEDIUM] Security / state mutation — agents/basher.ts:112 — full-log capture creates persistent shell-owned `/tmp` logs with no cleanup contract

- **Risk:** Test/build output can contain secrets or proprietary paths; `tee` creates a discoverable local file using ambient umask, the path is returned to the model, and neither basher nor its tests remove it.
- **Fix:** Move capture into the SDK background/log subsystem using exclusive restrictive file creation, add TTL/end-of-run cleanup and an explicit retain option, and redact known secret patterns before returning excerpts.
- **Evidence:** `agents/basher.ts:112-126` writes via `tee` to `/tmp/openbuff-basher-<uuid>.log`; `:164-167` publishes the path. `agents/__tests__/basher.test.ts:288-353` validates creation/reporting but has no permissions, redaction, or cleanup assertion. By contrast, SDK background logs use exclusive/no-follow creation at `sdk/src/tools/background-jobs.ts:316-326`.

## [MEDIUM] Correctness / UX flow — agents/editor/editor.ts:224 — incomplete target-file progress is informational only and can be derived from unrelated backticked paths

- **Risk:** The editor can finish with `pendingTargetFiles`, yet no active consumer blocks completion or requests recovery; backticked examples/non-goals are also treated as targets, producing noisy progress and an unreliable validation handoff.
- **Fix:** Pass target files as structured spawn input, return an explicit `complete|incomplete|failed` status with reasons, and have the orchestrator gate incomplete required targets; keep prompt-regex parsing only as a compatibility fallback.
- **Evidence:** `agents/editor/editor.ts:224-239,368-386` emits progress; `:407-420` scans both a section and every backticked filename. Repository search finds `targetFileProgress` only in this file and `agents/__tests__/editor.test.ts:575-645`, not in base2/runtime/CLI consumers. The validation gate records only confirmed `changedFiles` (`agents/base2/base2.ts:1602-1637`).

## [LOW] API/ABI contract — agents/basher.ts:45 — basher exposes a weaker subset of the terminal contract

- **Risk:** `process_type` accepts any string in the agent schema and `cwd` is unavailable, causing late validation failures and forcing callers to encode directory changes inside shell strings.
- **Fix:** Mirror the terminal schema: enum `SYNC|BACKGROUND`, bounded/integer timeout rules, and project-contained `cwd`; share a schema/helper to prevent drift.
- **Evidence:** `agents/basher.ts:45-53` declares plain string `process_type` and no `cwd`; the canonical tool has an enum and cwd at `common/src/tools/params/tool/run-terminal-command.ts:53-70`. Existing basher schema tests cover timeout/full-log fields but not process type or cwd (`agents/__tests__/basher.test.ts:47-111`).

## Eight-domain coverage

| Domain                  | Result                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security                | Approval enforcement and persistent log findings above.                                                                                                                                  |
| Correctness             | False best-of-N coverage, misleading summarization, and unenforced editor completeness.                                                                                                  |
| State mutation          | Process-tree/background cleanup and temp-log lifecycle gaps.                                                                                                                             |
| Error handling          | Timeout/spawn failures lack deterministic structured recovery.                                                                                                                           |
| Performance             | No standalone hotspot ranked; editor does return full `newMessages` at `agents/editor/editor.ts:222-235`, worth measuring for parent-context amplification before changing the contract. |
| Dependency hygiene      | No direct dependency issue found in this shard.                                                                                                                                          |
| Test coverage gaps      | Best-of-N E2E is vacuous/excluded; timeout, process-tree cleanup, log lifecycle, and incomplete-target handoff are untested.                                                             |
| API/ABI contract breaks | Basher schema drift and dead best-of-N ID/test contract above.                                                                                                                           |

## Compact inventory for paired code-searcher

- Editor definition/UX: `agents/editor/editor.ts:22-199` (`createCodeEditor`, tools, read-before-write/recovery instructions); loop/output `:201-239`; canonical mutation receipt scan `:241-366`; target progress/parser `:368-455`.
- Editor tests: `agents/__tests__/editor.test.ts:42-274` prompt/tool contract; `:276-539` step/output/mutation evidence; `:575-645` target progress. Missing: abort/partial/rollback-incomplete output semantics, incomplete-target orchestration, parent-context size.
- Editor spawn contract: `packages/agent-runtime/src/tools/handlers/tool/spawn-agent-utils.ts:277-358` requires five prompt labels using substring matching.
- Read-before-write/application: `packages/agent-runtime/src/tools/handlers/tool/write-file.ts:54-137,179-190`; `str-replace.ts:87-165`; `replace-range.ts:41-122`; `rewrite-symbol.ts:53-169`; `edit-transaction.ts:76-177`; `edit-application-coordinator.ts:84-221` (notably ambiguous “Queued for approval” is rejected in its test at `__tests__/edit-application-coordinator.test.ts:173-201`).
- Validation handoff: `agents/base2/base2.ts:1602-1637` consumes changed paths, not `targetFileProgress`.
- Basher definition/flow: `agents/basher.ts:9-78` schema/prompts; `:79-139` execution; `:141-238` raw/deterministic reporting; tests `agents/__tests__/basher.test.ts:47-111,114-479`.
- Terminal/runtime: `common/src/tools/params/tool/run-terminal-command.ts:9-75,76-103`; runtime forwarding `packages/agent-runtime/src/tools/handlers/tool/run-terminal-command.ts:9-32`; SDK execution/timeout `sdk/src/tools/run-terminal-command.ts:120-203,206-389`.
- Background recovery: `common/src/tools/params/tool/check-job.ts:7-88`; `kill-job.ts:7-63`; SDK jobs `sdk/src/tools/background-jobs.ts:303-529`; end-turn visibility `packages/agent-runtime/src/tools/handlers/tool/end-turn.ts:9-52`.
- Best-of-N status: stale E2E `agents/e2e/editor-best-of-n.e2e.test.ts:8-119`; excluded at `agents/tsconfig.json:14-19`; removed-ID guard `agents/tool-reachability.test.ts:121-139`; historical implementation `agents-graveyard/editor/best-of-n/`.
