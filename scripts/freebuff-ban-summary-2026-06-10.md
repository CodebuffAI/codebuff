# Freebuff ban action summary — 2026-06-10

Count-only summary of the second abuse sweep (first since the 2026-06-08 sweep of
133 accounts and the endpoint fixes — premium daily cap + "You are Buffy" CLI
gate — went live). Account identifiers (emails) are **not** committed; they live
outside version control as an operational audit record. Methodology and signals:
see [`FREEBUFF_ABUSE_FINDINGS.md`](./FREEBUFF_ABUSE_FINDINGS.md).

## Banned: 42 accounts

| Category | Count | Signal |
|---|---:|---|
| Proxy fanout | 5 | distinct `client_id` per call, ~0 agent steps, premium passthrough (incl. a résumé/ATS-scoring app backend and a Chinese general-chatbot proxy) |
| Single-shot farm | 14 | `messageCount == runCount`, 1 client/run, ~0 agent steps (incl. a June-9 same-minute 3-account ring and an LLM-router-sync tool scraping our model list) |
| BPS/zoom single-client cluster | 8 | one shared `client_id` each, 0 steps, identical ~5,600m run durations, bot-suffixed sock handles |
| STT Bandung proxy ring | 8 | campus-named batch (~May 28), ~15 clients/run fanout, coordinated |
| Heavy CLI-automation abusers | 7 | drive the **real** agent loop (high `agent_step` counts) but for automated non-personal-coding pipelines at sock-sharded volume: knowledge-base/topic-merge, scraper-skill farms, ad research, and one account actively reverse-engineering our own rate limiter / fingerprint detection for evasion |
| **Total** | **42** | |

Action: `banned=true` set and `free_session` rows cleared via
`scripts/ban-freebuff-bots.ts --commit`. Verified 42/42 matched, 0 already
banned; 4 active sessions cleared. Reversible via
`scripts/unban-freebuff-users.ts`.

## Held for manual review: ~13 accounts (not banned)

Same fingerprints, higher false-ban cost — corporate and university domains with
real identity behind them, tenured general-chatbot users, and several
proxy-with-some-steps borderline accounts. Listed in the operational audit record
only.

## New finding vs. the 2026-06-08 sweep

The June-8 heuristic keys on **missing** agent steps, so it under-weighted a
second population: heavy users driving the real CLI agent loop (which **creates**
`agent_step` rows) for automated, non-personal-coding pipelines — sharded across
sock clusters to stay under the per-user premium cap. These were category
"Heavy CLI-automation abusers" above.

Follow-up shipped in this PR: a cross-account ring detector
(`scripts/find-freebuff-sock-clusters.ts`) that groups accounts by shared
`fingerprint_id` and `client_ip_hash`. A hard per-IP / per-fingerprint rate limit
was evaluated and **rejected** — prod data showed per-IP limiting would throttle
thousands of legit shared-network users (universities, bootcamps, CGNAT), and
shared-fingerprint clusters include real coders multi-accounting, so both signals
feed human review rather than an automatic block. See
`docs/freebuff-abuse-detection.md`.
