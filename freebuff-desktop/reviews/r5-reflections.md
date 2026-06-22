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

## Project 4 — Particle fireworks (canvas)

Best outcome of the run, and built on the freshly-merged `main` (PR #211) from a new
worktree — so this was also the first real test that the *shipped* code works from a
clean checkout. Prompt → 5-task chain (skeleton+loop → particle system w/ pooling →
click-launch rockets → auto-launch → color variety + perf) → all merged → verified
live: rockets rise from the bottom with glowing particle trails, explode at apex,
particles fall under gravity and fade, dark sky, **steady 120 fps**, no console
errors. The agent even added an on-screen FPS counter on its own to satisfy the
"verify performance" task — a nice emergent quality signal that the gate's intent
propagates into the build.

**[Scout cap — third live confirmation] CONSISTENT.** Held at exactly 4 proposals
(t6–t9) again. The cap is now boringly reliable across three projects.

**[fell short → FIXED] A `failed` task gave no reason.** This session's environment
deleted the orchestrator's own source worktree mid-build; the running server's cwd
vanished and the in-flight task threw → went to `failed`. The UI *does* offer "Retry
with guidance" on a failed task (good), but the throw→failed path never recorded a
`blockReason`, so the task showed a red "failed" badge and a retry button with **no
explanation of what went wrong**. Fix: the catch block now captures the error as the
blockReason (`Pipeline error: …`), so a failed task explains itself and the retry is
actionable. (The *recovery itself* worked once I restarted from a clean worktree:
fresh checkout off main → re-pointed the project → rebuilt with zero issues.)

**[reflection — resilience to infra vs. code failures] open.** The deeper lesson:
the engine cleanly distinguishes *review/test* failures (`blocked`, with findings)
from a thrown *pipeline* error (`failed`), but both now share the same retry path,
which is right. What's still missing is the difference between a **code** failure
(re-running won't help without a change) and an **infra** failure (transient — the
backend was down, cwd vanished); the latter is safely auto-retryable, the former
isn't. A future resilience pass (roadmap §"Resilience: cancellation + stage retry")
could classify the error and auto-retry transient ones a bounded number of times
before surfacing to the human. For now, surfacing the reason is the 80/20.

**[process — the cost of a volatile cwd] note.** Running the orchestrator *from* a
git worktree that tooling may garbage-collect is fragile: when the worktree went
away, the server became a zombie (alive in memory, but every git/file op failing).
A shipped Electron build won't have this problem (stable install dir), but for the
dev/testing loop it argues for running the server from a stable checkout (e.g. the
`.worktrees/freebuff-desktop-next` the app itself now uses), not an ephemeral one.

---

## Project 5 — Countdown timer

The polished finale, and it just *worked* — no app shortfall to fix in the build
itself. Prompt → 3-task chain (skeleton → countdown logic → flip-style polish) → all
merged → verified live: flip-clock digit cards counting `0193d : 08h : 04m : 57s`,
default target **next New Year (2027-01-01)**, ticks every second, datetime-local
picker, dark centered card, no console errors. localStorage persistence is correctly
wired (load on init, save on a valid date change) — empty on first load only because
the *default* isn't persisted until the user picks, which is the right behavior. A
clean demonstration that the orchestrator reliably ships small, correct single-file
apps end to end.

**[the fix for this project — the run's #1 recurring gap] DONE.** Three projects in a
row I flagged the same thing: a task can sit in one stage for minutes (the Playwright
test stage dominates), and with only a static `· review` badge it reads as a *hang*,
not progress. Since the countdown left no build-specific bug to chase, I spent the
project-5 fix on that signal: the running-stage badge now shows a **live elapsed
timer** (`· test 1m`, ticking each second). Implemented as an in-place 1s ticker over
`.elapsed[data-since]` spans rather than a full re-render — deliberately, so it can't
steal focus from an open request-changes textarea. Verified live: the span ticks
47s→48s with no console errors; `fmtElapsed` renders `5s` / `2m` / `1h03m`.

---

## Run retrospective — 5 projects

**What went well.** The core loop is solid: a one-paragraph prompt reliably becomes a
sensible 3–5-task DAG that builds, gates (simplify → adversarial review → multi-
surface test), and merges into clean single-file apps. Every one of the five worked
on live verification. The adversarial review has real teeth (it caught a genuine
float bug in the calculator). The mid-run fixes compounded: keep-work retry, feed-
findings, crash recovery, Scout cap, failed-reason, and now stage-elapsed — several
of which I then watched pay off *live* in later projects (Scout cap held at 4 across
projects 3/4/5; crash recovery resumed a restart with no lost work).

**What still falls short (ranked).**
1. **Speed / cost.** The full gate on every task is the dominant cost — a 4–5 task
   build is 10–15 min wall-clock, mostly the test stage. Model tiering (cheap
   implement, stronger reviewer) and skipping the browser test for non-visual diffs
   would help. The stage-elapsed badge makes the wait *legible* but doesn't shorten it.
2. **Gate depth on non-functional requirements.** The render-check can't verify
   motion/feel — "flip-style *animation*" produced flip-look cards but I couldn't
   confirm the flip transition actually animates; same shape as project 1's "is the
   AI unbeatable?" gap. Logic gets a real assertion now; visual-motion still doesn't.
3. **Resilience classification.** Infra failures vs. code failures still share one
   retry path (see project 4) — transient errors should auto-retry.
4. **Scope ceiling.** Everything built was a single `index.html`. The orchestrator
   hasn't been pushed on multi-file projects, shared modules, or a real test command
   beyond the demo — the next interesting stress test.

---
