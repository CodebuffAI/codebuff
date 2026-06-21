# 5 more projects — extemporaneous notes + reflection

A second usability+quality pass: build 5 new products by prompting the app, jot
what I notice live, then reflect on what *fell short* (UX, the agents, the
outcomes) and fix it after each. Now with the Scout on, so I also watch the
"it compounds" loop.

Projects: 1) tic-tac-toe w/ unbeatable AI, 2) scientific calculator,
3) Web-Audio piano, 4) particle fireworks canvas, 5) countdown to a date.

---

## Project 1 — Tic-tac-toe (minimax AI)

Built cleanly: skeleton → CSS → minimax JS (3 chained tasks, 302 lines, renders,
browser-test passed). But the most interesting findings were about what *fell short*:

**[fell short → FIXED] The Scout was completely dead in the live app.** Two layers
of "looks done but isn't":
1. `server.ts` still passed `enableScout: false` — the stale M0 opt-in gate, never
   flipped. The engine default (`?? true`) was overridden, so it never fired.
2. Even when it fired, the scout agent (deepseek-flash) burned its whole turn
   read-inspecting every doc and never called create_task.
Fixed both: Scout on by default (proposals are a reviewable backlog, so it's safe),
and restricted the scout to create_task only with the priorities + existing tasks
inlined. Now it proposes 3 grounded follow-ups (score tracking, animation, sound),
shown as a "💡 N suggestions" CTA + a Proposed column with Accept & run / Dismiss.
Verified live end-to-end: Accept promoted a proposal to running.

**[reflection — the recurring failure mode] "Built but dead."** This is the THIRD
time a feature was coded, typecheck-clean, and unit-tested in isolation yet inert
in the live app: the workingDiff-skip (gate stages silently skipped pre-commit),
and now the Scout gate (×2). A flag/env-default/data-flow gap kills it silently.
Lesson: isolation tests aren't enough — every feature needs a LIVE smoke through
the running app. (Worth a startup self-check that logs which subsystems are active,
and a /api/health that reports scout/test/etc. enabled state.)

**[outcome — the gate's confidence is shallower than it looks] FIXED.** The
browser test verifies "renders, no console errors" — but it canNOT tell whether the
minimax AI is actually *unbeatable*. For logic/algorithm-heavy work the gate was
green on undertested code. Fix: strengthened the test-planner prompt so that for
algorithmic/logic changes it writes and runs a quick assertion script (node via
tmux_run) — e.g. simulate that the AI never loses — instead of only render-checking.

---

## Project 2 — Scientific calculator

The richest project for surfacing real bugs. The adversarial review has teeth:

**[review works — good] It blocked a genuine subtle bug.** The engine task was
blocked because review caught a "floating-point rounding inconsistency between
operator chaining and equals" (`1/3` then `+` displayed `0.3333333333333333`). This
is exactly the kind of correctness issue the gate exists to catch.

**[fell short → FIXED] Blocked-retry thrashed and lost work.** When review blocks,
the retry called `resetToDefault` — discarding the whole implementation AND the
review's fix attempts — then re-implemented from scratch, rediscovering the same
issue (the engine task looped). Two fixes: (1) re-runs now **rebase-and-keep** the
work (reset only on a real sibling conflict), so a review-blocked retry *refines*
the code; (2) the retry **feeds the gate's prior findings back** as guidance so it
addresses them instead of re-finding them.

**[fell short → FIXED] Crash recovery was missing.** Restarting mid-build orphaned
a `running` task, AND `ready` tasks then sat unadmitted because nothing kicked a
tick after launch — I watched t3 stall at `ready` for 65s. Fixes: on startup the
engine **requeues orphaned `running` tasks** and **ticks to resume** ready ones.
(Worth a /api/health later that reports active subsystems — see project 1.)

**[fell short — open] Slow / thrashing on hard tasks + model is the bottleneck.**
The scientific-functions task looped for 6+ minutes. The gate is rigorous, but the
single cheap model (deepseek-flash) struggles to satisfy a strict reviewer on
subtle numeric issues, so the implement→review→fix loop can grind. Candidates:
model tiering (a stronger model for the fixer/reviewer), a hard retry budget that
surfaces to the human with the findings instead of looping, and the keep-work retry
(done) to at least stop restarting from zero.

**[fell short — open] Scout is eager.** It fired off every completed task and piled
up 5 proposals for a 3-task project. The reviewable backlog contains it, but it
could dedupe / cap, or fire only off the last task in a chain.

---

## Project 3 — Web Audio piano

Cleanest run of the three. Prompt → 4-task linear chain (skeleton → render keys →
oscillator playback → keyboard input) → all merged → verified live: two octaves of
white/black keys, correct ARIA labels ("C sharp 4"), click plays with no console
errors, active key highlights. Good outcome with zero hand-holding on the build.

**[the Scout cap works live] CONFIRMED.** The fix I made during this project landed
its proof in the same run: the Scout stopped at **exactly 4** proposals (the cap),
versus the 8 it piled up on the calculator. The backlog stays reviewable without
becoming a wall. (Also covered by two unit tests: skips-at-cap, runs-with-room.)

**[crash recovery works live] CONFIRMED.** I restarted the server mid-build (to load
the Scout-cap change) while t1 was `running`. On restart the engine requeued t1
→ ready and the startup tick re-admitted it — the build resumed on its own with no
lost work. Exactly the path project 2 added; nice to see it exercised for real.

**[fell short → process note, not a code bug] The driver out-ran its own timeout.**
My headless approval driver capped at 180 polls (~15 min); the 4-task chain's last
task (t4) reached `awaiting-approval` after the driver had already exited, so it sat
unmerged until I approved it by hand. Not an app bug — a test-harness sizing issue —
but it's a real signal: **a 4-task build with the full gate can exceed 15 min of
wall-clock** (the Playwright test stage dominates). For a human watching the UI
that's a long time between approvals with little feedback on *why* a task is slow.
Candidate app-side improvement: surface per-stage elapsed time / a "still running:
test stage (Ns)" hint so a slow task reads as progress, not a hang. Logged for the
UX-polish pass; folded the longer timeout into the operator guide
(`docs/desktop/e2e-testing.md`).

**[infra — fixed out of band] CI was red on a frozen-lockfile error.** The M1
browser tester added `playwright` to freebuff-desktop's deps but `bun.lock` was
never regenerated, so every CI job died at `bun install --frozen-lockfile`. Synced
and committed the lockfile; `build-freebuff` went green. A reminder that "adds a
dependency" is itself a change that needs the lockfile committed — easy to miss when
the local `node_modules` is already warm.

---
