# Usability review 02 — Markdown notes app (Obsidian-like)

A web app (single index.html). Lens: now that CLIs can be run, how do you **see a
web app**? Plus aesthetics / fewer-clicks / less-typing / cool ideas.

## Findings
- **[P0][web] No way to SEE a web app in the app.** A markdown notes app is
  visual, but the app only shows a diff. The Run panel (round 1) can't help —
  serving a page (`python -m http.server`) is long-running and just hangs the
  run-and-capture. → A **Preview panel**: serve the project's files and iframe
  `index.html` live. **(Fixing this in round 2.)**
- **[P1][decompose] Over-decomposition into conflicting parallel tasks.** For a
  single-file app the orchestrator made 4 tasks — skeleton, CRUD, renderer (all
  parents=[], all rewriting index.html) + wiki-links. Approving them in sequence
  piles up sibling-merge conflicts; each needs a rebase-retry. A human would
  sequence same-file work or use one task. → Teach the orchestrator: when tasks
  will edit the same file, chain them (depend on a shared skeleton) instead of
  running parallel. (Round 3 candidate.)
- **[P2][flow] Recovering from a pile of conflicts is tedious** — approve → blocks
  → retry → approve, per task. → A "rebase & retry" one-click on blocked tasks
  exists, but a "retry all blocked" or auto-rebase-on-approve would cut the grind.

## Fixed in round 2
- **Preview panel**: a `/preview/*` static route serves the project root; a
  "◐ Preview" center-pane view iframes `index.html` live (with Refresh + Open-in-
  browser). Now web projects are visible inside the app — the web pair to Run.
