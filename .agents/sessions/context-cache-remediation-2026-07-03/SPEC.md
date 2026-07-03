# SPEC — Context Cache Fill-Up & Compaction Amnesia Remediation

Session: `.agents/sessions/context-cache-remediation-2026-07-03/`
Date opened: 2026-07-03
Status: planning → ready to implement

## Problem statement

Two user-visible symptoms, both rooted in the context-management path:

1. **Prompt cache fills up / churns quickly.** Provider prompt-cache hit rates are low and cache-write costs are high even for modest conversations. The cache appears to "fill up" rapidly and rarely serve hits.
2. **Post-compaction amnesia.** After compaction fires, the model loses almost everything that happened — file contents read, edits made, validation results, decisions — and behaves as if the conversation just started.

Root-cause analysis (read-only, no code changed) traced both symptoms to concrete code paths in `agents/context-pruner.ts`, `packages/agent-runtime/src/util/{context-pruning,messages}.ts`, `common/src/util/messages.ts`, `sdk/src/impl/llm.ts`, `packages/agent-runtime/src/{run-agent-step,system-prompt/prompts,constants}.ts`, and `agents/base2/base2.ts`.

## Goals

1. **Raise prompt-cache hit rate** by anchoring cache control on a stable prefix instead of the volatile tail, and by stopping cache-TTL-driven compaction from destroying otherwise-good cached prefixes.
2. **Preserve operational memory across compaction** by pinning structured *knowledge* state (goal, decisions, files inspected, edits made, validation results, blockers, next action) verbatim — not just workflow *control* state.
3. **Unify the three divergent pruning thresholds** so there is one normal semantic-compaction path, with request-time trim reserved as an emergency brake with telemetry.
4. **Make compaction lossy only where unavoidable**, and always convert dropped spans into structured memory before deletion instead of replacing them with "Previous message(s) omitted due to length".

## Non-goals

- Changing the provider/model abstraction layer or adding new providers.
- Rewriting the context-pruner agent from scratch; remediation is surgical.
- Changing the CLI UI or conversation persistence format beyond what the pinned-memory schema requires.
- Removing the mechanical trim fallback entirely (it remains as an emergency brake, with telemetry).
- Network/transport-level caching (HTTP, CDN) — out of scope.

## Root causes (evidence-backed)

### Cache churn (Part 1)

| # | Cause | Evidence |
|---|---|---|
| C1 | Cache-control anchors target the **volatile tail** (`LAST_ASSISTANT_MESSAGE`, `USER_PROMPT`, `STEP_PROMPT`, last message). Every step moves every breakpoint, so the previously-cached prefix no longer matches. | `common/src/util/messages.ts:340,348,354,379,396` |
| C2 | Compaction fires on the **5-min cache TTL** (`cacheWillMiss`), not just token pressure. A short, healthy conversation paused >5 min gets summarized and re-written as a fresh never-cached blob. | `agents/context-pruner.ts:404,407,421,432,1058,1082,1102` |
| C3 | **Three divergent pruning thresholds** (140k / 190k / model-window), each rewriting the message array and busting the cache. | `agents/context-pruner.ts:83`; `packages/agent-runtime/src/util/context-pruning.ts:11,48`; `sdk/src/impl/llm.ts:387,392` |
| C4 | `INCLUDE_REASONING_IN_MESSAGE_HISTORY = true` appends large per-turn-unique reasoning under the volatile `LAST_ASSISTANT_MESSAGE` anchor. | `packages/agent-runtime/src/constants.ts` |
| C5 | **Dynamic content in the cached system prefix** (`Current date`, git status, file tree) invalidates the prefix every turn. | `packages/agent-runtime/src/system-prompt/prompts.ts:112,166,192`; `agents/base2/base2.ts:121` |
| C6 | `numToolResultsToKeep = 1` keeps a single verbatim tool result at the tail under a cache anchor; the anchor's content changes every tool call. | `packages/agent-runtime/src/util/messages.ts` |

### Compaction amnesia (Part 2)

| # | Cause | Evidence |
|---|---|---|
| A1 | Context-pruner is **extractive, not semantic**: file bodies → path-only reminders, assistant text capped ~1.3k chars, tool entries ~5k, many subagent outputs blacklisted. | `agents/context-pruner.ts:117,129,140,145,174,932,948,999` |
| A2 | Summary budgets favor **user text (50k) over tool/assistant evidence (20k)**, while most operational memory lives in tool results. | `agents/context-pruner.ts:74,77,463,464` |
| A3 | Mechanical `trimMessagesToFitTokenLimit` replaces older spans with the literal string `"Previous message(s) omitted due to length"` — zero semantic content. | `packages/agent-runtime/src/util/messages.ts:170,171,262,319,340` |
| A4 | Only workflow **control** state is pinned verbatim today (`<pinned_active_work_state>`); **knowledge** memory (findings, edits, validation) is subject to lossy truncation. | `agents/context-pruner.ts:1039-1043`; `agents/base2/base2.ts:1645` (`buildPinnedActiveWorkMessage`) |
| A5 | `/compact` prompt is **unstructured freeform prose** ("summarize… capture key decisions…"), so it routinely omits concrete facts. | `packages/agent-runtime/src/system-prompt/prompts.ts:63-68`; consumed at `run-agent-step.ts:604-617` |

## Requirements

### Functional

- **R1** Compaction MUST NOT fire solely because the 5-min prompt-cache TTL has elapsed. Cache-refresh and compaction MUST be decoupled.
- **R2** Cache-control breakpoints MUST be placed at stable prefix boundaries (system prompt end, stable shared prefix end), not on `LAST_ASSISTANT_MESSAGE` / `USER_PROMPT` / `STEP_PROMPT` / the live tail.
- **R3** Dynamic per-turn content (current date, git status, file tree) MUST be moved out of the cached system prefix, or gated so it does not bust the cache prefix.
- **R4** There MUST be a single primary pruning threshold with a consistent reserved-token policy. SDK/request-time trim is an emergency brake that emits telemetry when it fires.
- **R5** A structured **knowledge memory** section (goal, decisions, files inspected, edits made, validation results, blockers, next action) MUST be pinned verbatim across compaction, alongside the existing control-state pin.
- **R6** Before mechanical trimming deletes spans, those spans MUST be converted into the structured knowledge-memory format (not replaced with "omitted due to length").
- **R7** Summary token budgets MUST be rebalanced so tool/assistant evidence gets at least as much protected space as user text, with a reserved "facts learned from tools" budget independent of conversational role.
- **R8** The `/compact` command MUST prescribe a structured summary schema (Goal / Decisions / Files Inspected / Edits Made / Validation Results / Blockers / Next Steps) rather than freeform prose.
- **R9** `INCLUDE_REASONING_IN_MESSAGE_HISTORY` MUST be configurable (per-agent or global), defaulting to off for cache-stability-sensitive agents.
- **R10** Cache-debug telemetry MUST record, per request: system-prompt hash, tools hash, shared-prefix length, and **per-cache-breakpoint message index + content hash** so churn is directly observable per anchor.

### Non-functional

- **N1** No regression in existing `agents/__tests__/context-pruner.test.ts` and `agents/e2e/context-pruner.e2e.test.ts` beyond intentional behavior changes (tests updated accordingly).
- **N2** No increase in p95 token cost for a steady-state conversation; target a measurable reduction in cache-write tokens.
- **N3** All changes behind existing test gates (`bun test` per package) and the harness validation hooks.

## Acceptance criteria

- **AC1** A conversation paused >5 min with token count below the unified threshold does NOT get summarized; cache markers are refreshed instead. Verified by a new unit test.
- **AC2** Cache-debug snapshot shows cache breakpoints anchored at stable prefix positions and stable content hashes across consecutive steps in a fixture conversation.
- **AC3** After compaction, a probe agent can answer "what files were inspected, what edits were made, what validation ran" from the pinned knowledge-memory section alone.
- **AC4** Only one pruning threshold value is referenced as the "normal" path; the SDK/request-time trim path emits a `cache_emergency_trim` telemetry event when it fires.
- **AC5** `trimMessagesToFitTokenLimit` no longer emits the literal string "Previous message(s) omitted due to length"; it emits structured knowledge-memory entries (or preserves a pointer to a snapshot).
- **AC6** `/compact` output conforms to the structured schema fields.
- **AC7** `INCLUDE_REASONING_IN_MESSAGE_HISTORY` can be toggled off and the conversation proceeds normally with improved cache stability.

## Relevant files / systems

- `agents/context-pruner.ts` — pruner agent definition, budgets, TTL gate, pinned-state handling, summary builder.
- `agents/base2/base2.ts` — `buildPinnedActiveWorkMessage`, dynamic system-prompt assembly (`PLACEHOLDER.CURRENT_DATE`).
- `packages/agent-runtime/src/util/context-pruning.ts` — runtime fallback `maybePruneContext` (190k).
- `packages/agent-runtime/src/util/messages.ts` — `trimMessagesToFitTokenLimit`, `numToolResultsToKeep`, simplify-tool-results.
- `packages/agent-runtime/src/util/cache-debug.ts` — `createCacheDebugSnapshot`, snapshot enrichment.
- `packages/agent-runtime/src/system-prompt/prompts.ts` — `compactPrompt`, `getProjectFileTreePrompt`, `getSystemInfoPrompt`, `getGitChangesPrompt`.
- `packages/agent-runtime/src/run-agent-step.ts` — `/compact` handling (lines 604–617).
- `packages/agent-runtime/src/constants.ts` — `INCLUDE_REASONING_IN_MESSAGE_HISTORY`.
- `common/src/util/messages.ts` — `convertCbToModelMessages`, cache-control placement.
- `sdk/src/impl/llm.ts` — `getMessagesForModelContext`, request-time trim, usage telemetry.
- Tests: `agents/__tests__/context-pruner.test.ts`, `agents/e2e/context-pruner.e2e.test.ts`, `packages/agent-runtime/src/util/__tests__/simplify-tool-results.test.ts`, `common/src/util/__tests__/messages.test.ts`.

## Open questions / assumptions

- **OQ1** Does any downstream consumer depend on the exact `"Previous message(s) omitted due to length"` string? Assumption: no (it is a display/log string). To verify before M7.
- **OQ2** Which agents are "cache-stability-sensitive" for R9? Assumption: the main orchestrator (`base2`/Buffy) and long-running subagents; editors spawn fresh and are less affected. To confirm with the user before M9.
- **OQ3** Is there an existing structured-memory schema we can extend, or do we mint a new `<knowledge_memory>` block parallel to `<pinned_active_work_state>`? Assumption: mint a new block to avoid disturbing the existing control-state contract. To confirm at M5 kickoff.
- **OQ4** Should cache-TTL refresh (R1) preserve the exact message array (zero mutation) or just avoid summarization while allowing cache-marker re-stamping? Assumption: allow cache-marker re-stamp only; do not mutate message content. To confirm at M1 kickoff.

## Risks

- **RISK1** Moving cache anchors off the tail could reduce cache hits for very short conversations where the tail *is* the stable prefix. Mitigation: keep one breakpoint at the tail for short histories, switch to prefix anchoring once history exceeds a threshold.
- **RISK2** Pinning knowledge memory verbatim could blow the context budget if the section grows unbounded. Mitigation: cap the pinned section with per-field budgets and rolling eviction of the oldest entries.
- **RISK3** Decoupling cache-TTL from compaction (R1) could cause a real token-pressure compaction to be delayed. Mitigation: keep the token-pressure trigger unchanged and primary; TTL becomes a no-op for compaction.
- **RISK4** Rebalancing budgets (R7) may starve user-goal recall. Mitigation: keep a protected user-goal slice inside the structured knowledge memory (R5), separate from the free-text user budget.

## Out-of-scope follow-ups (parking lot)

- End-to-end cancellation propagation across CLI/runtime/SDK/providers (separate audit finding).
- Path-containment helper consolidation (separate audit finding).
- MCP client cache header-insensitivity (separate audit finding).
