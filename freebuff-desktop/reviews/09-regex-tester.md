# Usability review 09 — Regex tester (developer utility)

A dev tool. Lens: the "after a change merges, I want to see it" flow + fewer clicks.

## Findings
- **[P2][flow] After merging a visual change you have to manually go look.** You
  approve, then click Preview, then maybe Refresh — to see the thing you just
  merged. → When a task merges, **auto-refresh any open preview**; and add a
  **"View result"** button on merged tasks. (Fixed this round.)
- **[note] Deep linear chains are slow to approve.** The regex tester chained into
  5 sequential tasks (pattern input → highlighting → groups → cheatsheet →
  examples); each needs its own approval and they can't run in parallel. Correct,
  but a future idea: a "review queue / approve-through" mode, or smarter grouping
  so a single-file app isn't always fully serialized.
- Built cleanly with the linear-chain + scope-discipline fixes holding up across a
  longer chain.

## Fixed in round 9
- **Live preview**: an open preview (inline or fullscreen) **auto-refreshes when a
  task merges**, so you watch the product evolve as PRs land.
- **"View result"** button on merged tasks → opens the preview. Saves the
  navigate-to-preview clicks after approving a visual change.
