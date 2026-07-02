# Shard S13 — Evals harness

**Auditor:** harness-audit-2026-06-30 / S13
**Scope:** `evals/buffbench/agent-runner.ts`, `judge.ts`, `eval-task-generator.ts`, `lessons-extractor.ts`, `plan-sharding-signals.ts`, `deterministic-signals.ts`, `analyze-task-scores.ts`, `setup-test-repo.ts`, `format-output.ts`, `main*.ts`, `run-buffbench.ts`, `run-plan-sharding-eval.ts`, `types.ts`, and tests under `evals/buffbench/__tests__/`. Also sampled current planner/event contracts in `common/src/types/print-mode.ts`, `common/src/tools/params/tool/spawn-agents.ts`, `agents/base2/quality-prompt-section.ts`, `agents/base2/base2-plan.ts`, and `agents/patterns/audit-codebase.md` for drift checks.

**Files inspected (line counts):**
- `evals/buffbench/agent-runner.ts` (198)
- `evals/buffbench/judge.ts` (337)
- `evals/buffbench/eval-task-generator.ts` (163)
- `evals/buffbench/lessons-extractor.ts` (319)
- `evals/buffbench/plan-sharding-signals.ts` (812)
- `evals/buffbench/deterministic-signals.ts` (227)
- `evals/buffbench/analyze-task-scores.ts` (488)
- `evals/buffbench/setup-test-repo.ts` (311)
- `evals/buffbench/format-output.ts` (216)
- `evals/buffbench/main.ts` (27)
- `evals/buffbench/main-hard-tasks.ts` (49)
- `evals/buffbench/main-nightly.ts` (114)
- `evals/buffbench/main-single-eval.ts` (23)
- `evals/buffbench/run-buffbench.ts` (654)
- `evals/buffbench/run-plan-sharding-eval.ts` (222)
- `evals/buffbench/types.ts` (83)
- `evals/buffbench/__tests__/deterministic-signals.test.ts` (429)
- `evals/buffbench/__tests__/plan-sharding-signals.test.ts` (841)
- `evals/buffbench/__tests__/compare-runs.test.ts` (480)
- `evals/buffbench/__tests__/proposals.test.ts` (590)
- Contract references: `common/src/types/print-mode.ts` (158), `common/src/tools/params/tool/spawn-agents.ts` (235), `agents/base2/quality-prompt-section.ts` (176), `agents/base2/base2-plan.ts` (8), `agents/patterns/audit-codebase.md` (249)

## Audit Domains Covered
1. **Security** — token/log leakage, untrusted repo command execution surface, prompt-injection surfaces in judge/lesson extraction.
2. **Correctness** — signal extraction drift, score aggregation, prompt/spec parity, final-check interpretation.
3. **State mutation** — trace/log state accumulation, shared run filtering state, background process lifetime after timeout.
4. **Error handling** — swallowed judge/extractor failures, abort/timeout non-propagation, parse skips.
5. **Performance** — unbounded command/runtime duration, serial final checks, costly repeated eval analysis, large prompt/log payloads.
6. **Dependency hygiene** — graveyard agent dependencies and event/schema drift against current tool contracts.
7. **Test coverage gaps** — missing regression tests for current planner output, timeout cancellation, judge prompt parity, log filtering.
8. **API/ABI contract breaks** — `PrintModeEvent`/`spawn_agents` payload assumptions, eval JSON filename/log schema assumptions, config fields not represented in consumers.

---

## Findings

### S13-F01 — Plan-sharding eval default prompt bypasses the M10 minimum-shard/coverage gates it is meant to test
**Severity:** High
**Domain:** Correctness; Test coverage gaps; API/ABI contract breaks
**Files:**
- `evals/buffbench/run-plan-sharding-eval.ts` lines 40–45, 102–119
- `evals/buffbench/plan-sharding-signals.ts` lines 236–287, 512–552, 735–812

**Observation.** The live plan-sharding eval's default prompt is:
```ts
'Audit this codebase for any feature improvements that can be made. Survey the major subsystems and surface concrete opportunities.'
```
(`run-plan-sharding-eval.ts:40-41`). The eval then classifies breadth from that same prompt and feeds it into the M10 coverage diagnostics (`run-plan-sharding-eval.ts:102-119`). But `classifyBreadth` only returns `broad-audit` when the prompt has either `>= 3` known domain tokens or a hard-coded breadth marker such as `whole codebase`, `entire codebase`, or `across the codebase` (`plan-sharding-signals.ts:236-287`). The default says only `codebase` / `major subsystems`, neither of which is a breadth marker or a known domain token.

As a result, `evaluateMinimumShardRule` returns vacuous success for this default because `breadth.kind !== 'broad-audit'` (`plan-sharding-signals.ts:512-526`), and the final verdict only enforces the older low bar of at least two subagents or a batch of two (`plan-sharding-signals.ts:735-812`). The M10-era `max(domainCount, 5)` shard-pair requirement and coverage-matrix diagnostics do not actually gate the default live eval.

**Impact.** A planner regression that spawns only two generic agents for a broad audit can still pass the live plan-sharding eval. This is exactly the drift hotspot called out for S13: signal extractor behavior no longer matches the current broad-audit contract.

**Recommendation.** Make the default prompt unambiguously match the current broad-audit contract, e.g. include `whole codebase` plus explicit domains (`agents`, `sdk`, `cli`, `common`, `evals`, `scripts`, `docs`, `packages`). Add a test asserting `classifyBreadth(DEFAULT_PROMPT).kind === 'broad-audit'` and that `evaluateShardingVerdict(signals, DEFAULT_PROMPT)` fails with fewer than five file-picker/code-searcher pairs.

**Evidence.**
- Default prompt: `evals/buffbench/run-plan-sharding-eval.ts:40-45`.
- M10 diagnostics derive from `classifyBreadth(prompt)`: `evals/buffbench/run-plan-sharding-eval.ts:102-119`.
- Hard-coded breadth markers/domains and broad-audit rule: `evals/buffbench/plan-sharding-signals.ts:236-287`.
- Minimum-shard rule is vacuous for non-`broad-audit`: `evals/buffbench/plan-sharding-signals.ts:512-526`.

---

### S13-F02 — `spawn_agents` batch counting collapses repeated agent types to one, so early/truncated traces can falsely fail the minimum-shard rule
**Severity:** High
**Domain:** Correctness; API/ABI contract breaks; Test coverage gaps
**Files:**
- `evals/buffbench/plan-sharding-signals.ts` lines 340–374, 443–452, 468–499
- `common/src/tools/params/tool/spawn-agents.ts` lines 68–112
- `evals/buffbench/__tests__/plan-sharding-signals.test.ts` lines 228–294, 339–377

**Observation.** Current `spawn_agents` input is an array of entries with `agent_type`, `prompt`, optional `background`, `handoff`, `timeout_seconds`, and `params` (`common/src/tools/params/tool/spawn-agents.ts:68-112`). The extractor reads that array and records every requested `agent_type` (`plan-sharding-signals.ts:340-374`). But `computePlanShardingSignals` folds those types into a `Set` (`plan-sharding-signals.ts:481-487`), and `countAgentType` then counts a type from the spawn request as only `1` when it is present in `distinctAgentTypes` (`plan-sharding-signals.ts:443-452`).

This contradicts the local comment that the rule should inspect the sharding decision visible in the `spawn_agents` request before `subagent_start` fires (`plan-sharding-signals.ts:435-441`). If a planner requests five `file-picker` and five `code-searcher` agents in one batch but the trace is captured before all `subagent_start` events, the current logic reports `filePickerCount = 1` and `codeSearcherCount = 1`, not `5` and `5`.

**Impact.** The live eval can produce false failures whenever trace capture is incomplete, subagent starts are delayed, background spawning is introduced, or event streaming changes. That makes the signal extractor brittle against current/future planner output even when the actual `spawn_agents` request satisfied the contract.

**Recommendation.** Preserve per-type counts from `spawnCalls.flatMap(c => c.agentTypes)` and compute `countAgentType` as `max(startsCount, requestedTypeCount)`, not `max(startsCount, distinctPresence)`. Add tests for a single `spawn_agents` call with repeated `file-picker`/`code-searcher` entries and no `subagent_start` events, asserting the M10 pair count equals the requested count.

**Evidence.**
- Batch extraction reads the `agents` array: `evals/buffbench/plan-sharding-signals.ts:340-374`.
- Counts collapse to `distinctAgentTypes.includes(agentType) ? 1 : 0`: `evals/buffbench/plan-sharding-signals.ts:443-452`.
- Existing tests cover extraction and generic batch sharding, but do not assert repeated-type pair counts for M10: `evals/buffbench/__tests__/plan-sharding-signals.test.ts:228-294`, `339-377`.

---

### S13-F03 — Coverage/subsystem enumeration validates the user prompt, not the planner output
**Severity:** High
**Domain:** Correctness; API/ABI contract breaks; Test coverage gaps
**Files:**
- `evals/buffbench/run-plan-sharding-eval.ts` lines 107–119
- `evals/buffbench/plan-sharding-signals.ts` lines 236–250, 560–735

**Observation.** The live eval claims M10.3/M10.4 visibility into "which enumerated domains got a shard" and which top-level dirs were audited (`run-plan-sharding-eval.ts:107-119`). However, both the coverage matrix and subsystem-enumeration guard are driven solely by `breadth.domains`, which is extracted from the **input prompt**, not from planner text, handoffs, shard prompts, finding files, or any explicit coverage artifact (`plan-sharding-signals.ts:560-735`).

This creates both false positives and false negatives:
- A prompt listing top-level dirs can satisfy coverage/enumeration even if the planner never assigned them.
- A prompt using `whole codebase` with no explicit domain tokens yields no prompt domains, so diagnostics can mark everything uncovered even if the planner enumerated the repository correctly.
- `run-plan-sharding-eval.ts` filters out dot directories when listing top-level dirs (`.filter((d) => d.isDirectory() && !d.name.startsWith('.'))`, lines 113–115), while the audit spec includes `.agents` as an in-scope subsystem.

**Impact.** The eval can certify or reject coverage based on wording in the input prompt rather than actual planner behavior. This misses the current broad-audit requirement that the planner explicitly enumerate subsystems and write a coverage matrix before synthesis.

**Recommendation.** Extract coverage evidence from planner output: shard prompts/handoffs, durable session artifacts (`PLAN.md`, `COVERAGE-MATRIX.md`), or structured events. At minimum, use `PrintModeSubagentStart.prompt/params` and `spawn_agents` handoff payloads to map shard assignments, and include `.agents` in the top-level subsystem list when evaluating this repository.

**Evidence.**
- Live eval derives `breadth` from `prompt` and `topLevelDirs` from filesystem only: `evals/buffbench/run-plan-sharding-eval.ts:107-119`.
- Known domains are a fixed prompt-token list: `evals/buffbench/plan-sharding-signals.ts:236-250`.
- Coverage matrix assigns prompt domains round-robin across counted pairs: `evals/buffbench/plan-sharding-signals.ts:560-639`.
- Subsystem enumeration checks top-level dirs against prompt-derived domains: `evals/buffbench/plan-sharding-signals.ts:690-735`.

---

### S13-F04 — Task-runner timeout does not abort the underlying agent/process, and final check commands have no timeout
**Severity:** High
**Domain:** State mutation; Error handling; Performance
**Files:**
- `evals/buffbench/agent-runner.ts` lines 62–145, 162–194
- `evals/buffbench/run-buffbench.ts` lines 444–472

**Observation.** `runAgentOnCommit` wraps `withTestRepo(... runner.run(commit.prompt) ...)` in a 60-minute `withTimeout` (`agent-runner.ts:62-145`), but it does not pass an `AbortSignal` into any runner, does not call a runner cancellation method, and does not kill child processes for external runners. If the timeout promise rejects, the underlying `runner.run`/external CLI can continue running and mutating the temp repo/logs after the task has already been marked errored.

Final checks are even less bounded: `runFinalCheckCommands` uses `execAsync(command, { cwd, encoding, maxBuffer, env })` with no `timeout` or `signal` (`agent-runner.ts:162-194`). A hung test command can block an eval worker indefinitely, outside the 60-minute agent timeout once the agent run itself has completed.

**Impact.** Timed-out evals can leak child processes, keep repositories checked out, continue consuming API/CLI resources, and race with cleanup/log writing. A single hung final check can stall `Promise.allSettled(commitPromises)` and therefore the entire benchmark.

**Recommendation.** Introduce per-task `AbortController` ownership. Pass the signal through Codebuff and external runners, terminate spawned child processes on timeout, and make `withTestRepo` cleanup wait for confirmed process termination. Add explicit timeouts for each final check command (configurable per eval file), record timeout as `exitCode`/`error`, and test with a command that never exits.

**Evidence.**
- `withTimeout` wraps the promise but no abort signal is created or passed: `evals/buffbench/agent-runner.ts:62-145`.
- `runner.run(commit.prompt)` is awaited without cancellation plumbing: `evals/buffbench/agent-runner.ts:98`.
- Final check `execAsync` has no `timeout`/`signal`: `evals/buffbench/agent-runner.ts:172-177`.
- Tasks run concurrently under `p-limit`, so leaked/hung workers affect the whole run: `evals/buffbench/run-buffbench.ts:444-472`.

---

### S13-F05 — Error filtering excludes every agent for a commit when any one agent errors, creating false positives/negatives in eval summaries
**Severity:** Medium-High
**Domain:** Correctness; Error handling; Test coverage gaps
**Files:**
- `evals/buffbench/run-buffbench.ts` lines 474–528, 610–650
- `evals/buffbench/analyze-task-scores.ts` lines 43–88

**Observation.** After all tasks settle, BuffBench records a `commitSha` in `commitShasWithErrors` if **any** agent result for that commit has `evalRun.error` (`run-buffbench.ts:474-483`). It then filters every agent's averages with `!commitShasWithErrors.has(r.commitSha)` (`run-buffbench.ts:493-528`) and prints summaries using the same commit-level exclusion (`run-buffbench.ts:610-650`).

This is too coarse for multi-agent comparisons. If `external:claude` times out on a task but `base2` succeeds, `base2`'s successful run is removed from its average. Conversely, a failing agent can avoid its failure affecting average score by causing commit-level exclusion for everyone.

`analyze-task-scores.ts` has a related ordering problem: it scans JSON files and stores only the first `judgeResult.overallScore` seen for each task key (`analyze-task-scores.ts:43-88`), with a comment that scores "should be the same across agents". They are not; the whole benchmark compares agents. The task difficulty report is therefore filesystem-order and agent-order dependent.

**Impact.** Reported averages, hard-task lists, and regression comparisons can be materially wrong. This is a log filtering false-positive risk: infra/runner errors for one agent suppress valid signal from other agents, and score analysis silently drops later agents.

**Recommendation.** Separate infrastructure-invalid tasks from agent failures. Only exclude all agents for a commit when the shared setup/judge infrastructure failed before per-agent execution; otherwise keep per-agent error counts and include successful peer runs. In `analyze-task-scores.ts`, aggregate per task across all agents/runs or require an explicit `--agent` filter; never take the first JSON file as representative.

**Evidence.**
- Commit-level error set is populated if any agent errors: `evals/buffbench/run-buffbench.ts:474-483`.
- Averages and summaries filter by that commit set: `evals/buffbench/run-buffbench.ts:493-528`, `610-650`.
- Score analyzer takes first score per task and ignores later agent scores: `evals/buffbench/analyze-task-scores.ts:43-88`.

---

### S13-F06 — Judge prompt omits the generated task `spec`, so judging is not parity-preserving with eval generation
**Severity:** Medium-High
**Domain:** Correctness; API/ABI contract breaks; Test coverage gaps
**Files:**
- `evals/buffbench/eval-task-generator.ts` lines 31–46, 74–93
- `evals/buffbench/types.ts` lines 29–35
- `evals/buffbench/judge.ts` lines 225–267, 322–335

**Observation.** The task generator explicitly emits both a precise `spec` and a high-level `prompt` (`eval-task-generator.ts:31-46`), and its instructions say the spec should prescribe exactly what needs to be implemented while the prompt should omit details that should be reconstructed by the agent (`eval-task-generator.ts:74-93`). `EvalCommitV2` stores both fields (`types.ts:29-35`).

The judge, however, destructures only `{ prompt, fileDiffs }` from the commit (`judge.ts:237`) and builds its evaluation prompt from the user prompt, context files, ground truth diffs, agent diff, errors, and final check outputs (`judge.ts:251-265`). It does not include the generated `spec` at all. Deterministic clamping can cap scores for failing final checks (`judge.ts:322-335`), but it does not restore missing semantic requirements from the spec.

**Impact.** The judge is asked to be lenient for high-level prompts, while the ground truth was generated from a more precise spec that the coding agent and judge never see. This can over-credit plausible but incomplete implementations or under-explain why a solution diverged from the intended task. It is a judge-prompt parity bug between generation and scoring.

**Recommendation.** Include `commit.spec` in the judge prompt as "Evaluation Specification (hidden from coding agent if applicable)" or explicitly document and test that the judge must score only the user prompt. If the spec remains hidden from the coding agent, use it as judge-only rubric context so the benchmark measures intended behavior rather than filename/diff similarity alone.

**Evidence.**
- Generator output requires `spec` and `prompt`: `evals/buffbench/eval-task-generator.ts:31-46`.
- Generator instructions distinguish precise spec from high-level prompt: `evals/buffbench/eval-task-generator.ts:74-93`.
- `EvalCommitV2` stores both `spec` and `prompt`: `evals/buffbench/types.ts:29-35`.
- Judge prompt omits `spec`: `evals/buffbench/judge.ts:225-267`.

---

### S13-F07 — `setup-test-repo` exposes authentication details in logs and runs init commands through a brittle whitespace split
**Severity:** Medium
**Domain:** Security; Correctness; Error handling; API/ABI contract breaks
**Files:**
- `evals/buffbench/setup-test-repo.ts` lines 108–155, 255–275, 286–306

**Observation.** When `CODEBUFF_GITHUB_TOKEN` is set, `setupTestRepo` embeds it into the clone URL (`setup-test-repo.ts:108-145`) and logs token metadata, including a ten-character prefix (`setup-test-repo.ts:145`) and, on authentication errors, token prefix and length (`setup-test-repo.ts:286-306`). The clone/fetch commands run with `stdio: 'inherit'`, so git diagnostics can also be printed directly to CI logs.

The same function executes `initCommand` by `const [command, ...args] = initCommand.split(' ')` and `execFileSync(command, args, ...)` (`setup-test-repo.ts:255-275`). This avoids shell injection, but it is not a shell-compatible parser: quoted arguments, escaped spaces, environment prefixes, `&&`, and package-manager commands with quoted filters are all misinterpreted. Since `initCommand` is part of the eval JSON/API contract, this can make valid eval configurations fail only at runtime.

**Impact.** CI logs can leak enough token metadata to aid secret correlation, and valid repository setup commands can fail or run with different arguments than authors intended. In the worst case, a failed init is reported as an eval task failure rather than a configuration/runtime contract failure.

**Recommendation.** Never print token prefixes or lengths. Prefer Git credential helpers or `GIT_ASKPASS` over embedding tokens in remotes, and scrub all command output before logging. Replace `initCommand: string` with a structured `{ command, args, env?, timeoutMs? }` schema, or use a documented shell execution mode with explicit security constraints.

**Evidence.**
- Token URL construction and logging: `evals/buffbench/setup-test-repo.ts:108-155`.
- Naive `initCommand.split(' ')`: `evals/buffbench/setup-test-repo.ts:255-275`.
- Authentication troubleshooting prints token metadata: `evals/buffbench/setup-test-repo.ts:286-306`.

---

### S13-F08 — Lessons extraction and task generation depend on legacy/graveyard agents with little contract coverage
**Severity:** Medium
**Domain:** Dependency hygiene; API/ABI contract breaks; Test coverage gaps
**Files:**
- `evals/buffbench/eval-task-generator.ts` lines 1–24, 107–162
- `evals/buffbench/lessons-extractor.ts` lines 27–113, 193–267
- `evals/buffbench/__tests__/proposals.test.ts` lines 1–220

**Observation.** `eval-task-generator.ts` imports `fileExplorerDef` and `findAllReferencerDef` from `agents-graveyard/file-explorer/*` and exposes them as spawnable agents for eval task generation (`eval-task-generator.ts:1-24`, `107-121`). `lessons-extractor.ts` similarly declares `spawnableAgents: ['file-picker', 'find-all-referencer']` (`lessons-extractor.ts:27-113`) even though the local agent definitions passed to it may not include a current, supported `find-all-referencer` implementation.

The tests cover proposal parsing/application (`__tests__/proposals.test.ts`) and deterministic/plan signals, but there is no smoke test that the eval-task-generator or lessons-extractor agent definitions resolve all declared spawnable agents/tools against the current local agent set.

**Impact.** A cleanup or API drift in graveyard agents can silently break eval generation or lesson extraction. Since both functions wrap LLM calls and return coarse errors/empty lessons on failure, the harness can lose learning/proposal signal without failing a benchmark loudly.

**Recommendation.** Move required eval helper agents out of `agents-graveyard` or vendor stable definitions under `evals/buffbench`. Add a contract test that loads local agents plus these eval agents and asserts every `spawnableAgents` id and `toolNames` entry resolves under the same validation path used by `OpenbuffClient.run`.

**Evidence.**
- Graveyard imports and spawnable agents in generator: `evals/buffbench/eval-task-generator.ts:1-24`, `107-121`.
- Lessons extractor declares `find-all-referencer`: `evals/buffbench/lessons-extractor.ts:27-113`.
- Existing tests do not cover generator/extractor agent resolution; proposal tests start at parser/application boundaries: `evals/buffbench/__tests__/proposals.test.ts:1-220`.

---

## Summary

| Audit domain | Findings |
|---|---|
| Security | F07 |
| Correctness | F01, F02, F03, F05, F06, F07 |
| State mutation | F04 |
| Error handling | F04, F05, F07 |
| Performance | F04 |
| Dependency hygiene | F08 |
| Test coverage gaps | F01, F02, F03, F05, F06, F08 |
| API/ABI contract breaks | F01, F02, F03, F06, F07, F08 |

**Top three risks to prioritize:**
1. **F01 + F03 (plan-sharding eval validates prompt heuristics instead of current planner coverage output)** — high chance of missing the broad-audit regression this eval exists to catch.
2. **F04 (timeouts do not abort runners/final checks)** — can leak expensive or mutating work after a task is already marked failed.
3. **F05 (commit-level error filtering and first-score task analysis)** — benchmark summaries can be wrong even when raw logs are correct.

**No source edits performed.** Only this finding file under `.agents/sessions/harness-audit-2026-06-30/findings/` was written.
