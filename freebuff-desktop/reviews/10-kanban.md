# Usability review 10 — Kanban board

Drag-and-drop web app. Lens: discoverability — the app has grown a lot of features.

## Findings
- **[P2][discoverability] The app now has many features** (chat, task review,
  Run, Preview, fullscreen, docs editor, keyboard shortcuts) and no single place
  explaining them. A new user wouldn't find Run/Preview/shortcuts. → A **help
  overlay** (? key or header button) summarizing features + shortcuts. (Fixed.)
- The orchestrator's plan is now genuinely pleasant to read: it lays out the
  linear-chain task graph as a table and explains *why* ("ensures only one task…
  merges before the next"). The compounding fixes (friendly chat, persistence,
  linear chains) make the cockpit feel coherent.
- Kanban built across a 5-task linear chain with drag-and-drop, edit/delete,
  per-column counts, localStorage — viewed live in the preview.

## Fixed in round 10
- **Help overlay**: press `?` (or the header `?` button) for a clean modal listing
  what the app does (Build / Review / Preview / Run / Docs) and every keyboard
  shortcut; Esc or click-outside closes it. Ties the accumulated features together.
