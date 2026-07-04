# LESSONS — Context Cache Fill-Up & Compaction Amnesia Remediation

Session: `.agents/sessions/context-cache-remediation-2026-07-03/`
Last updated: 2026-07-03 (planning phase)

## Key decisions (planning phase)

- **Highest-leverage single change = M1 (decouple cache-TTL from compaction).** The 5-min cache TTL was triggering summarization even at low token counts, then rewriting history with fresh `sentAt` — which both busts the cache and creates a fresh never-cached blob. Fixing this alone should materially reduce both user-reported symptoms.
- **Mint a new `<knowledge_memory>` block parallel to `<pinned_active_work_state>`** rather than overloading the existing control-state block. The control-state block has an existing verbatim-preservation contract that downstream code (and tests) already depend on; overloading it risks regressions. (To confirm at M5 kickoff — OQ3.)
- **Keep the mechanical trim fallback as an emergency brake**, not delete it. It becomes the defensive last resort with `cache_emergency_trim` telemetry, so we can see if/when the unified threshold ever fails to catch overflow.
- **Anchor cache control on a stable prefix, not the tail.** Anthropic prompt caching is prefix-based; anchoring on `LAST_ASSISTANT_MESSAGE` / `USER_PROMPT` / `STEP_PROMPT` / the final message guarantees every step busts the cache.

## Gotchas discovered during analysis

- **`sentAt` rewriting destroys cache.** `agents/context-pruner.ts:1058-1082` writes the summary and continuation messages with `sentAt: now`. Any preserved messages must NOT have their `sentAt` bumped, or the next `cacheWillMiss` check will misfire again.
- **Three thresholds, not one.** `140k` (pruner agent), `190k` (runtime fallback), and `contextWindow − reserved` (SDK request-time). Any one firing rewrites the message array and busts the cache. Must unify in M4.
- **Reasoning in history is a hidden cache-buster.** `INCLUDE_REASONING_IN_MESSAGE_HISTORY = true` puts large per-turn-unique content under the volatile `LAST_ASSISTANT_MESSAGE` anchor. Easy to miss because it is a single boolean in `constants.ts`.
- **Dynamic system-prompt content.** `Current date`, git status, and file tree are injected into the cached system prefix every turn (`prompts.ts:112,166,192`; `base2.ts:121`). Even a date-string change busts the whole system-prompt cache.
- **`numToolResultsToKeep = 1`** means the single verbatim tool result sits at the tail under a cache anchor, so the anchor's content changes every tool call. M2's prefix-anchoring fix addresses this indirectly.
- **Only control state is pinned verbatim today.** `<pinned_active_work_state>` preserves workflow control (reviewer blockers, validation summary, pinned lines) but NOT knowledge (files inspected, edits made, decisions). This is the core amnesia cause and is why M5 is P0.

## Follow-up notes

- **OQ1** (does anything depend on the "omitted due to length" string?) must be verified by a code-searcher before M7 merges; assumption is "no" since it is a display string.
- **OQ2** (which agents are cache-stability-sensitive?) should be answered with the user before M9; assumption is the main orchestrator and long-running subagents, not fresh-spawned editors.
- **RISK1:** moving anchors off the tail could reduce hits for very short conversations where the tail *is* the stable prefix. M2 should keep one tail breakpoint for short histories and switch to prefix-anchoring once history exceeds a threshold.
- **RISK2:** the pinned `<knowledge_memory>` block could grow unbounded. M5 must cap per-field budgets with rolling eviction.

## Reusable facts for future sessions

- Cache-debug snapshots live under `packages/agent-runtime/src/util/cache-debug.ts`; `scripts/compare-cache-debug.ts` can diff two snapshots and already has `stripCacheControlFromMessage` / `compareProviderRequests` helpers — reuse these for M2/M10 telemetry rather than minting new tooling.
- The pruner already supports `assistantToolBudget` / `userBudget` params (`context-pruner.ts:462-464`), so M6's configurability is mostly already wired.
- The `<pinned_active_work_state>` extraction uses `extractActiveWorkLines` and `addUniqueLine` helpers in `context-pruner.ts`; the M5 `<knowledge_memory>` extraction can mirror that pattern.
- `/compact` handling lives at `packages/agent-runtime/src/run-agent-step.ts:604-617` and simply replaces `agentState.messageHistory` with a single summary user-message; M8's structured schema change is localized to `compactPrompt` in `prompts.ts:63-68`.

<!-- update_plan_status:appended -->
## M1 — Cache-TTL no longer triggers compaction (2026-07-03) — 2026-07-03T11:05:28.805Z

- **Decision:** Removed `!cacheWillMiss` from the summarization gate in `agents/context-pruner.ts` (~line 434). Summarization now fires only on token pressure (`tokenCount > maxContextLength`), not on 5-min cache-TTL expiry.
- **Gotcha:** `cacheWillMiss` / `cacheExpiryMs` / `CACHE_EXPIRY_MS` are referenced only in `agents/context-pruner.ts` (the gate) and the auto-generated `cli/src/agents/bundled-agents.generated.ts` copy. No non-test caller passes `cacheExpiryMs`; all rely on the 5-min default. No existing test asserted TTL-driven summarization (the e2e threshold test spaces `sentAt` 30s apart to AVOID cache-miss), so no test updates were needed beyond the new regression test.
- **Reusable fact:** When cache-TTL expires but tokens are under threshold, the under-limit branch now keeps history verbatim — `sentAt` is preserved (no rewrite), and cache-control breakpoints are re-applied at request time by `convertCbToModelMessages`. This satisfies OQ4 (no content mutation) without needing a separate `refreshCacheMarkersOnly` pruner path.
- **Validation:** `bun test agents/__tests__/context-pruner.test.ts` → 75 tests, 315 expect() calls, 0 failures. New test: `does not summarize on cache-TTL expiry alone when under token threshold (M1 regression)`.
- **Follow-up:** M2's stable-anchor policy will make the request-time re-applied markers stable across steps, completing the cache-stability story.


<!-- update_plan_status:appended -->
## M2 — Stable cache-control anchors + per-anchor telemetry (2026-07-03) — 2026-07-03T11:35:01.349Z

- **Decision:** Replaced the 4 volatile-tail cache breakpoints in `common/src/util/messages.ts` (`convertCbToModelMessages`) with 3 stable-prefix anchors: (1) end of system prompt, (2) end of stable history (before the earliest live `USER_PROMPT`/`STEP_PROMPT` tag), (3) tail. The tail anchor pre-caches the current response so the next turn's stable-history anchor is a cache hit.
- **Gotcha (thinker correction 1):** Use the **earliest** live-prompt tag index (`Math.min` across `USER_PROMPT`/`STEP_PROMPT` via `findIndex`), not the latest (`findLastIndex`). Anchoring before the *latest* tag leaves an older current-turn message in the "stable" prefix, caching volatile content.
- **Gotcha (thinker correction 2):** Always apply the tail anchor (not just for short histories). Without it, the current response is never pre-cached, so the next turn's stable-history anchor is always a miss. The 4-breakpoint limit comfortably fits system + stable-history + tail = 3.
- **Gotcha (telemetry crash safety):** `getCacheAnchorSummary` must NOT run the full `convertCbToModelMessages` pipeline (which includes `convertToolMessages` and can throw on edge-case inputs like raw `Uint8Array` tool content). Extracted `aggregateMessages` so the telemetry helper can call it directly inside a `try/catch` — telemetry must never crash the request flow. Returns `[]` on any conversion error.
- **Gotcha (test counter shift):** Adding new `createCacheDebugSnapshot` calls in cache-debug tests shifts the global `cacheDebugCounter`, breaking existing filename-index assertions. Add new snapshot-producing tests at the END of the describe block, not in the middle.
- **Gotcha (test message format):** Cache-debug tests that hand-cast messages with `as unknown as Message` and a plain string for system content will throw inside `convertToolMessage` (system role expects array content of `{ text }` parts). Use the real `systemMessage`/`userMessage` helpers from `common/src/util/messages`.
- **Reusable fact:** Stable-anchor helpers (`aggregateMessages`, `findCacheAnchorIndices`, `messageContentHash`, `getCacheAnchorSummary`) are exported from `common/src/util/messages.ts` and can be reused by M10 telemetry and M7 semantic-trim work. `getCacheAnchorSummary` returns `{ indices: number[], reasons: string[], contentHashes: string[] }`.
- **Validation:** `bun test common/src/util/__tests__/messages.test.ts` → 43/0; `bun test packages/agent-runtime/src/util/__tests__/cache-debug.test.ts` → 15/0; `bunx tsc --noEmit` clean for `common` and `agent-runtime`.
- **Follow-up:** M10 can add a cached-vs-input token ratio metric using the `cacheAnchors` field already present in snapshots.


<!-- update_plan_status:appended -->
## M5 — Pin structured knowledge memory verbatim (2026-07-03) — 2026-07-03T11:35:13.989Z

- **Decision:** Minted a new `<knowledge_memory>` block parallel to `<pinned_active_work_state>` in `agents/context-pruner.ts`, with structured fields (Goal, Decisions, Files Inspected, Edits Made, Validation Results, Blockers, Next Action). Extraction runs before budget truncation; the block is exempt from the budget cutoff (mirrors the existing `hasSubstantivePinnedActiveWork` guard). Per-field budgets with rolling eviction of oldest entries (RISK2). OQ3 resolved: parallel block, not overloading the control-state block.
- **Gotcha (regex in template literal):** The `sectionMatch` helper in `extractKnowledgeMemoryFromText` originally used `new RegExp(`${header}:\\s*...`)` — but in a template literal, `\s` and `\S` become literal `s`/`S` (the backslash escapes the letter, not a regex class). Sections after Goal silently failed to parse on re-compaction, so only Goal survived the second compaction. Fix: use a single static regex that captures the header and body in one pass, with the header injected via a dynamically-built alternation string (no `\s`/`\S` in the template literal).
- **Gotcha (pinned Goal conflicts with budget-drop tests):** M5 pins the earliest user message as Goal verbatim, so old user-message text survives in `<knowledge_memory>` even when the entry is budget-dropped. Five pre-existing dual-budget/repeated-compaction tests asserted `not.toContain` for that text and failed. These tests verify entry budget-dropping, not the knowledge-memory pinning, so the fix was to strip the `<knowledge_memory>` block before the `not.toContain` assertions (using a `replaceKnowledgeMemoryBlock` helper in the test). This is the intended design tension: M5 intentionally pins structured facts across compaction.
- **Gotcha (extraction wiring):** Files Inspected are extracted from tool-call args of read-family tools (`read_files`, `read_outline`, `read_subtree`, `list_directory`, `glob`, `code_search`, `query_index`); Edits Made from edit-family tools (`str_replace`, `write_file`, `rewrite_symbol`, `edit_transaction`, `replace_range`); Validation Results from `run_terminal_command` tool messages (exit code + command). Decisions/Blockers are regex-extracted from assistant text (e.g., lines starting with "Decision:", "Decided", "Blocker:", "BLOCKING:").
- **Gotcha (block stripping):** The `<knowledge_memory>` block must be stripped from text in `parseSummaryIntoEntries` and `sanitizeOperationalStateText` before normal entry parsing, otherwise its contents get double-counted as regular summary entries.
- **Reusable fact:** The `<knowledge_memory>` extraction mirrors the existing `<pinned_active_work_state>` pattern (`extractPinnedActiveWorkState`, `extractActiveWorkLines`, `addUniqueLine`). Both blocks are emitted together after budget enforcement. The constants `KNOWLEDGE_MEMORY_OPEN_TAG`/`KNOWLEDGE_MEMORY_CLOSE_TAG` and tool-category sets (`READ_TOOL_NAMES`, `EDIT_TOOL_NAMES`) are exported from `context-pruner.ts`.
- **Reusable fact:** `/compact` handling in `packages/agent-runtime/src/run-agent-step.ts` preserves any existing `<knowledge_memory>` block across manual compaction by extracting it from the prior summary text and re-emitting it verbatim in the compacted user message.
- **Validation:** `bun test agents/__tests__/context-pruner.test.ts` → 76 tests / 330 expect() / 0 failures (includes new M5 regression test `pins structured knowledge memory verbatim across compaction`); `bunx tsc --noEmit` clean for `agents` and `agent-runtime`.
- **Follow-up:** M7 (semantic trim) can convert older spans into this structured format instead of emitting "omitted due to length". M8 (structured `/compact` schema) can prescribe these fields explicitly in `compactPrompt`.


<!-- update_plan_status:appended -->
## M3 system-prompt cache — 2026-07-03T12:14:15.708Z

- **Decision:** Kept per-session-stable context in the system prefix and cached the built system prompt on `AgentState.systemPrompt` rather than moving all dynamic blocks into a post-prefix message. This preserves existing prompt ordering while making the cache-critical system prefix byte-stable across same-agent turns.
- **Gotcha:** `mainPrompt` overwrites `mainAgentState.agentType` before calling `loopAgentSteps`, so agent-type-change invalidation must happen in `mainPrompt` before that assignment. The reuse guard in `loopAgentSteps` alone cannot detect a type change after the assignment.
- **Gotcha:** No `/refresh` command exists. `/clear` resets the whole session state, including `systemPrompt`, so no separate invalidation hook was needed.
- **Reusable fact:** `CURRENT_DATE` is generated with day granularity, so per-session system-prompt caching satisfies M3.4 without adding a moving per-turn timestamp.
- **Validation:** `cd packages/agent-runtime && bun test src/__tests__/main-prompt.test.ts` -> 6 pass / 0 fail; `cd packages/agent-runtime && bun run typecheck` -> clean.


<!-- update_plan_status:appended -->
## M4 complete — 2026-07-03 — 2026-07-03T15:34:21.475Z

M4 (Unify pruning thresholds; emergency-trim telemetry) is complete and validated.

Changes:
- `packages/agent-runtime/src/util/context-pruning.ts`: now the single importable source of truth. Owns `DEFAULT_MAX_CONTEXT_TOKENS = 190_000`, the `MODEL_CONTEXT_{MIN,MAX}_RESERVED_TOKENS` + `MODEL_CONTEXT_RESERVED_FRACTION` constants, and two helpers: `getModelContextReservedTokens` (returns `number | undefined` for unknown windows) and `getModelContextMessageLimit` (returns `DEFAULT_MAX_CONTEXT_TOKENS` for unknown windows, else `window - reserved`).
- `sdk/src/impl/llm.ts`: `getMessagesForModelContext` now imports `DEFAULT_MAX_CONTEXT_TOKENS` + `getModelContextMessageLimit` from the runtime package (replacing local duplicate constants). When `trimMessagesToFitTokenLimit` returns a different ref (i.e. it dropped messages), it emits a `CACHE_EMERGENCY_TRIM` telemetry event via `logger.warn` with payload: eventId, contextWindowTokens, maxTotalTokens, inputTokens, outputTokens, tokensDropped, inputMessageCount, outputMessageCount. This is the emergency brake — expected ~0 in steady state after M1/M4.
- `common/src/constants/analytics-events.ts`: added `CACHE_EMERGENCY_TRIM = 'sdk.cache_emergency_trim'` to the `AnalyticsEvent` enum under a new "SDK - Context management" section.
- `common/src/util/analytics-sampling.ts`: `CACHE_EMERGENCY_TRIM` added to `SAMPLED_EVENT_RATES` at the default 1% rate (high-volume-safe; non-zero frequency is a regression signal).
- `agents/context-pruner.ts`: cross-reference comment added to the `DEFAULT_MAX_CONTEXT_LENGTH = 140_000` constant explaining M4 unification and why this value is intentionally lower (semantic summarization vs mechanical trim).
- Tests: `packages/agent-runtime/src/util/__tests__/context-pruning.test.ts` gained 6 tests for the reserved-token helpers; `sdk/src/impl/__tests__/llm-context-window.test.ts` gained 2 tests (telemetry fires on trim, does NOT fire when no trim).

Gotcha — TS narrowing through `number | undefined` return type (cost one extra fix iteration):
- Initial `getModelContextMessageLimit` called `getModelContextReservedTokens` then checked `if (reserved === undefined)`. Even after guarding `contextWindowTokens === undefined` first, TS could not narrow `reserved` to `number` because the helper's return type is `number | undefined` and TS doesn't correlate the two.
- Fix: `getModelContextMessageLimit` now inlines the reserved-token computation (same MIN/MAX/FRACTION constants) after the undefined guard. `getModelContextReservedTokens` remains the public helper for external callers (SDK) that want the reserve alone — the constants are still the single source of truth.
- Generalizable rule: when a helper returns `T | undefined` purely to mirror an `undefined` input, callers that already guard the input should inline the non-undefined computation rather than fighting TS's inability to correlate the two `undefined` checks.

Serialization constraint (confirmed, shapes the design):
- `agents/context-pruner.ts` `handleSteps` is serialized to a string at build time (stored in `bundled-agents.generated.ts`), so it physically cannot `import` from `packages/agent-runtime`. A literal single-import source-of-truth across all three threshold sites is impossible.
- Pragmatic resolution: the runtime + SDK share one importable constant (`DEFAULT_MAX_CONTEXT_TOKENS`); the pruner agent mirrors the value inline (140k, intentionally lower for semantic summarization) with a comment cross-referencing the unified policy. Keep the inline value in sync when adjusting the unified threshold.

Validation:
- agent-runtime typecheck: clean
- sdk typecheck: clean
- common typecheck: clean
- agents typecheck: clean
- `context-pruning.test.ts`: 10 pass / 0 fail (22 expect)
- `llm-context-window.test.ts`: 5 pass / 0 fail (17 expect)
- `analytics-sampling.test.ts`: 5 pass / 0 fail (12 expect)
- `agents/__tests__/context-pruner.test.ts`: 76 pass / 0 fail (330 expect)

Gate G3 status: the "emergency-trim telemetry emits only under synthetic overflow" half of G3 is now met (M4). The "no omitted-due-to-length string" half is M7.

Next milestone: M6 — Rebalance summary budgets by content type.


<!-- update_plan_status:appended -->
## M4 reviewer follow-up — 2026-07-03 — 2026-07-03T15:43:59.716Z

Resolved all three non-blocking findings from the automated code-reviewer gate.

1. Duplicated reserved-token formula eliminated: `getModelContextMessageLimit` now calls `getModelContextReservedTokens(contextWindowTokens)!` (non-null assertion) instead of inlining the Math.min/Math.max/Math.floor computation. The assertion is safe because the function already early-returns on `undefined` input, and `getModelContextReservedTokens` only returns `undefined` when its input is `undefined` — TS just can't infer that correlation through the `number | undefined` return type. This restores a true single computation site (M4.2's original goal).
2. `getModelContextReservedTokens` is now used in production again (by `getModelContextMessageLimit`), so it is no longer dead code.
3. Removed the extra blank line in `analytics-events.ts` between `CACHE_EMERGENCY_TRIM` and the `// Common` section.

Validation after fixes: agent-runtime + common typechecks clean; context-pruning 10/0; llm-context-window 5/0.

Generalizable rule: a non-null assertion (`!`) is preferable to duplicating a formula when a helper's return type is `T | undefined` only to mirror an `undefined` input, and the caller has already guarded the input. The assertion documents the invariant more clearly than a comment explaining duplicated logic.


<!-- update_plan_status:appended -->
## M6 complete — 2026-07-03 — 2026-07-03T16:16:40.398Z

M6 (rebalance summary budgets by content type) is complete and validated.

Changes:
- `agents/context-pruner.ts`: rebalanced budget defaults — `ASSISTANT_TOOL_BUDGET` 20k→40k, `USER_BUDGET` 50k→30k (tool/assistant evidence now gets ≥ user-text budget, per SPEC R7). Added a reserved `TOOL_FACTS_BUDGET = 30k` slice independent of role. Tool-result entries now tagged with a `tool_facts` role (instead of lumped into `assistant_tool`) and charged to the reserved budget so operational memory survives compaction. Walk-backwards loop extended to three independent counters. Added `toolFactsBudget` pruner param.
- `agents/__tests__/context-pruner.test.ts`: extended all 6 `runHandleSteps` helper signatures + the `simulateCompaction` type to carry `toolFactsBudget`. Rewrote the outdated `counts tool result summaries against assistant+tool budget` test into `reserves tool-facts budget independent of assistant budget (SPEC R7)` and added `drops tool-facts entries when the reserved tool-facts budget is exceeded`.

Validation: agents typecheck clean; context-pruner 77 tests / 335 expect() / 0 failures.

Key gotcha — role-tagging and backward compat: extending the summarized-entry role union (`'user' | 'assistant_tool'` → add `'tool_facts'`) required updating `parseSummaryIntoEntries` so that old summaries already written to state (which tag tool results as `assistant_tool`) are re-classified into the `tool_facts` bucket on read. Without this, compaction cycles that re-read a previous summary would mis-charge legacy tool-result entries to the assistant budget, silently re-introducing the exact imbalance M6 fixes. The classification is prefix-based for forward/backward compatibility.

Generalizable rule: when adding a new budget bucket backed by a role tag, the entry *parser* (not just the entry *creator*) must classify legacy entries into the new bucket — otherwise old state re-introduces the bug on the next compaction cycle.


<!-- update_plan_status:appended -->
## M6 regression check — 2026-07-03 — 2026-07-03T16:45:50.844Z

Ran full test suites across all 4 packages to check for cross-package regressions from M6's budget changes.

Results:
- sdk: 731 pass / 0 fail / 1 skip — clean
- common: 496 pass / 0 fail — clean
- agents: 77 pass / 0 fail — clean (M6's own suite)
- agent-runtime: 797 pass / **2 fail** — but NOT M6-related

M6 verdict: ZERO cross-package regressions. M6 only touched `agents/context-pruner.ts` (+ test), which has no import path into agent-runtime/sdk/common. The agents suite (which contains the changed file) passes 77/0.

The 2 agent-runtime failures are in `prompt-caching-subagents.test.ts`:
- `should generate own system prompt when inheritParentSystemPrompt is false`
- `should work independently: includeMessageHistory without inheritParentSystemPrompt`

Root cause: **M3 regression** (commit b3240ef44), not M6. M3 added a session-level system-prompt cache in `run-agent-step.ts`:
```ts
} else if (initialAgentState.systemPrompt && initialAgentState.agentType === agentType) {
  system = initialAgentState.systemPrompt
}
```
Line 1106 writes back `initialAgentState.systemPrompt = system`, which pollutes the shared `sessionState.mainAgentState` reference. The failing tests spread `sessionState.mainAgentState` to create a child agent state (overriding `agentType`), so the child inherits the parent's cached `systemPrompt`. The `agentType === agentType` guard passes because the test sets the child's `agentType` to match the param, causing the child to reuse the parent's system prompt instead of generating its own.

This is a TEST-ONLY issue — in production, subagents get fresh `AgentState` via `createAgentState` (systemPrompt=undefined), so the M3 cache never hits for subagents. The test's assumption that spreading `mainAgentState` yields a clean slate is violated by M3's write-back.

Fix (deferred): clear `systemPrompt: undefined` when creating child state in the 2 failing tests, simulating the fresh-state that production subagents actually receive.

GOTCHA — validation-hook gap: The M1–M5 commit (b3240ef44) passed the automated gate because the agent-runtime file-change hooks run `typecheck` only, NOT `bun test`. Test regressions can slip through the gate when only typechecks are configured. The full `bun test` run (done manually here) is what caught this. Consider adding a test hook for agent-runtime, or always run `bun test` manually before committing harness changes.


<!-- update_plan_status:appended -->
## M7 semantic trim fallback — 2026-07-03T19:13:01.916Z

- **Decision:** M7 keeps the emergency mechanical trim path, but the inserted replacement message now uses exported `COMPACTED_CONTEXT_POINTER` instead of the old `"Previous message(s) omitted due to length"` literal. This preserves a bounded placeholder while making the fallback semantically point to `<knowledge_memory>` / the current conversation summary.
- **OQ1 result:** Active source/tests no longer depend on the old literal. Remaining matches are plan/spec prose plus historical JSON/eval fixtures, so no downstream consumer appears to require the exact string.
- **Gotcha:** When using `edit_transaction` on large files, range-scoped `occurrenceIndex` counts only matches inside the `basedOnRead` anchor, not the whole file. Prefer `allowMultiple` when the intended replacements are identical and fully contained in the freshly read range.
- **Reusable fact:** `COMPACTED_CONTEXT_POINTER` is exported from `packages/agent-runtime/src/util/messages.ts` and reused by agent-runtime/sdk tests, avoiding duplicated string literals in active assertions.


<!-- update_plan_status:appended -->
## M8 structured compact schema — 2026-07-03T19:20:44.722Z

- **Decision:** M8 keeps `/compact` implementation logic unchanged and fixes the contract at the prompt boundary. The existing runtime path already stores the model's response in message history and preserves any prior `<knowledge_memory>` block; the missing piece was the schema instruction.
- **Gotcha:** No existing tests imported `additionalSystemPrompts`, so the M8 regression was added to `prompts-schema-handling.test.ts` rather than a new test file. This keeps prompt-contract coverage near other prompt/schema resilience tests.
- **Reusable fact:** The `/compact` schema fields are now asserted directly from `additionalSystemPrompts['/compact']`: Goal, Decisions, Files Inspected, Edits Made, Validation Results, Blockers, Next Action.


<!-- update_plan_status:appended -->
## M9 lessons — 2026-07-03T19:41:02.408Z

- `includeReasoningInMessageHistory` must be present in both public agent-definition copies: `agents/types/agent-definition.ts` and `common/src/templates/initial-agents-dir/types/agent-definition.ts`. The common type-compatibility test checks key parity and will fail if only one copy is updated.
- `DynamicAgentDefinitionSchema.default(false)` makes `includeReasoningInMessageHistory` required on the parsed `DynamicAgentTemplate` type, so typed test fixtures using `DynamicAgentTemplate` need the defaulted property explicitly.
- Reasoning-history behavior is now opt-in per agent template; default-off protects prompt-cache stability while retaining prior consolidation semantics when enabled.


<!-- update_plan_status:appended -->
## M10 telemetry lessons — 2026-07-03T20:10:45.638Z

- M10.1 cache-efficiency telemetry is implemented at usage-enrichment time rather than snapshot-creation time because provider usage is only known after the request completes. This keeps the initial snapshot cheap and makes the metric available once `enrichCacheDebugSnapshotWithUsage` runs.
- M10.3 emergency-trim telemetry now uses both logger warnings and `trackEvent`. The logger carries the same event id for local diagnosis, while `trackEvent` makes non-zero emergency trims visible in analytics.
- Targeted validation for telemetry should cover both packages touched by the contract: agent-runtime cache-debug snapshot tests/typecheck and SDK context-window tests/typecheck.


<!-- update_plan_status:appended -->
## M10 cache recall eval lessons — 2026-07-03T20:22:40.563Z

- M10.2 is implemented as a deterministic buffbench extension rather than a costly live long-conversation fixture by default. The eval plumbing can now assert cached-input ratio and required recall substrings from captured runner steps/message history, while existing final-check reporting surfaces failures in the same path as command checks.
- Validation should cover both sides of M10: evals (`buffbench/__tests__/run-buffbench.test.ts` + typecheck) and telemetry packages (agent-runtime cache-debug test/typecheck + SDK llm context-window test/typecheck).
- Cache ratio can be unavailable when providers/runners do not emit usage; the evaluator treats that as a failure when `minCacheHitRatio` is configured, so eval configs should set thresholds only for runners that collect usage data.


<!-- update_plan_status:appended -->
## M10.4 validation lessons — 2026-07-03T20:34:59.953Z

- Full package validation should use package scripts where present. In `agents`, raw `bun test` picks up `browser-use/browser-use.test.ts`, which is a manual trace runner, not part of the package script suite. Use `bun run test && bun run test:e2e && bun run typecheck` for authoritative agents validation.
- Structured-output agents whose `handleSteps` yields `set_output` must list `set_output` in `toolNames`; otherwise prompt/tool reachability tests correctly catch drift.
- Prompt-caching subagent tests that spread `sessionState.mainAgentState` after a parent run must clear the cached system prompt with `systemPrompt: ''` to model fresh production subagent state while satisfying the required string type.


<!-- update_plan_status:appended -->
## Cache recall runner coverage — 2026-07-03T20:42:51.959Z

Reviewer gate may require integration-style coverage through the orchestration path, not just pure helper tests. For buffbench runner behavior, `runAgentOnCommit` can be tested cheaply with a temp local git repo and a mock Openbuff client; this exercises `CodebuffRunner`, cache metric extraction from `sessionState.mainAgentState`, deterministic cache-recall final-check output, and diff generation without hitting external services.


<!-- update_plan_status:appended -->
## Subagent parallelism policy lesson — 2026-07-03T23:04:14.522Z

Policy updates should describe agent spawning as deterministic phase-triggered delegation rather than discretionary randomness. The durable pattern is: discover context first, use thinker for complex post-discovery reasoning, use editor for non-trivial implementation with a self-contained brief, run independent validation in parallel when safe, and join validation/review/security results before finalizing. Parallel reviewers are static-only unless validation output is already complete and included in the prompt.


<!-- update_plan_status:appended -->
## Multi-orchestrator policy consistency — 2026-07-03T23:09:11.243Z

When docs claim a policy applies to multiple orchestrator definitions, verify every named definition receives the prompt/policy update. For base policy work, check both `agents/base2/base2.ts` and `agents/base2/base-deep.ts` before finalizing docs that mention both.


<!-- update_plan_status:appended -->
## Explicit Candidate Coverage — 2026-07-04T00:15:43.681Z

When user asks to cover a numbered or enumerated policy-candidate list, mirror every item explicitly in both prompt policy and docs. Avoid relying on umbrella wording for high-impact candidates such as validation selection, release/deployment flow, ask-user decisions, and tool routing; reviewers and users will treat omissions as incomplete even if adjacent policies imply them.


<!-- update_plan_status:appended -->
## Buffbench live-run environment preconditions — 2026-07-04T18:01:37.626Z

GOTCHA — buffbench live runs against `eval-codebuff.json` have been blocked since at least 2026-07-04T13-41 by FOUR environment preconditions, none of which are code defects in the M10.2 cache-recall eval (which passes 14/49 unit tests):

1. **Source repo uncloneable.** `eval-codebuff.json.repoUrl` = `https://github.com/CodebuffAI/codebuff`. `git clone --depth 1` of this repo fails for every task. A prior partial run (logs/2026-07-04T13-41_base2, 111 trace files) shows 58/62 tasks failed with `Command failed: git clone --depth 1 https://github.com/Codeb...`. ACTION: restore/clone the source repo or repoint `repoUrl` at an accessible mirror (e.g., the local openbuff worktree via `file://` if applicable).
2. **`initCommand` (`bun install && git checkout -- bun.lock`) fails in isolated repos.** Partially a consequence of (1), but `bun install` in the scratch clone env also needs the right bun version pinned. The eval pins `bun-v1.2.23` in `binInstalls` while the host runs 1.3.14. ACTION: verify the isolated bun install actually succeeds once the source repo clones.
3. **`GEMINI_API_KEY` missing.** `judge-gemini` (model `gemini/gemini-2.5-pro`) cannot run; no key in `.env`. ACTION: add `GEMINI_API_KEY` to `.env` or repoint `judge-gemini` at a configured provider via `openbuff.d/routes.json`.
4. **Pioneer API `out_of_credits` (HTTP 402).** `judge-gpt` (gpt-5.5) and `judge-claude` (claude-sonnet-5-6) route through `pioneer.ai`, which returns `{"code":"out_of_credits"}`. All judges fail → all scores 0. ACTION: add pioneer.ai credits or repoint judges at an in-credit provider.

REUSABLE: When wiring the cache-recall eval, the config is evaluated per-task against the live `finalMessageHistoryText` from the agent runner. `minCacheHitRatio` alone (no `requiredRecallSubstrings`) gives a live cache-efficiency measurement across tasks; `requiredRecallSubstrings` is per-spec and harder to share across commits. The wired config (`{ "minCacheHitRatio": 0.5 }`) is a reasonable eval-file-level default and is saved in `evals/buffbench/eval-codebuff.json`.

FOLLOWUP: Gate G4 cannot be closed in the current environment. The M10.2 code is sound. Re-open Gate G4 once (1)–(4) are resolved; rerun `bun run evals/buffbench/main-gate-g4-live.ts`.


<!-- update_plan_status:appended -->
## Regenerating a buffbench eval from a local file:// worktree — three pre-existing gotchas — 2026-07-04T20:44:56.902Z

GOTCHA — regenerating a buffbench eval from the openbuff repo's own history via `gen-repo-eval.ts file://<worktree>` exposed **three** pre-existing defects that blocked the run end-to-end. All three fixes are in-scope for any future local-eval regeneration, and they're independent of the M10.2 cache-recall eval code:

1. **`pick-commits.ts` `execFileSync` default 1MB `maxBuffer`** — `git show --stat <sha>` crashes with `ENOBUFS` on commits that touch the dependency cache (`.bun-install/cache/` has thousands of files). Fix: bump `maxBuffer` to 50MB in the `getCommits` / `screenCommitsWithGpt5` git-show call. This is a one-liner and unblocks any repo with large diff commits.

2. **`CommitSelectionSchema` strict field-name validation** — `promptAiSdkStructured` uses `generateObject` with a Zod schema, but the routed model (`iamhc/glm-5.2` via the default route, since `models.openrouter_gpt5` `openai/gpt-5.5` has no `routes.json` override and falls through) does NOT follow the schema's exact camelCase keys. It returns valid commit selections under `selected_commits`, `commits`, `selected`, or `{is_hard: true}`-flavored single-commit objects. Every response fails Zod validation → `selectedCommits=[]` → empty eval. Fix: make the schema lenient with `.optional()` on every field and a `z.unknown()` passthrough for the polymorphic `selected` field, then normalize variants in a `transform`. **Do NOT use `z.union(..., z.undefined())`** — it crashes Zod-to-JSON-Schema conversion inside `generateObject`, producing per-commit `AI_TypeValidationError` instead of fallback. `.optional()` + `z.unknown()` is the JSON-Schema-compatible equivalent.

3. **`test-repo-utils.ts` `git clone --depth 1` of a `file://` worktree** — `git clone --depth 1 file:///path/to/worktree` fails with exit 128 because git refuses to shallow-copy a non-bare local repo that has a checked-out working tree. Fix: when `repoUrl.startsWith('file://')`, use `git clone --no-local --depth 1` so git treats the source as a remote transport (allows `--depth 1` against a non-bare worktree). Same fix applies to `setup-test-repo.ts`'s general `file://` capability added in this same session.

REUSABLE — the `file://` eval pattern: to regenerate an eval from the repo you're already in, run `bun run gen-repo-eval.ts file://$(pwd)` (no network needed, no auth stall, deterministic). The regenerated `eval-openbuff-v2.json` is 333KB / 8 commits and runnable via `bun run main-openbuff.ts`. This complements `eval-codebuff.json` (inherited upstream history) for cross-fork regression.

FOLLOWUP — Gate G4 blockers (2)–(4) remain environment/credential issues, NOT code defects: (2) `bun install` in the isolated test-repo env, (3) `GEMINI_API_KEY` missing, (4) Pioneer API `out_of_credits` (HTTP 402). Blocker (1) ("Source repo uncloneable") is now **RESOLVED** by the repoUrl repoint + `file://` capability. Gate G4 itself remains suspended until (2)–(4) clear; the regenerated `eval-openbuff-v2.json` is an additional regression surface for when they do. The M10.2 cache-recall eval remains unit-test-validated (14/49).


<!-- update_plan_status:appended -->
## Followup phase lessons — file:// handling, CommitSelectionSchema, live-run model-capability signal 2026-07-04T22:00Z — 2026-07-04T21:43:58.268Z

Gotchas confirmed during the followup phase (live run + tests, 2026-07-04T22:00Z):

1. **`extractRepoNameFromUrl` trailing-slash bug** — `file:///path/openbuff/` returned `''` (empty last segment) because no slice stripped the trailing `/`. Test coverage surfaced it. Fix: `path.replace(/\/+$/, '')` before splitting. When adding URL parsing tests, always include the `\{path}/` and `\{path}//` variants.

2. **`CommitSelectionSchema` JSON-Schema-incompatible Zod patterns** — `z.union([... z.undefined()])` crashes Zod-to-JSON-Schema conversion silently (the error materializes only at runtime when `promptAiSdkStructured` calls `generateObject`). Use `.optional()` + `z.unknown()` for polymorphic fields instead. The routed `iamhc/glm-5.2` model frequently emits field-name variants like `selected_commits`, `commits`, `selected`, `is_hard` instead of the canonical `selectedCommits`; the schema must normalize these with a `.transform()`.

3. **`git clone --depth 1 file://...` fails against a non-bare worktree** — must use `git clone --no-local --depth 1`. Same fix needs to land in BOTH `setup-test-repo.ts` (parentSha fetch path) AND `evals/subagents/test-repo-utils.ts` (clone path). A `--no-local` fetch against a non-bare worktree also requires `--no-local` on `git fetch --depth 1 origin <sha>`.

4. **`pick-commits.ts` `execFileSync` `maxBuffer`** — default 1MB overflows with `ENOBUFS` on commits touching `.bun-install/cache/` (thousands of dependency cache files). Bump to 50MB. Symptom: silent crash mid-screening.

5. **Live `main-openbuff.ts` runs against the routed `iamhc/glm-5.2` expose model-tool-call defects, not harness defects** — the model emits stringified JSON as `paths[1]` (e.g. `"[\"web/src/llm-api/deepseek.ts\"]"`), `replacements[27]` as strings instead of objects, and empty-string `paths`. Each triggers per-task validation gates that block → repair rounds → pendingFile clusters. The buffbench runner catches each, finishes with 8/8 trace files saved even when 5/8 tasks score 0.0. To get a meaningful baseline, route the eval at a model that emits well-formed tool calls. The harness is sound; the score distribution is a model-capability signal.

6. **`OPENBUFF_REPO_PATH` portability pattern** — for `file://`-routed eval JSONs with developer-machine absolute paths, the runner should load the eval JSON, override `repoUrl` when the env var is set, write the patched data to a temp file, and pass the temp path to `runBuffBench`. Do NOT mutate the canonical eval JSON in place — keep the canonical file portable-by-convention, machine-specific-by-env.

REUSABLE: The non-blocking reviewer followup flow (`unit tests for new file:// handling + env-override portability + live end-to-end run`) consumed roughly 90 minutes and ~$0 (in-credit routing). Reuse this pattern whenever a harness change is non-trivial and the gated feature has a live-run path: tests first (catches latent bugs like trailing-slash), portability second (catches `file://` machine-specific paths), live validation last (catches integration diarrheas the tests can't see).


<!-- update_plan_status:appended -->
## Gate G4 wiring gotchas — per-eval cacheRecallEval + scoringStatus widening — 2026-07-04T22:30Z — 2026-07-04T22:03:47.976Z

Gotcha confirmed while wiring Gate G4's cache-recall eval into the regenerated `eval-openbuff-v2.json`:

1. **`cacheRecallEval` must be wired into EACH eval JSON, not inherited globally.** The buffbench runner reads `evalData.cacheRecallEval` generically (run-buffbench.ts:554), but the config lives per-eval-file. `eval-codebuff.json` had it wired (`{ minCacheHitRatio: 0.5 }`), but the regenerated `eval-openbuff-v2.json` did NOT — so the live run that completed 8/8 tasks against `eval-openbuff-v2.json` was NOT actually measuring cache hit ratio at all. Gate G4 cannot be evaluated by task completion alone; the `cacheRecallEval` config must be present in the eval JSON that the runner loads. ACTION when adding a new eval JSON that should measure cache recall: add `"cacheRecallEval": { "minCacheHitRatio": 0.5 }` at the top level alongside `repoUrl`/`generationDate`.

2. **`scoringStatus: judgeResult.scoringStatus ?? 'scored'` widens to `string` in an object literal.** TypeScript widens the literal fallback `'scored'` to `string` when the object is inferred (not annotated), even though `judgeResult.scoringStatus` is `ScoringStatus | undefined` and `'scored'` is a valid union member. The object then fails to assign to `EvalRun` (which expects the narrow `ScoringStatus` union). Fix: annotate the object literal `: EvalRun` so contextual typing keeps the fallback narrow. This was a pre-existing typecheck error at run-buffbench.ts:568 that surfaced when the validation gate ran; it had TWO construction sites (success branch line 186 + catch branch line 252) that both needed the annotation. REUSABLE: when a `??` fallback widens a union literal in an object literal, annotate the object with the target type rather than casting the fallback — contextual typing is cleaner and catches other field drift at the assignment site.

3. **Pre-existing typecheck errors can block the validation gate for an unrelated config edit.** My `cacheRecallEval` edit was a JSON-data-only change that cannot affect TypeScript compilation, but the gate runs the full `bun run typecheck` which was already failing from the `scoringStatus` widening. The fix-it-where-you-find-it principle applies: even though the error was pre-existing and out of strict scope, leaving the gate red blocks the whole plan. Annotating both sites was the minimal, idiomatic fix.

