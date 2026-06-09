# Freebuff free-mode abuse investigation — findings (2026-06-08)

Read-only investigation of the heaviest Freebuff users over a 14-day window
(`scripts/find-freebuff-api-suspects.ts --hours 336`, plus trace inspection via
`scripts/inspect-freebuff-traces.ts`). Specific user identifiers are redacted
from this doc; the raw scan output and the actioned account list are kept out of
the repo.

## TL;DR

- **~133 accounts were scripting the raw `/v1/chat/completions` free endpoint
  instead of coding through the Freebuff CLI.** None were doing actual coding —
  confirmed by reading their stored traces. They have been banned.
- They evade the **5 premium-runs/day** cap: that limit is enforced when an
  `agent_run` is created (`triggerGates` → `rateLimiter`). Calling the
  OpenAI-compatible endpoint directly never creates an `agent_run`, so the cap
  is never checked. They hit premium models (deepseek-v4-pro, kimi-k2.6,
  mimo-v2.5-pro, minimax-m3) thousands of times for free.
- Only the per-endpoint fixed-window limiter (PER_DAY=4000 msgs, model-agnostic)
  applied, and most stayed under it per-account — so they sharded load across
  **sock-account clusters**.

## How we tell scripted abuse from real CLI coding

| Signal | Real CLI coding | These accounts |
|---|---|---|
| `client_id` per run | one, reused across the session | a distinct id **per message** (proxy) or msgs==runs single-shots |
| `agent_step` rows | one per message (msgs ≈ steps) | ~0 (`msgs_with_agent_step` ≈ 0) |
| `repo_url` | set | always null |
| messages per run | many (a coding session) | 1 (single-shot) or thousands fanned into one held-open run |
| system prompt | starts with "You are Buffy" (CLI root prompt) | arbitrary app/proxy prompts |
| trace content | code + tool calls + file context | app backends: release-notes JSON, financial-doc-review JSON, essays, chatbots, sysadmin Q&A in many languages |

Two fingerprints:
- **Proxy fanout** — hundreds-to-thousands of distinct `client_id`s inside a
  single run held open for days. Classic OpenAI-compat reseller proxy. One
  active session keys on `userId + instance_id` (not `client_id`), so a single
  admitted session can forward unlimited downstream callers.
- **Bulk / farm** — `messageCount == runCount`, one message per run, 0 agent
  steps. Scripted single-shot completions, often in coordinated same-day batches.

## Trace evidence (categories, redacted)

Sampled stored request/response traces confirmed none were CLI coding:
- A proxy account: ~11k msgs, a **distinct client_id per message**, 0 repo, 0
  agent steps, premium models.
- A 3-account sock ring (shared display name): ~10–14k msgs each, same fanout.
- An 11-account ring on one company domain: responses were **release-notes /
  changelog JSON** — a commercial app backend behind numbered dummy accounts.
- A high-volume account: **financial-statement review JSON** (balance sheet /
  income statement), ~12k distinct client_ids.
- Coordinated same-day farms (20–25 accounts): single-shot essays/translations
  with bot-generated display names.

## Action taken

**133 accounts banned** (set `banned=true`, cleared `free_session` rows) via
`scripts/ban-freebuff-bots.ts --commit`. Breakdown:

| Category | Count |
|---|---|
| Proxy fanout (distinct client_id per call, ~0 agent steps) | 49 |
| Bulk / farm (msgs==runs single-shots, ~0 agent steps) | 73 |
| Release-notes-app sock ring (one company domain) | 11 |
| **Total** | **133** |

The exact actioned list (emails) is intentionally **not** committed to the repo;
it lives outside version control as an operational audit record. Bans are
reversible via `scripts/unban-user.ts`.

## Left for manual review (not banned)

~33 accounts with the same scripted fingerprint but lower confidence — corporate
/ edu domains (real identity behind them), tenured accounts using it as a general
chatbot via proxy, and a low-volume education sock cluster. Listed in the
operational audit record, not here.

## Root cause & fixes (this PR)

The 5-premium-sessions/day cap is enforced only on the agent-run path, and the
free endpoint can be called without ever creating an agent run. Even within the
5-session cap, one active session (default ~60 min) permits unlimited premium
messages and can proxy unlimited downstream `client_id`s. This PR closes both
gaps at the endpoint itself (session-independent, bypass-proof):

1. **Premium-model daily cap** (`FREE_MODE_PREMIUM_RATE_LIMITS.PER_DAY = 1200`)
   enforced on every free-mode premium request at `/v1/chat/completions`.
2. **CLI-required gate** — free-mode root requests must carry the CLI's
   "You are Buffy" system prompt; scripted callers get a friendly 403 pointing
   them to `npm i -g freebuff` (not a ban). A caller who injects the marker but
   still produces no agent steps is then a clear ban candidate, surfaced by
   `scripts/find-freebuff-api-suspects.ts`.
