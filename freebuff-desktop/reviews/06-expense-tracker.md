# Usability review 06 — Expense tracker dashboard

Data/forms/chart web app. Lens: real-work continuity + chained-decomposition
quality.

## Findings
- **[P0][continuity] The chat conversation was lost on every reload/restart.** For
  real work you come back to a project and the whole orchestrator conversation is
  gone — only tasks persisted. → Persist the chat transcript per project. (Fixed
  this round; verified the conversation + tool-call chips reload intact.)
- **[P1][decompose] "Star" chaining still conflicts.** Round 3 made same-file tasks
  depend on the skeleton, but here the orchestrator made t1 → {t2,t3,t4} (a star):
  t2/t3/t4 all depend on t1 but run parallel to EACH OTHER, all editing index.html
  → they still collide. → Refined the prompt to require a LINEAR chain (each
  depends on the previous), so only one task edits the file at a time. (Fixed;
  takes effect next project.)
- **[idea] Sample data** — a fresh data app (expense tracker) is empty/unconvincing
  until you add rows. The test/preview story would be better if the app could be
  previewed with seed data. (Parking.)

## Fixed in round 6
- **Chat persistence**: a `chat_messages` table + `/api/chat-history`; the engine
  records each user + assistant turn (with raw tool calls), and the UI loads the
  transcript on open and renders it identically to live (friendly tool chips).
  Verified across a reload. +1 store test.
- **Linear-chain decomposition**: orchestrator prompt now requires a linear
  dependency chain for same-file work, not a star, to eliminate sibling conflicts.
