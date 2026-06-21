# Usability review 07 — Typing speed test

Fast interactive web app. Lens: delight / "nothing tells you when the machine
needs you" + confirming the linear-chain fix.

## Findings
- **[P1][awareness] You don't notice when a task needs you.** While doing other
  things (or watching the chat/preview), a task quietly reaches `awaiting-approval`
  and the machine stalls — the only signal was a board badge you had to be looking
  at. → In-app **toast notifications** for the events that need a human. (Fixed
  this round.)
- **Linear-chain fix confirmed beautifully.** The orchestrator decomposed into a
  true linear chain (t1 → t2 → t3) and even *explained* it in chat: "3-task linear
  chain (all touch index.html, so chained to avoid merge conflicts) … each task
  builds on the prior one, so no merge conflicts." No conflicts this build.
- **Chat-plan readability is now great** — persisted transcript shows the friendly
  tool chips + a clean plan table. The round-6 + earlier fixes compound nicely.

## Fixed in round 7
- **Toast notifications**: a fixed top-right stack driven by SSE status
  transitions — green "ready for your review" (click → opens the task), red
  "needs attention" (blocked/failed), muted "merged ✓". Skips the first snapshot
  so you don't get a flood on load; auto-dismisses. Client-only, no server change.
  Verified rendering live.
