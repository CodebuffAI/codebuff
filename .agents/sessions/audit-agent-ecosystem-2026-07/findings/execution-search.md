# Execution specialists — code-searcher audit

## Verified findings

## [HIGH] Security / API contract — agents/basher.ts:79 — Shell safety is advisory, not enforceable

- **Risk:** Any parent allowed to spawn basher can execute an arbitrary shell program without a runtime approval/capability decision; model prompt injection or mistaken routing can perform destructive, network, credential, production, or git actions despite documented “ask first” rules.
- **Fix:** Enforce command risk policy at the client/runtime boundary, require a scoped user grant for effectful categories, attach provenance/approval IDs to executions, and retain a narrow non-effectful validation allowlist.
- **Evidence:** basher forwards `params.command` at lines 79-139; runtime forwards it unchanged with `mode: 'assistant'` (`packages/agent-runtime/src/tools/handlers/tool/run-terminal-command.ts:20-32`); SDK invokes `bash -c` (`sdk/src/tools/run-terminal-command.ts:220-236`). `tool-executor.ts` enforces tool availability, not command semantics, while approval rules exist only as prose at `common/src/tools/params/tool/run-terminal-command.ts:82-92` and `docs/agents-and-tools.md:33`.

## [HIGH] Correctness / test coverage — agents/e2e/editor-best-of-n.e2e.test.ts:12 — Best-of-N coverage is stale and vacuous

- **Risk:** The suite implies parallel proposals, selection, and winner application remain protected, but it defines a single leaf agent and accepts words already present in the prompt, so removal or total failure of the workflow is invisible.
- **Fix:** Remove/rename the obsolete test if the feature is intentionally gone, or restore an active orchestrator test that asserts N starts, selector evidence, an applied mutation receipt, and exact final contents.
- **Evidence:** the local definition has `spawnableAgents: []` and no orchestration `handleSteps` (`:12-23`); `params.n` is unused (`:74-79`); assertions accept prompt terms (`:96-115`); `agents/tsconfig.json:14-19` excludes it and `agents/tool-reachability.test.ts:121-139` states the definitions were deleted.

## [MEDIUM] Correctness / UX — agents/basher.ts:141 — `what_to_summarize` labels output but does not summarize it

- **Risk:** Callers can request “only failures” yet receive a fixed head-truncated report containing unrelated output and possibly missing the relevant tail, creating misleading validation feedback.
- **Fix:** Rename the parameter to reflect deterministic labeling, or implement structured focus extraction with head/tail preservation and an explicit fallback; expose truncation metadata.
- **Evidence:** the system/spawner promises analysis and focus at lines 13-14 and 61-78, but lines 141-238 only append fixed fields and the first 8,000 stdout/4,000 stderr characters. `agents/__tests__/basher.test.ts:257-285` intentionally asserts no provider step.

## [MEDIUM] Error handling / UX contract — sdk/src/tools/run-terminal-command.ts:288 — Timeout and spawn failures reject outside the normal command-result schema

- **Risk:** Basher and other callers lose exit status, partial output, elapsed time, and a typed timeout indicator; users see a generic tool/agent crash rather than a recoverable validation result.
- **Fix:** Return a deterministic result for operational failures (`timedOut`, `spawnFailed`, partial stdout/stderr, command, elapsedMs); reserve rejection for caller cancellation or runtime corruption.
- **Evidence:** timeout rejects at lines 288-301 and spawn error rejects at 372-389; runtime and basher do not translate either (`run-terminal-command.ts:31-32`, `basher.ts:129-157`). Existing basher tests cover forwarding but not timeout recovery.

## [MEDIUM] State mutation / cancellation — sdk/src/tools/run-terminal-command.ts:135 — Cancelling a request does not stop background commands

- **Risk:** A user can cancel the owning agent while its dev server/watcher continues running; the cleanup burden is shifted to a later `kill_job` call that the cancelled orchestrator may never issue.
- **Fix:** Associate background jobs with request/agent ownership, support `detach: true` as an explicit choice, and cancel owned jobs by default on request cancellation/end while surfacing any retained jobs.
- **Evidence:** the API comment explicitly says background jobs are unaffected by `AbortSignal` at lines 135-139 and 248-252. End-turn only reports pending work (`packages/agent-runtime/src/tools/handlers/tool/end-turn.ts:24-49`); it does not guarantee cleanup on cancellation.

## [MEDIUM] State mutation / process lifecycle — sdk/src/tools/background-jobs.ts:327 — Kill and timeout target only the shell process, not its tree

- **Risk:** Package scripts, pipelines, and dev servers can leave grandchildren alive after Openbuff reports a job stopped, leaking ports and mutations across turns.
- **Fix:** spawn process groups/job objects, terminate the full tree on timeout/cancel/kill, await confirmed exit, and report residual cleanup failure.
- **Evidence:** background spawn has no detached process-group ownership at lines 327-343; kill calls only `job.child.kill(signal)` or one PID at 504-519. Sync timeout similarly kills only `childProcess` at `run-terminal-command.ts:288-300`.

## [MEDIUM] Security / state lifecycle — agents/basher.ts:112 — Full-log mode persists unowned `/tmp` output

- **Risk:** Test/build output containing secrets, internal paths, or source fragments remains in a shell-created temp file with no retention or cleanup contract; the model receives its path.
- **Fix:** reuse the SDK’s exclusive/no-follow log facility with owner-only permissions, redaction, TTL/end-of-run cleanup, and explicit retention consent.
- **Evidence:** lines 112-126 pipe output through `tee /tmp/openbuff-basher-<uuid>.log`, and lines 164-167 publish it. Tests validate creation/reporting but not permissions or cleanup. SDK background logs use guarded creation at `sdk/src/tools/background-jobs.ts:316-326`.

## [MEDIUM] Correctness / orchestrator UX — agents/editor/editor.ts:224 — Incomplete target progress is neither authoritative nor consumed

- **Risk:** Editor can return pending required files without blocking completion, while unrelated backticked filenames from examples or non-goals can be misclassified as targets; the parent’s validation handoff therefore cannot reliably distinguish complete from partial implementation.
- **Fix:** pass target files structurally, emit `complete|partial|failed` plus per-target reasons, and require the orchestrator to resolve incomplete required targets before finalization.
- **Evidence:** `targetFileProgress` is emitted at lines 224-239; target extraction scans all backticked filenames at 403-420. Search finds consumers only in editor tests, while base2 tracks confirmed changed files rather than progress (`agents/base2/base2.ts:1602-1637`).

## [LOW] API/ABI contract — agents/basher.ts:45 — Basher’s input schema drifts from the terminal tool

- **Risk:** Invalid `process_type` values fail late, timeout constraints differ, and lack of `cwd` encourages fragile `cd ... &&` command strings.
- **Fix:** share the canonical schema subset: `SYNC|BACKGROUND` enum, bounded/integer timeout, and project-contained cwd.
- **Evidence:** basher declares `process_type` as unrestricted string and has no cwd at lines 45-53; canonical params define enum/cwd in `common/src/tools/params/tool/run-terminal-command.ts:53-70`.

## Rejected / downgraded candidates

- **Terminal cwd can escape project — rejected.** SDK now resolves lexical and realpath/symlink containment and returns an invalid-cwd result (`sdk/src/tools/run-terminal-command.ts:141-161`), with dedicated tests.
- **Terminal output grows without bound — rejected.** Sync output has streaming accumulation caps and final truncation (`run-terminal-command.ts:304-359`); background output is file-backed. The remaining issue is log retention, not memory growth.
- **Tool permissions are absent — rejected.** Runtime checks whether an agent may call a tool (`tool-executor.ts:505-515,677`); the verified gap is effect-level approval within an authorized shell tool.
- **Best-of-N implementation is silently active — rejected.** Active reachability tests explicitly treat the old IDs as removed; this is a stale test/documentation contract, not an active hidden workflow.
- **Dependency hygiene issue — not established.** No undeclared or vulnerable third-party dependency was evidenced in this scope.

## Coverage across 8 domains

- Security: enforceable shell approval and persistent log exposure.
- Correctness: misleading summary parameter, stale best-of-N test, incomplete editor handoff.
- State mutation: process-tree leaks, background ownership on cancellation, temp-log lifecycle.
- Error handling: timeout/spawn failures escape structured command results.
- Performance: bounded output is present; orphan processes and serial recovery create indirect resource/latency costs.
- Dependency hygiene: no concrete issue found.
- Test coverage: no meaningful best-of-N E2E; missing timeout-result, tree-kill, cancellation ownership, log cleanup, and editor-partial orchestration tests.
- API/ABI contract: basher schema drifts from canonical terminal params; `what_to_summarize` and editor progress overpromise their semantics.
