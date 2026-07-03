# PLAN — Context Cache Fill-Up & Compaction Amnesia Remediation

Session: `.agents/sessions/context-cache-remediation-2026-07-03/`
Companion: `SPEC.md` (goals/non-goals/requirements/ACs), `STATUS.md` (current state), `LESSONS.md` (decisions & gotchas).

## Milestone overview

| Milestone | Title | Fixes | Priority | Status |
|---|---|---|---|---|
| M1 | Decouple cache-TTL refresh from compaction | C2 | P0 | done |
| M2 | Stable cache-control anchors + per-anchor telemetry | C1, C6, R10 | P0 | done |
| M3 | Move dynamic content out of cached system prefix | C5 | P1 | done |
| M4 | Unify pruning thresholds; emergency-trim telemetry | C3, R4 | P1 | done |
| M5 | Pin structured knowledge memory verbatim | A4, R5 | P0 | done |
| M6 | Rebalance summary budgets by content type | A2, R7 | P1 | done |
| M7 | Semantic trim fallback (no "omitted" placeholder) | A3, R6 | P1 | todo |
| M8 | Structured `/compact` schema | A5, R8 | P2 | todo |
| M9 | Configurable `INCLUDE_REASONING_IN_MESSAGE_HISTORY` | C4, R9 | P2 | todo |
| M10 | Telemetry, evals, validation gates | R10, N1–N3 | P1 | todo |

Milestones are ordered by leverage. **M1 is the highest-leverage single change** and addresses both symptoms at once (it fixes C2 directly, and indirectly reduces amnesia by making compaction rarer so the lossy summarization path fires less often). M1 + M2 + M5 are the P0 core; the rest are P1/P2 polish.

> **Dependency note on M1 ↔ M4:** M1's gate references the pruning threshold, and M4 unifies that threshold. To avoid a blocking cycle, M1 may use the current `maxContextLength` default (`context-pruner.ts:83`) as a stand-in until M4 lands; M4 then swaps in the unified constant without changing M1's gate logic. M4 does not depend on M1 behaviorally — only M1 references M4's constant.

<!-- current-task: M7 — Semantic trim fallback (no "omitted" placeholder) -->

## M1 — Decouple cache-TTL refresh from compaction (P0)

**Fixes:** C2 (cache-TTL triggers compaction). Indirectly reduces amnesia by making the lossy summarization path fire less often.

**Root cause:** `agents/context-pruner.ts:404-434` computes `cacheWillMiss = gap > CACHE_EXPIRY_MS` and enters summarization mode even when `tokenCount <= maxContextLength`. The summary is then written with fresh `sentAt` (`context-pruner.ts:1058-1082`), destroying a perfectly good cached prefix and forcing a full cache rewrite.

**Tasks:**
- [ ] M1.1 Confirm OQ4 with user: cache-TTL refresh should re-stamp cache markers only, never mutate message content. (owner: planner)
- [ ] M1.2 In `agents/context-pruner.ts`, change the gate so `cacheWillMiss` alone does NOT enter SUMMARIZATION MODE. Only `tokenCount > maxContextLength` (the unified threshold from M4) triggers summarization. (owner: editor)
- [ ] M1.3 Introduce a `refreshCacheMarkersOnly` path: when `cacheWillMiss && tokenCount <= threshold`, emit a `set_messages` that preserves the existing message array verbatim and only re-stamps cache-control breakpoints via the M2 anchor policy. (owner: editor)
- [ ] M1.4 Ensure `sentAt` is NOT rewritten for preserved messages (only for any newly emitted marker-bearing messages). (owner: editor)
- [ ] M1.5 Add unit test: conversation below threshold, idle >5 min → no summary emitted, message array unchanged except cache markers. (owner: test-writer)
- [ ] M1.6 Update existing tests in `agents/__tests__/context-pruner.test.ts` that assert TTL-driven summarization to assert the new behavior. (owner: test-writer)

**Dependencies:** Uses the pruning threshold (currently the `maxContextLength` default; swapped to M4's unified constant once M4 lands). No hard blocker.
**Validation gate:** `bun test agents/__tests__/context-pruner.test.ts` + `bun test agents/e2e/context-pruner.e2e.test.ts` pass; new TTL test passes.
**Risk:** RISK3 — confirm token-pressure trigger still fires.

## M2 — Stable cache-control anchors + per-anchor telemetry (P0)

**Fixes:** C1 (volatile-tail anchors), C6 (single verbatim tool result at tail), R10 (telemetry).

**Root cause:** `common/src/util/messages.ts:340-412` (`convertCbToModelMessages`) places up to 4 cache breakpoints at `LAST_ASSISTANT_MESSAGE`, `USER_PROMPT`, `STEP_PROMPT`, and the final message. Anthropic prompt caching is prefix-based, so every step moves every breakpoint and busts the cache.

**Tasks:**
- [ ] M2.1 In `common/src/util/messages.ts`, redefine cache-anchor placement: anchor at (a) end of system prompt, (b) end of stable shared prefix (messages older than a rolling window that have not changed), and optionally (c) tail only for short histories. (owner: editor)
- [ ] M2.2 Stop placing breakpoints on `USER_PROMPT`, `STEP_PROMPT`, `LAST_ASSISTANT_MESSAGE`, and the final message for histories above a small threshold. (owner: editor)
- [ ] M2.3 In `packages/agent-runtime/src/util/cache-debug.ts`, enrich `createCacheDebugSnapshot` to record per-breakpoint: message index, content hash, anchor reason. Emit this in the snapshot JSON. (owner: editor)
- [ ] M2.4 Add a `scripts/compare-cache-debug.ts` (or extend existing) view that surfaces per-anchor churn across two snapshots. (owner: editor)
- [ ] M2.5 Add unit tests asserting stable anchor hashes across consecutive steps in a fixture. (owner: test-writer)
- [ ] M2.6 Update `common/src/util/__tests__/messages.test.ts` expectations. (owner: test-writer)

**Dependencies:** none (can proceed in parallel with M1).
**Validation gate:** `bun test common/src/util/__tests__/messages.test.ts` + `packages/agent-runtime/src/util/__tests__/cache-debug.test.ts` pass; fixture snapshot shows stable per-anchor hashes across steps.

## M3 — Move dynamic content out of cached system prefix (P1)

**Fixes:** C5 (Current date / git status / file tree in cached prefix).

**Root cause:** `packages/agent-runtime/src/system-prompt/prompts.ts:112,166,192` and `agents/base2/base2.ts:121` inject per-turn / per-session dynamic content into the system prompt, which is the most cache-critical prefix.

**Tasks:**
- [x] M3.1 Audit `getSystemInfoPrompt`, `getGitChangesPrompt`, `getProjectFileTreePrompt`, and `Current date: ${PLACEHOLDER.CURRENT_DATE}` to identify which fields are truly per-turn vs per-session. (owner: planner / researcher) (audited; prompt rebuild was per-turn, placeholders session-stable/day-granularity)
- [x] M3.2 Move per-turn dynamic content to a **post-prefix** message (e.g., a dedicated user-tagged context message after the stable system block) so the system prefix stays byte-stable. (owner: editor) (implemented as per-session system-prompt cache instead of moving stable context out of prefix)
- [x] M3.3 Keep per-session-stable content (file tree, system info) inside the cached system prefix; refresh only on session start or explicit `/refresh`. (owner: editor) (reuse cached systemPrompt on same agent type; clear on agent-type change)
- [x] M3.4 For `Current date`, either move it post-prefix or round to day-granularity so it changes at most once per day. (owner: editor) (CURRENT_DATE already day-granularity; cache per session)
- [x] M3.5 Add tests confirming the system-prompt prefix hash is stable across consecutive steps in the same session. (owner: test-writer) (main-prompt regression hashes stable prefix across consecutive same-agent turns)

**Dependencies:** M2 (anchor policy) so the post-prefix boundary is well-defined.
**Validation gate:** system-prompt hash stable across steps in a fixture session; `bun test packages/agent-runtime/src/system-prompt/*` passes.

## M4 — Unify pruning thresholds; emergency-trim telemetry (P1)

**Fixes:** C3 (140k / 190k / model-window divergence), R4 (single threshold + emergency telemetry).

**Root cause:** `agents/context-pruner.ts:83` (140k), `packages/agent-runtime/src/util/context-pruning.ts:11,48` (190k), `sdk/src/impl/llm.ts:387,392` (model-window − reserved). Three paths, three behaviors.

**Tasks:**
- [x] M4.1 Pick a single source-of-truth threshold constant (e.g., `DEFAULT_MAX_CONTEXT_TOKENS`) and import it in all three sites. (owner: editor) (DEFAULT_MAX_CONTEXT_TOKENS=190_000 in context-pruning.ts; SDK imports it; pruner agent has cross-ref comment (can't import — serialized))
- [x] M4.2 Define a reserved-token policy (output reserve + tool-result headroom) in one place; compute the effective threshold from the active model's context window. (owner: editor) (getModelContextReservedTokens + MODEL_CONTEXT_* constants centralized in context-pruning.ts)
- [x] M4.3 Make the SDK request-time trim (`getMessagesForModelContext`) an **emergency brake** that only fires when the unified threshold was somehow exceeded (defensive), and emit a `cache_emergency_trim` telemetry event with the overshoot amount. (owner: editor) (getMessagesForModelContext emits CACHE_EMERGENCY_TRIM when trimmed !== input; sampling at 1% in analytics-sampling.ts)
- [x] M4.4 Update tests that hard-coded 140k/190k to use the unified value. (owner: test-writer) (added helper tests + telemetry-fire/no-fire tests)

**Dependencies:** none hard. M1 references this threshold but uses a temporary default until M4 lands (see dependency note above).
**Validation gate:** `bun test packages/agent-runtime/src/util/__tests__/context-pruning.test.ts` + `sdk/src/__tests__/llm.test.ts` (if present) pass; emergency-trim event asserted in a unit test.

## M5 — Pin structured knowledge memory verbatim (P0)

**Fixes:** A4 (only control state pinned), R5 (knowledge memory section).

**Root cause:** `agents/context-pruner.ts:1039-1043` and `agents/base2/base2.ts:1645` pin only `<pinned_active_work_state>` (workflow control). Knowledge (files inspected, edits made, validation results, decisions) is subject to lossy truncation (A1).

**Tasks:**
- [ ] M5.1 Confirm OQ3: mint a new `<knowledge_memory>` block parallel to `<pinned_active_work_state>`, preserved verbatim across compaction. (owner: planner)
- [ ] M5.2 Define the schema: `Goal`, `Decisions`, `Files Inspected` (path + one-line finding), `Edits Made` (path + summary), `Validation Results`, `Blockers`, `Next Action`. (owner: editor)
- [ ] M5.3 In the pruner, extract these fields from the message history *before* budget truncation and populate the block; the block is exempt from the normal budget cutoff (mirrors the existing `hasSubstantivePinnedActiveWork` guard). (owner: editor)
- [ ] M5.4 In `run-agent-step.ts`, thread the block through so it survives `/compact` and mid-turn pruning. (owner: editor)
- [ ] M5.5 Cap the block with per-field budgets (RISK2) with rolling eviction of oldest entries. (owner: editor)
- [ ] M5.6 Add unit + e2e tests: after compaction, a probe can answer files-inspected / edits-made / validation from the block alone. (owner: test-writer)

**Dependencies:** M1 (so compaction itself is rarer, making the block stable).
**Validation gate:** `bun test agents/__tests__/context-pruner.test.ts` + `agents/e2e/context-pruner.e2e.test.ts` pass; AC3 probe test passes.

## M6 — Rebalance summary budgets by content type (P1)

**Fixes:** A2 (user 50k vs assistant/tool 20k), R7.

**Root cause:** `agents/context-pruner.ts:74,77,463,464` define `USER_BUDGET = 50k` and `ASSISTANT_TOOL_BUDGET = 20k`, but operational memory lives in tool results.

**Tasks:**
- [x] M6.1 Rebalance defaults so tool/assistant evidence gets >= user-text budget, with a reserved "facts learned from tools" slice independent of role. (owner: editor) (ASSISTANT_TOOL_BUDGET=40k, USER_BUDGET=30k, TOOL_FACTS_BUDGET=30k; tool_facts role tagged on tool-result entries; 3-counter walk-backwards)
- [x] M6.2 Make budgets configurable via pruner params (already partially supported). (owner: editor) (toolFactsBudget param added alongside existing assistantToolBudget/userBudget)
- [x] M6.3 Update tests with new budget expectations. (owner: test-writer) (6 helper signatures + simulateCompaction type extended; outdated test rewritten to assert tool-facts survives tiny assistant budget; complementary drop test added; 77/0)

**Dependencies:** M5 (structured memory reduces reliance on the free-text budgets).
**Validation gate:** `bun test agents/__tests__/context-pruner.test.ts` budget-assertion tests pass.

## M7 — Semantic trim fallback (no "omitted" placeholder) (P1)

**Fixes:** A3, R6.

**Root cause:** `packages/agent-runtime/src/util/messages.ts:170,171,262,319,340` (`trimMessagesToFitTokenLimit`) replaces older spans with `"Previous message(s) omitted due to length"`.

**Tasks:**
- [ ] M7.1 Verify OQ1 (no downstream consumer depends on the literal string). (owner: planner / code-searcher)
- [ ] M7.2 Before deletion, convert older spans into the M5 structured knowledge-memory format (or a snapshot pointer). (owner: editor)
- [ ] M7.3 Remove the "omitted due to length" literal; replace with a compact pointer like `[older context compacted into <knowledge_memory>; see snapshot N]`. (owner: editor)
- [ ] M7.4 Update `packages/agent-runtime/src/util/__tests__/simplify-tool-results.test.ts` and any test asserting the old string. (owner: test-writer)

**Dependencies:** M5 (structured memory format), M4 (trim is emergency-only).
**Validation gate:** `bun test packages/agent-runtime/src/util/__tests__/messages.test.ts` passes; no occurrence of the old placeholder string in source.

## M8 — Structured `/compact` schema (P2)

**Fixes:** A5, R8.

**Root cause:** `packages/agent-runtime/src/system-prompt/prompts.ts:63-68` freeform `compactPrompt`; consumed at `run-agent-step.ts:604-617`.

**Tasks:**
- [ ] M8.1 Rewrite `compactPrompt` to prescribe the M5 schema fields explicitly. (owner: editor)
- [ ] M8.2 Optionally validate the output conforms to the fields (best-effort). (owner: editor)
- [ ] M8.3 Add a test that `/compact` output contains the schema headings. (owner: test-writer)

**Dependencies:** M5 (schema definition).
**Validation gate:** `bun test` for the `/compact` path passes; AC6 met.

## M9 — Configurable `INCLUDE_REASONING_IN_MESSAGE_HISTORY` (P2)

**Fixes:** C4, R9.

**Root cause:** `packages/agent-runtime/src/constants.ts` hard-codes the flag to `true`; reasoning chunks are large and per-turn-unique, shifting the `LAST_ASSISTANT_MESSAGE` anchor every step.

**Tasks:**
- [ ] M9.1 Confirm OQ2 (which agents are cache-stability-sensitive). (owner: planner)
- [ ] M9.2 Make the flag configurable via agent config / provider options, defaulting off for cache-stability-sensitive agents. (owner: editor)
- [ ] M9.3 Update tests and any agent definitions that hard-depend on reasoning in history. (owner: test-writer)

**Dependencies:** M2 (anchor policy) so reasoning, when kept, does not sit under a tail anchor.
**Validation gate:** `bun test` passes; AC7 met.

## M10 — Telemetry, evals, validation gates (P1)

**Fixes:** R10, N1–N3.

**Tasks:**
- [ ] M10.1 Add a cache-efficiency metric to the existing cache-debug snapshot: cached-vs-input token ratio per request. (owner: editor)
- [ ] M10.2 Add a buffbench eval scenario that runs a long fixture conversation and asserts cache-hit ratio + post-compaction recall. (owner: test-writer)
- [ ] M10.3 Wire the `cache_emergency_trim` event (from M4) into the telemetry surface. (owner: editor)
- [ ] M10.4 Run the full validation suite (`bun test` per package + harness hooks) and confirm no regressions. (owner: basher)

**Dependencies:** M1, M2, M4, M5.
**Validation gate:** eval passes; full test suite green.

## Cross-milestone validation gates

- **Gate G1 (after M1+M2):** Fixture conversation shows stable per-anchor cache hashes across 5 consecutive steps and no summarization after a 6-min idle with low token count.
- **Gate G2 (after M5):** Post-compaction probe test (AC3) passes.
- **Gate G3 (after M4+M7):** No "omitted due to length" string in source; emergency-trim telemetry emits only under synthetic overflow.
- **Gate G4 (final, after M10):** Full `bun test` + harness hooks green; buffbench cache/recall eval meets thresholds.

## Checkpoint / update rules

- **STATUS.md** is updated via `update_plan_status` after every milestone task completes, on any blocker, and at each gate.
- **PLAN.md** is rewritten via `create_plan` only when milestones/dependencies change structurally.
- **SPEC.md** is rewritten via `create_plan` only when goals/requirements/ACs change.
- **LESSONS.md** is appended via `update_plan_status` whenever a decision, gotcha, or surprising measurement is recorded; rewritten via `create_plan` only for substantial restructuring.

## Assumptions to confirm at kickoff (carried from SPEC OQ1–OQ4)

- OQ1: no downstream consumer of the "omitted" string (M7).
- OQ2: which agents are cache-stability-sensitive (M9).
- OQ3: mint new `<knowledge_memory>` block vs extend control-state block (M5).
- OQ4: cache-TTL refresh = marker re-stamp only, no content mutation (M1).

<!-- update_plan_status:appended -->
## M3 completion — 2026-07-03T12:13:44.236Z

- M3 complete: cached the system prompt per session in `packages/agent-runtime/src/run-agent-step.ts`, reusing `AgentState.systemPrompt` when the agent type matches.
- Agent type changes now clear `mainAgentState.systemPrompt` in `packages/agent-runtime/src/main-prompt.ts`, forcing a fresh prompt for the new template.
- `CURRENT_DATE` is already day-granularity; no `/refresh` command exists, and `/clear` resets session state.
- Added regression coverage in `packages/agent-runtime/src/__tests__/main-prompt.test.ts` that hashes the first 4096 bytes of the system prompt across two same-agent turns after mutating dynamic file-context input.
- Validation passed: `bun test src/__tests__/main-prompt.test.ts` -> 6 pass / 0 fail; `bun run typecheck` in `packages/agent-runtime` -> clean.
- Next milestone: M4 — Unify pruning thresholds; emergency-trim telemetry.

