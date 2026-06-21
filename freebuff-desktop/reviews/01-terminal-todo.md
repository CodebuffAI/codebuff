# Usability review 01 — Terminal todo CLI

Building a Node command-line todo app. Lens: how does the app handle a **non-web,
CLI** project? Plus the standing lenses — aesthetics, fewer clicks, less typing,
and "cool ideas".

## Findings
- **[P0][run] No way to run or see a project's output in the app.** To verify the
  CLI I had to leave the app and run `node index.js` in a real terminal. For a
  non-web project there is *no* feedback loop in the app at all — the "test" stage
  produced nothing, and there's no Run/terminal affordance. → Add a **Run panel**:
  a command box + output, executed in the project root. Works for CLIs
  (`node index.js list`), tests, builds, and `python -m http.server` for web.
  **(Fixing this in round 1.)**
- **[P1][context] The detail pane never tells you how to run the result.** For a
  CLI you want the usage/commands surfaced, not just a diff. → Show run commands /
  README snippet.
- **[P2][clicks] Approving is select-card → click button, every time.** For
  single-task projects that's two clicks per task; across many tasks it adds up. →
  Keyboard shortcuts (j/k to move, a approve, r request-changes) — a recurring
  "fewer clicks" theme to tackle in a later round.
- Build quality was good: one focused task, a genuinely nice colorful CLI
  (usage, `[ ]`/`[x]` checkboxes, strikethrough on done) from a single prompt.

## Fixed in round 1
- Added a **Run panel** (center-pane view + `POST /api/run`) so you can execute a
  command in the project root and see stdout/stderr/exit code without leaving the
  app. Prefilled with the project's known commands when available.
