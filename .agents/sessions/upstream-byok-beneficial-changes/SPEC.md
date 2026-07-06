# SPEC: Upstream beneficial-change audit for the BYOK local-only fork

## Overview

The fork (`origin` = AnzoBenjamin/openbuff, `upstream` = CodebuffAI/codebuff) is a local-first, BYOK-only fork of Codebuff. As of the deep re-audit (2026-07-05) it is **143 commits ahead / 555 behind** upstream. Upstream squashes every commit into "Sync public snapshot from freebuff-private," so the verdicts below come from `git diff HEAD...upstream/main` per subsystem and from reading actual file contents on both sides — not commit history.

Fork posture (README.md, docs/local-mode.md, docs/codebuff-to-openbuff-migration.md):
- No backend, no credits, no hosted auth, no run-tracking, no hosted model inference.
- Every request resolves to a user-configured OpenAI/Anthropic-compatible provider in `openbuff.json`, or a ChatGPT/Codex OAuth provider.
- `OPENBUFF_*` env vars + `openbuff.json` are primary; `CODEBUFF_*` only narrow compat aliases.
- Brand is Openbuff; `isLocalMode()` always truthy.

## HARD CONSTRAINT (verified by deep re-audit, 2026-07-05)

**The fork has ZERO freebuff symbols.** Verified by reading HEAD file contents, not just grep:

- HEAD `grep -rl -iE 'freebuff|IS_FREEBUFF' common agents cli packages sdk` → no hits.
- No `common/src/constants/freebuff-models.ts`, `free-agents.ts`, `freebuff-gemini-thinker.ts`.
- No `*freebuff*` files anywhere in `common/`, `agents/`, `cli/`, `packages/`, `sdk/`.
- HEAD `agents/base2/base2.ts` does NOT import `FREEBUFF_*` — but upstream's DOES (lines 4–15: `FREEBUFF_GEMINI_THINKER_*` from `freebuff-gemini-thinker`, `FREEBUFF_REVIEWER_AGENT_ID_BY_MODEL` from `free-agents`, `FREEBUFF_KIMI_MODEL_ID`/`FREEBUFF_MINIMAX_MODEL_ID`/`FREEBUFF_MINIMAX_M3_MODEL_ID` from `freebuff-models`).

Confirmed by user: "we don't have freebuff on this instance, so any changes involving it, don't work."

**Consequence: any upstream change whose import graph touches `freebuff-models.ts`, `free-agents.ts`, `freebuff-gemini-thinker.ts`, or `IS_FREEBUFF` will not compile on this tree.** Those are missing symbols, not "hosted surface to skip." Every port must be freebuff-graph-free or explicitly stubbed before the diff is applied. base2 + CLI ports require hand-merge, never cherry-pick.

## Goals

1. Identify upstream changes net-beneficial to a BYOK local-only fork — runtime correctness, tooling, CLI robustness, model-config accuracy — that do NOT depend on the freebuff layer, hosted backend, credits, referrals, streaks, telemetry.
2. Classify each: PORT / ADAPT / STUB-REQUIRED / SKIP, with the freebuff constraint applied.
3. Enumerate upstream changes NOT applicable so they're excluded from any merge and not re-evaluated later.

## Non-goals

- Merging upstream wholesale (`freebuff/`, ads, referral/streak/engagement, telemetry shipper, `.github/`, `web/`, hosted product) — would not compile here anyway.
- Reintroducing `codebuff.json`/`CODEBUFF_LOCAL_MODE`/`CODEBUFF_PROVIDER_CONFIG` legacy aliases (permanently removed in BYOK purge).
- Any backend/hosted-auth surface or any `freebuff-*` symbol.

## Requirements

- Each recommended port verifiable: diff source range, target file, validation command.
- No recommended change may reintroduce `freebuff-*`/`IS_FREEBUFF`/`free-agents`/hosted-token/referral/streak/analytics dependencies.
- New external tool integrations (Composio) opt-in and disabled by default, matching upstream's `ENABLE_COMPOSIO_TOOLS = false`, AND audited for transitive freebuff imports before porting.
- After every CLI/base2 port, worktree must contain zero new `grep -iE 'freebuff|IS_FREEBUFF' --include='*.ts' --include='*.tsx' cli agents common packages` hits.

## Relevant files / subsystems (verified against both trees)

- `common/src/constants/model-config.ts` — HEAD already has `ALLOWED_MODEL_PREFIXES`, `costModes`, `openaiModels`, `openrouterModels`, `openCodeZenModels`, `deepseekModels`, `finetunedVertexModels`, `models`, `shortModelNames`, `providerModelNames`, `supportsCacheControl`, `getModelFromShortName`, `providerDomains`, `getLogoForModel`. **Missing vs upstream:** `mimoModels`, `minimaxModels`, `moonshotModels` (+ types), `supportsAssistantPrefill`, `providerDomains.minimax`/`.mimo`, `ALLOWED_MODEL_PREFIXES` 'minimax'/'mimo' entries (drop upstream's `'free'`). Upstream also rolled back OpenRouter GPT-5 defaults (`gpt-5.5 → gpt-5.1`) — SKIP that hunk.
- `packages/agent-runtime/src/run-agent-step.ts` — HEAD only references `count_tokens` in a comment (line 1112). **Missing vs upstream:** `toTokenCountInputSchema()` (line 96), `supportsAssistantPrefill(model)` guard (line 323), `clearProgrammaticRunState`, `FETCH_IDLE_TIMEOUT_USER_MESSAGE`, `TRANSIENT_NETWORK_ERROR_USER_MESSAGE`. All freebuff-free. Highest-value port.
- `common/src/tools/list.ts` — HEAD has `read_files`, `read_subtree`, `render_ui`, `run_terminal_command`, `web_search`. **Missing vs upstream:** `read_url`, `gravity_index`, `composio_*` family.
- `common/src/tools/params/tool/read-url.ts` — absent on HEAD; upstream has full params + handler (client-side fetch + readability extraction).
- `agents/base2/base2.ts` — HEAD factory: `mode: 'default' | 'fast'`, has `executePlan`, default model `anthropic/claude-opus-4.7`, has `PLACEHOLDER.CURRENT_DATE`. Upstream factory: `mode: 'default' | 'free' | 'lite' | 'max' | 'fast'`, has `noReview`, default `4.8`, imports `FREEBUFF_*` (lines 4–15). Hand-merge only: bump default to 4.8, add `noReview`, enable `read_url`/`gravity_index`/`render_ui`, refresh system prompt. Reject every freebuff hunk.
- `cli/src/utils/` — HEAD already has `chat-input-key-intercept.ts` + `terminal-enter-detection.ts` (so #11 partially ported already). **Missing vs upstream:** `terminal-watchdog.ts`, `write-file-atomic.ts`, `chat-meta.ts`, `anonymous-id.ts`, `config-dir.ts`, `engagement.ts`, `fetch-usage.ts`. Of these, `terminal-watchdog.ts`, `write-file-atomic.ts`, `chat-meta.ts` are freebuff-free and high-value; `engagement.ts`/`fetch-usage.ts`/`anonymous-id.ts` are hosted/telemetry (SKIP).
- `packages/agent-runtime/src/llm-api/` — HEAD has `claude.ts`, `context7-api.ts`, `gemini-with-fallbacks.ts`, no `serper-api.ts`, no Linkup refs. Upstream has `serper-api.ts` + `codebuff-web-api.ts`. web_search backend fully differs.
- `agents/base2/` — HEAD has `base2-evals`, `base2-execute-plan`, `base2-fast-no-validation`, `base2-fast`, `base2-plan`, `base2.ts`, `base-deep-evals`, `base-deep`, `gate-*`, `quality-prompt-section`. Upstream has the freebuff variants (`base2-free-*.ts`, `base2-max.ts`, `base2-lite.ts`, `base2-mimo.ts`, `base2-kimi-2-7-code.ts`, `base2-gemini-evals.ts`) — all SKIP (freebuff model picker variants).

## Acceptance criteria

- Verdict table in PLAN.md covers each upstream subsystem with PORT/ADAPT/STUB/SKIP + rationale, accounting for the no-freebuff constraint.
- Highest-value ports scoped with concrete file-level tasks + validation gates; any slice whose import graph touches freebuff is STUB-REQUIRED or SKIP.
- LESSONS.md records divergence reality, squashed-upstream gotcha, no-freebuff constraint, and the HEAD-already-ported corrections so future audits don't re-derive them.
- STATUS.md records open questions and the "audit complete, ready to execute M1" state.