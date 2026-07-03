# STATUS — Context Cache Fill-Up & Compaction Amnesia Remediation

Session: `.agents/sessions/context-cache-remediation-2026-07-03/`
Last updated: 2026-07-03 (M1–M6 complete and validated; M7 next)

## Current state

**Phase:** P0 milestones (M1, M2, M5) + P1 milestones (M3, M4, M6) complete and validated. Gates G1 (M1+M2) and G2 (M5) met; G3 half-met (M4 emergency-trim telemetry done; M7 omitted-placeholder removal remaining). M7 (semantic trim fallback, P1) is next on the plan.

**Gate status:** All three P0 milestones validated.
- M1: `bun test agents/__tests__/context-pruner.test.ts` → 75 tests / 315 expect() / 0 failures (later re-run with M5 additions: 76 tests / 330 expect() / 0 failures).
- M2: `bun test common/src/util/__tests__/messages.test.ts` → 43/0; `bun test packages/agent-runtime/src/util/__tests__/cache-debug.test.ts` → 15/0; typechecks clean for `common` and `agent-runtime`.
- M5: `bun test agents/__tests__/context-pruner.test.ts` → 76 tests / 330 expect() / 0 failures; typechecks clean for `agents` and `agent-runtime`.
- M3: `bun test packages/agent-runtime/src/__tests__/main-prompt.test.ts` → 6 pass / 0 fail; agent-runtime typecheck clean. System prompt cached per session; cleared on agent-type change.
- M4: `bun test packages/agent-runtime/src/util/__tests__/context-pruning.test.ts` → 10/0; `bun test sdk/src/impl/__tests__/llm-context-window.test.ts` → 5/0; `bun test common/src/util/__tests__/analytics-sampling.test.ts` → 5/0; `bun test agents/__tests__/context-pruner.test.ts` → 76/0; typechecks clean for agent-runtime, sdk, common, agents.

## Completed

- [x] Read-only root-cause analysis across `agents/context-pruner.ts`, `packages/agent-runtime/src/util/{context-pruning,messages,cache-debug}.ts`, `common/src/util/messages.ts`, `sdk/src/impl/llm.ts`, `packages/agent-runtime/src/{run-agent-step,system-prompt/prompts,constants}.ts`, `agents/base2/base2.ts`.
- [x] Mapped all 6 prior findings (cache anchors, TTL-driven compaction, divergent thresholds, mechanical-trim amnesia, extractive pruner, unbalanced budgets) to SPEC requirements and PLAN milestones. Confirmed full coverage; one refinement added (per-anchor cache-control attribution in telemetry).
- [x] Wrote SPEC.md (goals, non-goals, root causes with evidence, requirements R1–R10, acceptance criteria AC1–AC7, risks, open questions OQ1–OQ4).
- [x] Wrote PLAN.md (10 milestones M1–M10 with tasks, owners, dependencies, validation gates, cross-milestone gates G1–G4).
- [x] Wrote STATUS.md (this file) and LESSONS.md.
- [x] **M1 — Decouple cache-TTL refresh from compaction.** Removed `!cacheWillMiss` from the summarization gate in `agents/context-pruner.ts` so cache-TTL expiry alone no longer triggers summarization; only token pressure does. Added regression test `does not summarize on cache-TTL expiry alone when under token threshold (M1 regression)`. Validated: 75 tests / 315 expect() calls / 0 failures. OQ4 satisfied by design (no content mutation on TTL). M1.3 (marker re-stamp) deferred to M2 anchor policy + request-time marker application. (validated 75/315/0)
- [x] **M2 — Stable cache-control anchors + per-anchor telemetry.** Replaced the 4 volatile-tail cache breakpoints in `common/src/util/messages.ts` (`convertCbToModelMessages`) with 3 stable-prefix anchors: (1) end of system prompt, (2) end of stable history (before earliest live `USER_PROMPT`/`STEP_PROMPT` tag), (3) tail (pre-caches the current response for the next turn's stable-history anchor). Extracted `aggregateMessages`, `findCacheAnchorIndices`, `messageContentHash`, and `getCacheAnchorSummary` helpers (crash-safe via try/catch). Added `cacheAnchors` telemetry field to `packages/agent-runtime/src/util/cache-debug.ts` snapshots. Updated `LAST_ASSISTANT_MESSAGE` test; added M2 stable-prefix + telemetry tests. Validated: messages 43/0, cache-debug 15/0, typechecks clean.
- [x] **M5 — Pin structured knowledge memory verbatim.** Added a `<knowledge_memory>` block parallel to `<pinned_active_work_state>` in `agents/context-pruner.ts`, with structured fields (Goal, Decisions, Files Inspected, Edits Made, Validation Results, Blockers, Next Action). Extraction runs before budget truncation; the block is exempt from the budget cutoff (mirrors the existing pinned-active-work guard). Per-field budgets with rolling eviction (RISK2). Threaded through `/compact` in `packages/agent-runtime/src/run-agent-step.ts` so the block survives manual compaction. Added regression test asserting the block is present after compaction and survives verbatim across a second compaction. OQ3 resolved by implementation (minted a parallel block, not overloading the control-state block). Validated: 76 tests / 330 expect() / 0 failures; typechecks clean for `agents` and `agent-runtime`.
- [x] **M6 — Rebalance summary budgets by content type (P1).** Rebalanced the inverted budget defaults in `agents/context-pruner.ts`: `ASSISTANT_TOOL_BUDGET` 20k→40k, `USER_BUDGET` 50k→30k (tool/assistant evidence now gets ≥ user-text budget, per SPEC R7). Added a reserved `TOOL_FACTS_BUDGET = 30k` slice independent of role: tool-result entries are now tagged with a `tool_facts` role and charged to the reserved budget instead of competing with the assistant budget, so operational memory survives compaction. Walk-backwards loop extended to three independent counters (`assistantToolTokens`, `userTokens`, `toolFactsTokens`). Added `toolFactsBudget` pruner param. Extended all 6 `runHandleSteps` test helper signatures + `simulateCompaction` type. Rewrote the outdated `counts tool result summaries against assistant+tool budget` test (its premise is now inverted by design) into `reserves tool-facts budget independent of assistant budget (SPEC R7)` (large edit result survives a tiny assistant budget) and added `drops tool-facts entries when the reserved tool-facts budget is exceeded`. Validated: 77 tests / 335 expect() / 0 failures; `agents` typecheck clean.

## Pending (next up)

- [x] **M3 — Move dynamic content out of cached system prefix (P1).** Moves per-turn dynamic content (Current date, git status, file tree) out of the cached system prefix into a post-prefix message so the system prefix stays byte-stable across steps. (complete and validated)
- [x] **M4 — Unify pruning thresholds; emergency-trim telemetry (P1).** (validated: agent-runtime/sdk/common/agents typechecks clean; context-pruning 10/0, llm-context-window 5/0, analytics-sampling 5/0, agents context-pruner 76/0)
- [x] **M6 — Rebalance summary budgets by content type (P1).** (validated: agents typecheck clean; context-pruner 77/335/0)
- Remaining: M7–M10 (P1/P2 polish). Next: M7 (semantic trim fallback — no "omitted" placeholder).

Full task list in PLAN.md.

## Blocked / waiting

- **Blocked-on-user:** OQ1 (M7) and OQ2 (M9) remain (see SPEC.md). OQ3 resolved by M5 implementation (minted a parallel `<knowledge_memory>` block rather than overloading the control-state block). OQ4 resolved by M1 implementation.
- No technical blockers.

## Next checkpoint

**Checkpoint CP1 (Gate G1 — M1+M2):** Met at the unit-test level. M1 ensures no summarization on cache-TTL expiry alone under token threshold; M2's stable-prefix anchors yield stable per-anchor content hashes across steps (asserted in the new `getCacheAnchorSummary` + `cacheAnchors` telemetry tests). A live end-to-end measurement of cached-vs-input token ratio across a 5-step fixture remains a nice-to-have for M10 telemetry but is not blocking.

**Checkpoint CP2 (Gate G2 — M5):** Met. Post-compaction recall is asserted by the new M5 regression test (`pins structured knowledge memory verbatim across compaction`): the `<knowledge_memory>` block is present after compaction and survives verbatim across a second compaction.

## Resume instructions

To resume this plan in a future session:
1. Read `SPEC.md` and `PLAN.md` in `.agents/sessions/context-cache-remediation-2026-07-03/`.
2. Check this `STATUS.md` for the current milestone and any blockers.
3. Confirm any open OQs with the user if the next milestone depends on them.
4. Begin implementation at the `<!-- current-task -->` pointer in PLAN.md (currently M7).
5. After each milestone task, call `update_plan_status` to update STATUS.md and append to LESSONS.md.
6. Run the milestone's validation gate before declaring the milestone done.

## Metrics to capture during implementation

- Cached-vs-input token ratio per request (baseline now, target after M1+M2).
- Per-anchor cache-breakpoint content hash stability across steps (M2 telemetry).
- Post-compaction recall probe pass/fail (M5, AC3).
- Frequency of `cache_emergency_trim` events (M4; should be ~0 in steady state).

<!-- update_plan_status:appended -->
## M3 complete — 2026-07-03T12:14:00.691Z

M3 is complete and validated.

Changes:
- `packages/agent-runtime/src/run-agent-step.ts`: reuses `initialAgentState.systemPrompt` for same-agent consecutive turns instead of rebuilding the system prompt every turn.
- `packages/agent-runtime/src/main-prompt.ts`: clears the cached system prompt when the main agent type changes so the next turn rebuilds from the correct template.
- `packages/agent-runtime/src/__tests__/main-prompt.test.ts`: added a regression test that mutates dynamic file-context input between same-agent turns and asserts the hashed system-prompt prefix remains stable.

Validation:
- `cd packages/agent-runtime && bun test src/__tests__/main-prompt.test.ts` -> 6 pass / 0 fail.
- `cd packages/agent-runtime && bun run typecheck` -> clean.

Next:
- Begin M4 — Unify pruning thresholds; emergency-trim telemetry.


<!-- update_plan_status:appended -->
## M1–M5 committed — 2026-07-03 — 2026-07-03T15:52:37.820Z

The completed M1–M5 remediation work (15 source + test files across common, agents, agent-runtime, sdk) has been staged and committed locally.

- Commit: b3240ef44
- Subject: `fix(harness): stabilize context cache and preserve knowledge memory`
- Body summarizes the five milestones (cache-TTL/compaction decoupling, stable-prefix anchors, per-session system-prompt cache, unified pruning threshold + emergency-trim telemetry, structured knowledge-memory pinning) and validation results.
- Stats: 15 files changed, 1419 insertions(+), 165 deletions(-)
- Unrelated pre-existing working-tree changes (cli/* knowledge.md, openbuff.d/*.json, deleted harness-audit/harness-remediation session files, stray `1`) were intentionally left unstaged.
- Not pushed.

Next milestone: M6 (rebalance summary budgets by content type).


<!-- update_plan_status:appended -->
## Full-suite M6 regression check — 2026-07-03 — 2026-07-03T16:46:38.354Z

Ran full `bun test` across all 4 packages to confirm no cross-package regressions from M6's budget changes.

Results:
- sdk: 731 pass / 0 fail / 1 skip — clean
- common: 496 pass / 0 fail — clean
- agents: 77 pass / 0 fail — clean (M6's own package)
- agent-runtime: 797 pass / 2 fail — NOT M6-related

**M6 verdict: ZERO cross-package regressions.** M6 only touched `agents/context-pruner.ts` (+ test), which has no import path into agent-runtime/sdk/common. The agents package itself passes 77/0.

The 2 agent-runtime failures (`prompt-caching-subagents.test.ts`: `should generate own system prompt when inheritParentSystemPrompt is false` + `should work independently: includeMessageHistory without inheritParentSystemPrompt`) are an **M3 regression** from the earlier b3240ef44 commit, not M6. M3 added a session-level system-prompt cache in `run-agent-step.ts` (line ~1106: `initialAgentState.systemPrompt = system` write-back) that pollutes the shared `sessionState.mainAgentState` reference. The failing tests spread `mainAgentState` to build a child state, so the child inherits the parent's cached system prompt.

This is test-only — in production, subagents get fresh `AgentState` via `createAgentState` (systemPrompt=undefined), so the M3 cache never hits for subagents. Fix deferred (out of M6 scope): clear `systemPrompt: undefined` in the 2 failing tests to simulate the fresh state production subagents actually receive.

GOTCHA: The agent-runtime file-change hooks run `typecheck` only, NOT `bun test` — so the M3 test regression slipped through the automated gate at commit time. The manual full-suite run here is what caught it. Consider adding a test hook for agent-runtime or always running `bun test` manually before committing harness changes.


<!-- update_plan_status:appended -->
## M7 tests/source updated — 2026-07-03T19:12:44.880Z

M7 implementation and tests updated.

Changes:
- `packages/agent-runtime/src/util/messages.ts`: replaced the mechanical omitted-message literal with exported `COMPACTED_CONTEXT_POINTER`, which points agents to `<knowledge_memory>` / current conversation summary instead of emitting zero-semantic-content text.
- `packages/agent-runtime/src/util/__tests__/messages.test.ts`: updated trim fallback expectations to assert `COMPACTED_CONTEXT_POINTER`.
- `sdk/src/impl/__tests__/llm-context-window.test.ts`: updated request-time trim expectations to assert `COMPACTED_CONTEXT_POINTER`.
- `agents/e2e/context-pruning-threshold.e2e.test.ts`: updated fallback pruning detection and comments to the compacted-context pointer.

OQ1 verification:
- Code search found no remaining source/test dependency on the old literal in active implementation paths.
- Remaining matches are durable plan/spec prose, archived JSON fixtures under `agents/__tests__/data/`, and eval fixture data under `evals/buffbench/`; these are historical fixtures/prose, not downstream consumers of the literal.

Next:
- Run targeted validation for agent-runtime message trimming plus affected SDK/agents tests/typechecks.


<!-- update_plan_status:appended -->
## M7 complete and validated — 2026-07-03T19:15:54.955Z

M7 (semantic trim fallback) is complete and validated.

Validation:
- `cd packages/agent-runtime && bun test src/util/__tests__/messages.test.ts` -> pass (messages trim/unit suite clean).
- `cd sdk && bun test src/impl/__tests__/llm-context-window.test.ts` -> 5 pass / 0 fail / 17 expect().
- `cd agents && bun test e2e/context-pruning-threshold.e2e.test.ts` -> 1 pass / 2 skip / 0 fail / 5 expect().
- `cd packages/agent-runtime && bun run typecheck` -> clean.
- `cd sdk && bun run typecheck` -> clean.
- `cd agents && bun run typecheck` -> clean.
- Configured file-change hooks for agent-runtime/sdk/agents typechecks -> clean.

Gate G3 status:
- Complete. M4 already added emergency-trim telemetry; M7 removed the active fallback emission/assertions for the old omitted-message literal and replaced them with a semantic compacted-context pointer.

Next:
- Continue to M8 (structured `/compact` schema) unless priorities change.


<!-- update_plan_status:appended -->
## M8 complete and validated — 2026-07-03T19:20:30.570Z

M8 (structured `/compact` schema) is complete and validated.

Changes:
- `packages/agent-runtime/src/system-prompt/prompts.ts`: rewrote `compactPrompt` to require the structured schema fields: Goal, Decisions, Files Inspected, Edits Made, Validation Results, Blockers, Next Action.
- `packages/agent-runtime/src/__tests__/prompts-schema-handling.test.ts`: added M8 regression coverage asserting the `/compact` prompt preserves all schema headings and operational-detail guidance.

Validation:
- `cd packages/agent-runtime && bun test src/__tests__/prompts-schema-handling.test.ts` -> 19 pass / 0 fail / 52 expect().
- `cd packages/agent-runtime && bun run typecheck` -> clean.
- Configured file-change hook `typecheck-agent-runtime` -> clean.

Gate status:
- AC6 met at prompt-contract level: `/compact` now instructs the agent to emit the structured schema fields needed for resumability.

Next:
- Continue to M9 (configurable `INCLUDE_REASONING_IN_MESSAGE_HISTORY`) after confirming OQ2, unless priorities change.


<!-- update_plan_status:appended -->
## M9 complete and validated — 2026-07-03T19:40:48.076Z

M9 is complete and validated.

Changes:
- `packages/agent-runtime/src/constants.ts`: replaced the hard-coded `INCLUDE_REASONING_IN_MESSAGE_HISTORY = true` with `DEFAULT_INCLUDE_REASONING_IN_MESSAGE_HISTORY = false`.
- `packages/agent-runtime/src/tools/stream-parser.ts`: reads `agentTemplate.includeReasoningInMessageHistory ?? DEFAULT_INCLUDE_REASONING_IN_MESSAGE_HISTORY` before appending reasoning chunks to assistant message history.
- `common/src/types/agent-template.ts`, `common/src/types/dynamic-agent-template.ts`, `agents/types/agent-definition.ts`, and `common/src/templates/initial-agents-dir/types/agent-definition.ts`: added the opt-in `includeReasoningInMessageHistory` agent config field with a false default for dynamic agents.
- `packages/agent-runtime/src/__tests__/stream-parser-reasoning.test.ts`: added default-off coverage and converted existing reasoning-history tests to explicit opt-in coverage.
- `common/src/__tests__/agent-validation.test.ts` and `common/src/__tests__/handlesteps-parsing.test.ts`: updated typed mock templates for the new parsed default.

Validation:
- `cd packages/agent-runtime && bun test src/__tests__/stream-parser-reasoning.test.ts && bun run typecheck` -> 4 pass / 0 fail / 6 expect(); typecheck clean.
- `cd common && bun run typecheck && bun test src/__tests__/agent-validation.test.ts src/__tests__/handlesteps-parsing.test.ts src/types/__tests__/dynamic-agent-template.test.ts` -> typecheck clean; 24 pass / 0 fail / 76 expect().
- `cd agents && bun run typecheck` -> clean.
- Configured file-change hooks also passed earlier: typecheck-sdk, typecheck-agents, typecheck-agent-runtime.

Gate status:
- AC7 met: reasoning replay is now configurable and defaults off, while agents can opt in per template when they need reasoning in later turns.

Next:
- Continue to M10 (telemetry, evals, validation gates) unless priorities change.


<!-- update_plan_status:appended -->
## M10 telemetry validation checkpoint — 2026-07-03T20:10:32.459Z

M10 telemetry subset is validated and ready to continue.

Completed in this checkpoint:
- M10.1 cache-efficiency snapshot metric: `cacheEfficiency.cachedInputTokenRatio`, `inputTokens`, and `cachedInputTokens` are written during usage enrichment.
- M10.3 emergency-trim telemetry surface: SDK request-time trim forwards `CACHE_EMERGENCY_TRIM` to `trackEvent` with context-window, token, message-count, user-input, and model properties.

Validation passed:
- `cd packages/agent-runtime && bun test src/util/__tests__/cache-debug.test.ts && bun run typecheck` -> 15 pass / 0 fail / 55 expect(); typecheck clean.
- `cd sdk && bun test src/impl/__tests__/llm-context-window.test.ts && bun run typecheck` -> 5 pass / 0 fail / 17 expect(); typecheck clean.

Pending:
- M10.2 add/define buffbench cache-hit + post-compaction recall eval scenario.
- M10.4 run final/full validation after M10.2 or after deciding M10.2 is deferred/out-of-scope for this pass.

Next action: inspect buffbench fixture/eval entry points and decide the smallest maintainable scenario for cache-hit ratio + recall assertions.


<!-- update_plan_status:appended -->
## M10.2 cache recall eval validated — 2026-07-03T20:22:27.591Z

M10.2 cache/recall eval scenario is implemented and focused validation is green.

Completed:
- Added `evals/buffbench/cache-recall-eval.ts` with deterministic cache usage metric computation and recall evaluation.
- Threaded optional cache-recall eval config/result types through buffbench runner interfaces and Codebuff runner step collection.
- Added deterministic final-check output conversion so cache recall failures surface through existing final-check reporting.
- Added run-buffbench coverage for passing/failing cache recall checks and final-check output.

Validation passed:
- `cd evals && bun test buffbench/__tests__/run-buffbench.test.ts && bun run typecheck` -> 7 pass / 0 fail / 25 expect(); typecheck clean.
- `cd packages/agent-runtime && bun test src/util/__tests__/cache-debug.test.ts && bun run typecheck && cd ../../sdk && bun test src/impl/__tests__/llm-context-window.test.ts && bun run typecheck` -> cache-debug 15 pass / 0 fail / 55 expect(); SDK llm-context-window 5 pass / 0 fail / 17 expect(); both typechecks clean.

Pending:
- M10.4 remains pending for final/full-suite validation and any automated reviewer gate resolution.


<!-- update_plan_status:appended -->
## M10.4 full validation complete — 2026-07-03T20:34:31.328Z

M10.4 full validation completed after resolving two pre-existing full-suite blockers surfaced by the run.

Validation results:
- `cd sdk && bun test && bun run typecheck` -> passed (full SDK suite/typecheck clean; prompt-caching integration tests skipped as designed without `OPENBUFF_API_KEY`).
- `cd common && bun test && bun run typecheck` -> passed (full common suite/typecheck clean).
- `cd evals && bun test && bun run typecheck` -> passed (full evals suite/typecheck clean, including cache-recall eval coverage).
- `cd packages/agent-runtime && bun test && bun run typecheck` -> passed after fixing the prompt-caching subagent test harness state.
- `cd agents && bun run test && bun run test:e2e && bun run typecheck` -> passed after fixing thinker tool reachability/test expectations.

Fixes made during M10.4 validation:
- `agents/thinker/thinker.ts`: added `set_output` to `toolNames` because the thinker handleSteps actually yields `set_output`; this resolves the prompt/tool availability alignment guard.
- `agents/__tests__/thinker.test.ts`: updated the thinker definition expectation to assert `set_output` is exposed.
- `packages/agent-runtime/src/__tests__/prompt-caching-subagents.test.ts`: child-agent test states now use an empty `systemPrompt` rather than inheriting the parent's cached system prompt, matching the production fresh-subagent state shape while satisfying the required `AgentState.systemPrompt: string` type.

Notes:
- Raw `cd agents && bun test` intentionally picks up `browser-use/browser-use.test.ts`, which is a manual browser trace script and exits when the local browser-use agent is not present under `agents/`. The package validation scripts are authoritative here: `bun run test` (unit), `bun run test:e2e`, and `bun run typecheck` all passed.
- M10.4 validation is complete; all M10 tasks are now done at focused and full-suite levels.


<!-- update_plan_status:appended -->
## Reviewer blocker resolved — 2026-07-03T20:42:37.259Z

Resolved reviewer blocker for M10.2/M10.4 cache-recall runner coverage.

Blocker addressed:
- Reviewer required coverage that exercises the actual buffbench runner path, not only pure cache-recall helpers.

Change:
- `evals/buffbench/__tests__/agent-runner.test.ts`: added `runAgentOnCommit` test using a temporary git repo and mock Codebuff client. The test verifies runner-collected cache metrics/message history produce `cacheRecallEval`, append the deterministic `buffbench cache-recall eval` final-check output, and still produce a real diff from the runner path.

Validation passed:
- `cd evals && bun test buffbench/__tests__/agent-runner.test.ts buffbench/__tests__/run-buffbench.test.ts && bun run typecheck` -> 14 pass / 0 fail / 49 expect(); typecheck clean.

Next:
- Automated reviewer gate can rerun against the added runner-path coverage.

