# Freebuff ban action summary — 2026-06-08

Count-only summary of the abuse sweep. Actual account identifiers (emails) are
**not** committed; they live outside version control as an operational audit
record. See `FREEBUFF_ABUSE_FINDINGS.md` for methodology and signals.

## Banned: 133 accounts

| Category | Count | Signal |
|---|---:|---|
| Proxy fanout | 49 | distinct `client_id` per call, ~0 agent steps, premium-model passthrough |
| Bulk / farm | 73 | `messageCount == runCount` single-shots, ~0 agent steps, coordinated same-day batches |
| Release-notes-app sock ring | 11 | one company domain, numbered dummy accounts, app-backend JSON responses |
| **Total** | **133** | |

Action: `banned=true` set and `free_session` rows cleared via
`scripts/ban-freebuff-bots.ts --commit`. Verified 133/133 persisted.
Reversible via `scripts/unban-user.ts`.

## Held for manual review: ~33 accounts

Same scripted fingerprint, lower confidence — corporate/edu domains, tenured
general-chatbot users, and a low-volume education sock cluster. Not banned;
listed in the operational audit record only.
