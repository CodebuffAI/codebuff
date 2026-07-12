# Orchestrator core — file-picker audit

## Compact inventory for paired code-searcher

| Flow | Primary files / symbols | Tests to inspect | Search next |
|---|---|---|---|
| Mode construction and tools | `agents/base2/base2.ts:22` `createBase2`; wrappers `base2-{plan,execute-plan,fast,fast-no-validation,evals}.ts`; `agents/base2/base-deep.ts:315` `createBaseDeep` | `agents/__tests__/base2.test.ts:80-350`, `:2582-2631`; slow-only `agents/e2e/base-deep.e2e.test.ts:15-600` | Mode/tool/spawnable parity, actual plan-only edit enforcement, execute-plan resume behavior |
| Discovery/spawn policy | `agents/base2/base2.ts:104-250`, `:3322-3330`; `base-deep.ts:39-68`; `quality-prompt-section.ts:60-74` | prompt assertions in `base2.test.ts:321-350`, `quality-prompt-snapshot.test.ts:53-74` | Runtime tests for scope classification, required joins, mentioned-agent routing, spawn failure/timeout |
| Gate lifecycle/completion | `base2.ts:351-1530` `handleSteps`; state `gate-state.ts:1-118` | `base2.test.ts:352-2679`; `gate-lifecycle.e2e.test.ts`; `reviewer-spawn-conditions.e2e.test.ts` | step-cap with dirty files; cancellation during gate/repair/reviewer; restart/resume from every phase |
| Changed-file/path tracking | `gate-files.ts:26-122`; `gate-paths.ts:12-59`; inline mirrors `base2.ts:1602-1691`, `:2089-2661` | `gate-changed-files`, `gate-files-parity`, `gate-paths` | absolute outside-cwd paths, symlinks, deletes/renames, dirty-tree overlap |
| Aux agents | `base2.ts:653-805`, selectors `:1693-1849` | `gate-aux-triggers.test.ts`; `gate-aux-ordering.e2e.test.ts` | Result/verdict consumption, multi-package sets, user opt-out, no-op agents, latency/cost |
| Validation repair | `gate-repair.ts:47-177`; inline `base2.ts:1026-1276`, `:3095-3319` | `gate-repair*`, telemetry assertions `base2.test.ts:3120-3210` | editor crash/no-op, command timeout, repeated same failure, cancellation, rollback/partial edit |
| Reviewer contract | `gate-reviewer.ts:23-349`; inline `base2.ts:1279-1398`, `:2663-3030` | `gate-reviewer.test.ts`; reviewer e2e tests | malformed/contradictory results, background job loss across turns, timeout UX |
| Ask/cancel/recovery | prompt guidance `base2.ts:142`, `:199-221`, `:3359`; cancellation docs `docs/request-flow.md:230-239` | **No scoped orchestrator test found** | `ask_user` resume/cancel, Escape during child/hook/editor/reviewer, state cleanup and user-visible message |

## Findings

### [HIGH] Correctness / UX — step cap marks an ungated dirty turn finalizable

- **Evidence:** `agents/base2/base2.ts:557-569` handles `hitStepCap` by setting `currentPhase = 'final_response_allowed'`, enabling followups, and breaking before validation/review, even when `pendingGateFiles` already exist. The regression test explicitly expects this state with `src/a.ts` pending (`agents/__tests__/base2.test.ts:1010-1064`).
- **Risk:** reaching `maxAgentSteps` can present incomplete or unvalidated edits as a normal green completion, contradicting the documented rule that failed/timed-out validation blocks completion (`docs/agents-and-tools.md:36-37`).
- **Fix:** introduce an explicit `interrupted`/`step_cap_reached` phase; preserve pending gate state and return a non-green resume message instead of opening finalization.

### [HIGH] Correctness / UX — security-reviewer output is awaited but never interpreted

- **Evidence:** `agents/base2/base2.ts:772-799` yields `security-reviewer` and discards the result; no blocker/crash/verdict parsing follows. Yet docs say blocking security findings prevent completion (`docs/agents-and-tools.md:27`) and base-deep says `BLOCKING:` security findings block completion (`agents/base2/base-deep.ts:53`).
- **Risk:** a security reviewer can identify a critical auth/secrets issue and the orchestrator will continue to validation/code-review unchanged; crashes are also silent.
- **Fix:** define a structured security verdict contract and persist blockers/crashes in active state, or clearly make this advisory everywhere and surface its findings to the final reviewer.

### [HIGH] Correctness / Performance / UX — automatic test/doc agents fire for nearly every source edit

- **Evidence:** all recognized non-test source files trigger test-writer (`base2.ts:1693-1769`), and every file under `packages/*/src`, `agents/`, `common/src`, or `cli/src` is treated as public API (`:1772-1795`). The doc-writer always targets `docs/agents-and-tools.md` (`:756-764`). Docs confirm a CLI component edit typically spawns both agents (`docs/agents-and-tools.md:352-358`), although the routing policy says test/doc writers are for acceptance-criteria-required coverage (`docs/agents-and-tools.md:28`).
- **Risk:** tiny internal refactors incur two serial agents, may create unwanted tests/docs, and can pollute the agent-specific documentation with unrelated CLI/package changes.
- **Fix:** gate on behavior/public-contract evidence or explicit acceptance criteria; route docs by package/API ownership; expose an opt-out/preview in UX.

### [MEDIUM] Correctness — mixed-package test-writer routing uses only the first package command

- **Evidence:** `selectTestWriterTargets` returns every eligible target but derives one command from `targetFiles[0]` (`base2.ts:1759-1769`). The unit test codifies this first-target behavior (`gate-aux-triggers.test.ts:275`). Docs instead claim “For each package” the package’s own scripts run (`docs/agents-and-tools.md:354`).
- **Risk:** a cross-package edit gives test-writer misleading validation ownership; later packages can receive tests without the relevant command being reported/run.
- **Fix:** partition targets by package and spawn one writer per package, or pass a target-to-command map.

### [MEDIUM] Security — gate path normalization does not reject absolute paths outside cwd

- **Evidence:** `normalizeGateFilePath` rejects `..` but returns other absolute paths unchanged (`agents/base2/gate-paths.ts:12-40`; inline `base2.ts:1643-1672`). The fingerprint helper then calls `path.resolve(cwd, normalizedPath)` and synchronously reads/hashes it (`base2.ts:2577-2650`). Tests cover cwd absolute paths but not `/etc/...` or another workspace (`gate-paths.test.ts:96-150`).
- **Risk:** malformed/injected serialized gate state can make the orchestrator read/hash files outside the project boundary; at minimum this violates the stated project-relative invariant and can create confusing gate failures.
- **Fix:** resolve then require the result to be inside realpath(cwd), with explicit Windows-drive/UNC and symlink tests.

### [MEDIUM] API/UX — `context-pruner` is user-spawnable despite an explicit prohibition

- **Evidence:** `context-pruner` is in both spawn allowlists (`base2.ts:104-124`, `base-deep.ts:353-372`) while both prompts say never spawn it because `handleSteps` automatically does so (`base2.ts:222`, `base-deep.ts:67`; actual automatic spawn `base2.ts:523-531`). Docs also advertise it as orchestrator-spawnable (`docs/agents-and-tools.md:17`).
- **Risk:** model/user-mentioned routing can duplicate pruning, waste latency, and create confusing hidden child activity.
- **Fix:** remove it from public `spawnableAgents` and reserve `spawn_agent_inline` as a runtime-owned internal path; update docs.

## Coverage gaps across the 8 domains

- **Security:** absolute/symlink path containment and security-review verdict handling are uncovered.
- **Correctness:** no tests for aux-agent crash/no-op, mixed-package orchestration, or dirty step-cap recovery.
- **State mutation:** no scoped test cancels/restarts during `repair_loop`, `awaiting_review`, or a background reviewer job.
- **Error handling:** reviewer parsing is strong, but aux-agent failures and automatic context-pruner failure are not surfaced/tested.
- **Performance:** no latency/cost budget test for three serial aux spawns plus validation/review; proactive `query_index` also has prompt-only coverage.
- **Dependency hygiene:** no third-party dependency issue found in this shard; duplicated inline helper bodies remain a maintenance dependency enforced only partly by parity tests.
- **Test coverage:** cancellation (`docs/request-flow.md:230-239`), `ask_user` resume, plan-only behavioral enforcement, execute-plan artifact recovery, agent timeout/join, and spawn-policy behavior lack scoped end-to-end coverage. `base-deep.e2e.test.ts` is provider-gated/slow (`:20-21`) rather than deterministic CI coverage.
- **API/ABI contracts:** tool/spawnable arrays and `<gate-state>` are public behavioral contracts, but there are no full parity assertions across every mode/wrapper or compatibility tests for new active-work phases.
