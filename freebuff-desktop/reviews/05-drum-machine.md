# Usability review 05 — Drum machine (Web Audio step sequencer)

Interactive audio web app. Lens: reviewing visual/interactive products + verifying
the round-4 scope fix.

## Findings
- **Scope fix confirmed.** Chained t1→t2→t3 (skeleton → audio engine → sequencer)
  each did real, in-scope work — no over-build, no "No changes produced" blocks
  (unlike the pomodoro before the fix). Clean build, 0 conflict retries.
- **[P1][preview] Reviewing a visual app in the narrow center pane is cramped.** A
  16-step sequencer grid wants width. → A **fullscreen preview** makes design/UI
  review actually pleasant. (Fixed this round.)
- **[P2][aesthetics] White iframe flash** before a dark page paints. → iframe
  background set to the app's dark bg. (Fixed.)
- **[idea] Interact-in-preview works** — the iframe is live, so you can toggle
  pads / press Play right in the app. The Preview panel is genuinely a play-test
  surface, not just a screenshot.

## Fixed in round 5
- **Fullscreen preview** (⤢ button + Esc to close) and **dark iframe background**
  — reviewing landing pages / UI-heavy apps is now full-width and flash-free.
  Verified: the drum machine renders full-screen with its grid, transport, BPM,
  and preset buttons.
