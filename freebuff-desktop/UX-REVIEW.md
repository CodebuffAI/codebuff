# Freebuff Desktop — Usability Review (building a browser game)

Notes captured while using the app as a human to build a browser game by
prompting only. Each note: **[area] observation → proposed fix**, severity P0–P3.

## Setup / onboarding
- **[onboarding] No way to attach or pick a project from the UI** — the target
  repo is hardcoded via env (`TARGET_REPO`). A real user can't point it at their
  repo. → Add a first-run "Open project" screen (folder picker / repo path) + a
  project switcher. (P1; full picker is later, but at minimum the path should be
  visible/editable.)
- **[header] The repo/project being worked on is invisible** — the left header
  just says "Tasks". You don't know which project you're in. → Show repo name +
  branch in the header. (P2)
- **[onboarding] No empty-state guidance** — fresh app shows empty columns; the
  only hint is the chat placeholder. → A friendly empty state: "Describe what you
  want to build" with example prompts. (P2)

## Layout / responsiveness
- **[P0][layout] The chat pane (primary surface) collapses to 0px on narrow
  windows.** The 3-pane grid is `210px minmax(0,1fr) 270px`; at viewport ~426px
  the center is clamped to 0 and the whole chat disappears — only Tasks + Detail
  show. A desktop window can be any size; this makes the app unusable when
  narrow. → Responsive layout: below ~900px collapse to a single active pane with
  a segmented switcher (Board · Chat · Detail); never let chat hit 0. (P0)
- **[P1][layout] Fixed-pixel side panes don't scale.** Sides are hardcoded px; on
  very wide screens the chat is huge and detail is cramped. → Use fractional/min
  widths and allow the detail pane to grow.
- **[P2][layout] No way to collapse/resize panes.** A user reviewing a big diff
  wants more room. → Draggable splitters or a "focus task" full-width mode.

## Chat / orchestrator
- **[P1][chat] Raw tool calls flood the chat.** Every `create_task({...})`,
  `add_dependency(...)`, `list_tasks({})`, `get_task(...)` is printed verbatim as
  JSON. It's noisy and developer-facing; the actual plan summary gets buried. →
  Render tool calls as friendly one-liners ("➕ Created 'Add brick grid…'", "🔗 t2
  depends on t1") or collapse them behind a disclosure; keep the prose summary
  prominent.
- **[P1][chat] The orchestrator fumbled dependency wiring.** It created tasks,
  mis-referenced ids, then said "Only task 1 survived. Let me re-create tasks 2
  and 3…". Guessing ids before creation is error-prone. → Either let
  create_task accept `parents` by title, or strengthen the prompt to always use
  returned ids; consider a single `create_tasks` batch tool that takes the whole
  graph at once so dependencies are atomic.
- **[P2][chat] No clean "plan" view.** After decomposition the user wants a tidy
  "Building X in N tasks: …" card, not a wall of tool chips.
- **[P3][chat] Input placeholder is stale** ("Add a multiply function and a
  reverseString util") — leftover from the math demo.
- **[P2][chat] Chat log is client-only and lost on reload** while tasks persist —
  inconsistent. → Persist chat transcript per project.

## Board / status semantics
- **[P1][board] Dependency-blocked tasks show "ready".** t2/t3 display status
  "ready" with a ⛓ badge but cannot run (waiting on t1's merge). Looks like they
  should be running. → Add an explicit "waiting on deps" treatment (dim + "waiting
  on t1") distinct from admittable "ready".
- **[P1][flow] When the machine stalls on an approval, nothing says so.** After
  t1 hit review, t2/t3 are stuck until I approve t1 — but the UI doesn't tell me
  "Approve t1 to unblock 2 tasks." → Surface a clear call-to-action / approvals
  inbox with the unblock impact.
- **[P2][budget] The budget meter is useless for the free model** — always
  "$0.0000 spent". → Show tasks-run / agent-activity, or remaining budget as a
  bar, not a $0 that never moves.

## Task detail / pipeline transparency
- **[P1][detail] Pipeline strip shows every stage green with no evidence.** t1's
  review + test produced no notes/evidence, yet both render as "done". A reviewer
  can't tell "ran & clean" from "skipped". → Per-stage status chips with a summary
  on hover/expand: "Review: passed (no findings)", "Test: skipped — no runtime
  tests", with duration. Make skipped visually distinct from done.
- **[P2][detail] Diff is shown as a raw `<pre>` with +/- coloring only.** Fine,
  but for a 250-line diff it's a wall. → Collapse by file, show file headers,
  add line numbers; maybe a "Files changed (1)" summary.
- **[P2][detail] No "open the PR / view on GitHub" affordance** and `local://…`
  PR refs aren't actionable. For local mode, → a "view full diff" / "open in
  editor" action would help.

## Governing docs (core differentiator — currently broken)
- **[P0][docs] Governing docs are non-functional.** They're listed in the sidebar
  with `href="#"` and NO click handler — clicking does nothing. You cannot read or
  edit them. "Transparent, user-editable governing docs" is a headline feature
  (PRD §10/§12) and it's entirely absent from the UI. → Clicking a doc opens it in
  the center pane as a viewer/editor; human edits save (commit) directly; show
  which are present vs. empty.
- **[P1][docs] No way to see what the learning loop wrote.** Even read-only access
  to product/priorities/technical/etc. is missing.

## Review actions
- **[P2][actions] Request-changes uses `window.prompt()`** — a native blocking
  dialog: unstyled, single-line, no markdown, easy to mis-click cancel. → Inline
  comment box in the task detail pane.
- **[P2][actions] Abandon has no confirmation** and immediately GCs the worktree.
  Destructive. → Confirm step (or undo window).
- **[P2][actions] After approving, the detail pane keeps showing the old task**;
  no "merged ✓" confirmation or auto-advance to the next task needing review.

## Quality gate / testing (the thesis — biggest gap)
- **[P0][testing] The gate passed a BROKEN game.** All 3 tasks went
  implement→…→test→pr and merged as "ready", but the rendered game is a blank
  canvas (getImageData all-zeros). The "test" stage never opened a browser, so a
  runtime/rendering bug shipped marked "tested". This directly undercuts the
  "trustworthy automated quality gate" thesis. → For web projects, the test stage
  must actually load the page in a headless/preview browser, check for console
  errors, and assert *something* rendered (non-blank canvas / visible elements),
  attaching a screenshot as evidence. At minimum, never label a task "ready/tested"
  when no real verification ran.
- **[P1][testing] "Test passed" with zero evidence is misleading.** With
  `TEST_CMD=''` the stage produced no evidence yet the task surfaced as ready. →
  Show "Test: not run" explicitly; gate "ready" on real evidence or clearly mark
  "unverified".
- **[P1][setup] Run-config discovery is naive.** It defaulted to `node --test`
  for a browser game (wrong); here it was blanked manually. → Detect project type
  (static site / node / etc.) and pick a sensible verification (serve + browser
  smoke for static).

## Bug-fix loop without a browser (compounding the testing gap)
- **[P0][testing] A bug-fix task "fixed" a bug it couldn't see — and didn't.**
  Reported "blank canvas"; the fix agent (no browser in the loop) guessed it was a
  missing `roundRect` polyfill, merged, and the screen was STILL blank. Only after
  I hand-debugged the real cause (init-order TDZ) and pasted the exact diagnosis
  did it get fixed. Without a browser in the test/verify loop, the gate can't
  diagnose or confirm visual/runtime bugs — it shipped a non-fix as "ready". →
  Browser-in-the-loop verification is the highest-leverage improvement; the
  test/review agents need to actually load the page and read console + pixels.
- **[P1][flow] The human ends up doing the debugging the gate promised to do.**
  The value prop ("arrives ready, you just approve") inverts when the gate can't
  verify — I had to open the game, sample the canvas, read the source, and find
  the TDZ myself. The app should at least surface "couldn't verify this renders".

## What already works well (keep)
- Decomposition into a sensible **dependency chain** was genuinely good (3 tasks,
  correctly sequenced so they don't conflict).
- The **request-changes loop works** (colorful bricks landed cleanly).
- **Bug-fix-by-chat** creates a task and runs it; with a precise report it fixed
  the real bug. The whole game was built by prompting only.
- Approve→merge→unblock-next **chain advances automatically**. Pipeline + sibling
  -merge safety from the prior PR held up.

## Prioritized fix plan for this overhaul
P0 (design + core): responsive layout (chat never 0px; <900px single-pane +
segmented Board/Chat/Detail switcher); make governing **docs openable + editable**
in the center pane (read + save-commits); **honest stage status** (skipped/
unverified vs done, with evidence) so we never imply "tested" when nothing ran.
P1: friendly **tool-call rendering** + plan summary in chat; **dependency-aware
status** ("waiting on t1") + approvals call-to-action; **header** with repo+branch;
**empty state** with example prompts; activity meter instead of $0.
P2: inline request-changes box (kill `prompt()`); abandon confirm; by-file diff;
project path visible.
Deferred (note in PRD): real browser-in-the-loop test executor (§7.1) — the
highest-value future work; this overhaul makes the gap honest, not hidden.

— End of build-phase notes. —

## Fixes applied in this overhaul
Full UI redesign (`src/app/ui/index.html`) + small server/engine additions:
- **Responsive layout (P0):** 3-pane on wide screens; below 1000px a single pane
  with a segmented **Tasks · Chat · Detail** switcher (with a review-count badge).
  Chat can never collapse to 0px. Clean dark theme, refined tokens/spacing/type.
- **Governing docs now work (P0):** click a doc → opens a viewer/editor in the
  center pane; **Save commits the content** (new `POST /api/doc/:name`, `engine.
  saveDoc`, cap-enforced with a live line counter). Verified end-to-end (writes to
  `.freebuff/docs/*.md`); the orchestrator reads them (saw "· read doc").
- **Honest stage status (P0):** detail pane shows per-stage evidence — "Review:
  passed, no findings" and a clear **"⚠ Not verified — no runtime test ran"** when
  the test stage produced nothing, instead of implying everything was tested.
- **Friendly chat (P1):** tool calls render as "➕ New task: …", "🔗 t7 depends on
  t6", subtle "· read doc" for inspections — no more raw JSON; prose stays primary;
  "Thinking…" indicator; auto-grow composer; empty state with example prompts.
- **Dependency-aware board (P1):** tasks waiting on an unmerged parent show
  "waiting on tN" (amber, dimmed) instead of a misleading "ready"; a **"N ready
  for your review"** call-to-action jumps to the first; header shows repo + branch
  + a real activity meter (running/cap · merged) replacing the always-$0 cost.
- **Review actions (P2):** inline request-changes box (kills `window.prompt()`);
  two-step **abandon confirm**; by-file collapsible diff; "Merged ✓" state.

## Still deferred (documented, not hidden)
- **Browser-in-the-loop testing (P0, biggest future win):** the test stage still
  doesn't load the page in a real browser, so visual/runtime bugs (like the TDZ
  blank-screen) can pass. The overhaul makes this **honest** ("not verified") but
  the real fix is a headless/preview-browser test executor (PRD §7.1).
- Run-config type detection; chat-transcript persistence; pane resizing.
