# Freebuff Desktop — Known Issues, V1 Gaps & Roadmap to Production

> Companion to [`freebuff-desktop-prd.md`](./freebuff-desktop-prd.md). This is the
> honest "what's missing" doc: known bugs, the V1 features still unbuilt, technical
> debt, and everything between the current prototype and a product people actually
> want to use. Written after building M0 + M1, the UX overhaul, and a 10-project
> usability run (per-project notes in `freebuff-desktop/reviews/`).

## 0. Where we actually are (honest status)

**Built & working (verified):**
- The full loop turns: orchestrator chat → task graph → pipeline (implement →
  simplify → review → test → PR) → human approve/merge → unblock dependents.
- Real agents on `deepseek-v4-flash` against the Freebuff backend.
- **M1 quality gate**: real browser testing (Playwright/Chrome) that catches
  blank-screen/runtime bugs, tmux CLI testing, a planner that picks the harness,
  a deterministic gate, and screenshot evidence in the UI.
- Sibling-merge safety (rebase-onto-main, conflict → blocked), linear-chain
  decomposition for single-file projects, agent scope discipline.
- A clean, responsive browser-served UI: board, chat, task detail, Run panel,
  Preview panel (+ fullscreen), governing-doc editor, keyboard shortcuts, toasts,
  chat persistence, help overlay.
- 61 unit tests, typecheck clean.

**The honest gap in one sentence:** it is a *working local prototype of the loop*,
not yet a *desktop product* — it is not actually an app you install, it only works
on one hardcoded project, the "compounding" differentiator (Scout + learning) isn't
wired, and the trust/onboarding/distribution story for real users doesn't exist yet.

---

## 1. Known issues & bugs (current code)

### Correctness / reliability
- **[P1] In-flight agent runs aren't cancelled on abandon/close.** `abandon()` GCs
  the worktree and marks the task abandoned, but the SDK `run()` already in flight
  keeps going (and may still write to a now-removed worktree). Pausing on app-close
  (§6.5) is "stop issuing new work" — it doesn't actually halt running stages.
  Need real cancellation (AbortController through `client.run`).
- **[P1] Transient SDK/API errors fail the whole task.** A 429/5xx mid-pipeline
  throws → task goes `failed`. No retry/backoff at the stage level; the user must
  re-run. Needs resilient stage execution with bounded retries on retryable errors.
- **[P2] Occasional spurious sibling rebase-retry.** Even chained tasks sometimes
  hit a transient conflict in `localSquashMerge` right after a parent merges
  (a timing/index race in the local-merge path). The retry recovers it, but it's
  a wasted pipeline run. Investigate locking the repo working tree during merges.
- **[P2] Pause/resume re-runs a whole stage.** By design there's no mid-stage state
  to serialize, but a long stage interrupted near the end redoes all of it. Fine
  for now; worth a checkpoint for expensive stages later.
- **[P2] Artifact bloat.** Test screenshots are base64 PNGs stored in SQLite
  (`task_artifacts`) and never GC'd; diffs/transcripts accumulate. Over a long-
  lived project the DB grows unbounded. Need artifact retention/GC + maybe move
  blobs to files.
- **[P2] Budget is enforced in cost units, not tokens.** `recordSpend` folds the
  SDK's `totalCost` (≈$0 for the free model) into the ledger; the PRD specifies a
  token budget. For the free model the budget never bites and the meter shows
  "$0.0000". Wire real token accounting + a meaningful meter, or rebase the meter
  on agent-runs/tasks for the free tier.

### Data / persistence
- **[P1] No schema migration path.** `SCHEMA_VERSION = 1` with a single CREATE
  block; there's no real up-migration story. The first schema change after users
  have data will need a migration framework.
- **[P2] Governing docs aren't actually versioned in git.** They live under
  `.freebuff/docs/` which is gitignored, so the PRD's "docs are diffable, reviewed
  like code, leave a git trail" (§10.1, §14) isn't true today — human edits write
  the file but don't commit; the agent doc-edit-via-PR path isn't exercised because
  the learning loop is off. Decide: commit `.freebuff/docs/` (un-gitignore it) and
  wire doc edits to commits.

### Platform
- **[P1] Windows/Linux unsupported in practice.** tmux (CLI testing), the Chrome
  `channel:'chrome'` launch, `bash -lc`, and several path assumptions are
  macOS/unix-shaped. A real desktop product needs cross-platform.
- **[P2] Test harness external deps.** Browser testing needs system Chrome;
  tmux testing needs tmux installed. Both degrade gracefully (skip), but a shipped
  app must bundle/manage a browser (Playwright's own Chromium, pinned) and not
  depend on the user having tmux.

### Minor / polish
- **[P3] Project name in the header is derived from the path basename** — fine for
  real repos, looked like "active" behind the dev symlink.
- **[P3] Diff viewer is basic** — +/- coloring + by-file collapse only; no syntax
  highlighting, no large-diff virtualization, no inline comments.
- **[P3] The local HTTP API has no auth/CSRF token.** Low risk (localhost, JSON
  preflight) but should be addressed when it's embedded in Electron.

---

## 2. V1 features still unbuilt (per the PRD roadmap)

V1 = M0 + M1 + M2 (the full compounding loop). M0 and M1 are done; **M2 is the
remaining V1 work**, plus MH before shipping to outsiders.

### M2 — thicken the loop (the actual differentiator) — **not built**
- **[P0] The Scout (§9).** Code exists (`runScout`) but is gated off
  (`ENABLE_SCOUT`) and never surfaced. Needs: it fires off completed seeded work,
  reads `priorities.md`, proposes follow-ups as `proposed` tasks, prefers
  independent tasks, and a UI to review/accept/dismiss proposals. Without this the
  "self-driving machine that keeps going" claim is unfulfilled.
- **[P0] The learning loop / "dreaming" (§10).** Not built. Needs: a learning
  agent that runs at PR-ready, reviews the whole trajectory, and makes lean,
  evidence-backed, self-integrating edits to the role-split governing docs under
  the length cap. This is *the moat* — "it compounds" — and it's entirely missing.
- **[P1] Governing-doc edit-via-PR flow.** Agent doc edits should ride a task's PR
  and be cap-gated as a merge gate (§10.2). Human inline edits should commit
  directly. Neither is wired end-to-end.
- **[P1] Doc-rot guards in practice.** The length cap exists in `DocStore`; the
  merge-gate enforcement and the "edits clean up as they go" behavior need the
  learning loop to exercise them.

### MH — pre-public-launch hardening — **not built**
- **[P0] Freebuff GitHub App.** Today: shells out to the user's local `git` + `gh`
  (and the local-merge path with no remote). For outside users this must become a
  fine-grained GitHub App (contents + pull_requests, per-repo install) so onboarding
  doesn't depend on each user's `gh` setup. The real GitHub PR flow (open, review on
  GitHub, `gh pr merge`, external-merge detection) is barely exercised — local mode
  is what's been tested.
- **[P0] Real auth in the app.** Currently uses `CODEBUFF_API_KEY` from the
  environment. Needs the Freebuff sign-in flow (same backend as the CLI) inside the
  desktop app, token storage, refresh, sign-out, and the per-account daily budget.
- **[P0] Abuse / cost hardening.** This is a *free* product; freebuff already has an
  abuse history (registration farms, reselling — see the freebuff abuse docs).
  A desktop agent farm is a juicy target. Needs per-account/per-IP limits, the daily
  budget actually biting, and abuse detection.

### M3 — post-launch reach (explicitly later, but worth listing)
- Parallel attempts ×N + synthesis (quality boost).
- Native desktop/OS notifications (we have in-app toasts only).
- Direct per-task chat (today you steer via the orchestrator; `send_guidance` is
  wired but there's no per-task chat surface).
- Simulator/native (mobile) e2e testing.
- **Cloud execution** (machine-off, always-on) — the biggest "availability"
  unlock; today work only progresses while the app is open.
- Multi-repo / monorepo.

---

## 3. The elephant: it's not actually a desktop app yet

The PRD's architecture is **Electron shell + Bun orchestrator process over IPC**.
What exists is the **Bun orchestrator + a browser-served UI** (`server.ts` serving
`index.html`). There is **no Electron shell, no IPC bridge, no packaging**. To be
"Freebuff Desktop" rather than "a localhost web app", we need:

- **[P0] Electron (or Tauri) shell** that boots the Bun orchestrator as a managed
  child process and loads the renderer; native window, menu, lifecycle.
- **[P0] IPC** (or keep the local HTTP+SSE, but authenticated and on a random port).
- **[P0] Packaging & distribution**: signed builds, notarization (macOS), installers
  per OS, and **auto-update**. None of this exists.
- **[P1] Native file/folder pickers** for "open a project" (today the project is a
  hardcoded env var — see below).
- **[P1] OS keychain** for the auth token.
- Decision worth making early: **Electron vs Tauri vs a thin native shell**. The
  renderer is plain vanilla JS today (no build step) — cheap to keep, but a real
  product probably wants a component framework (the `/simplify` review flagged the
  UI is one growing `index.html` with ad-hoc overlays/views; see §5).

---

## 4. The other elephant: single-project only

`Engine` is hardcoded to one project (one repo, one SQLite db, `projectId:'project'`,
`TARGET_REPO` env). There is **no way to open, switch, or manage projects in the
app** — the PRD wants "one window = one project, multiple windows." Today you set an
env var and restart. For a real product:

- **[P1] "Open project" / project picker** (folder/repo), recent projects,
  attach-by-clone or attach-local.
- **[P1] Multi-project**: either multiple windows each with their own engine, or an
  engine registry keyed by project. The single shared daily budget across windows
  (per account) needs plumbing.
- This blocks a lot: onboarding, the "manage several projects" story, and demoing.

---

## 5. Architecture / technical debt

From the `/simplify` review + building it:

- **[P1] No onboarding/setup pass (§6.4).** The PRD's first-run flow — clone, infer
  build/dev/test commands, bootstrap `product.md`/`technical.md` from the code, seed
  role docs + `priorities.md` for the human — **doesn't exist**. `runConfig` is set
  by hand. Bad run-config quietly makes the test stage weaker. This is high-value:
  it's the first thing a new user hits.
- **[P2] UI is one growing `index.html` with ad-hoc patterns.** Three different
  overlay mechanisms (toasts, fullscreen, help), a `view` switch with 4 modes, and
  hand-rolled DOM string-building. Fine for a prototype; for a product it wants a
  real component model and a single overlay/route/view abstraction. Full re-render
  on every SSE event is simple but won't scale to large boards.
- **[P2] Server routes are hand-rolled** if/else + regex. Add a tiny router + an
  error boundary + request logging before it grows.
- **[P2] Conflict handling is prompt-engineered, not structural.** We tell the
  orchestrator to make linear chains to avoid same-file conflicts. A deeper fix is
  scheduler-side file-conflict detection (analyze which files tasks touch) so the
  agent doesn't have to reason about git, and tasks could parallelize safely when
  they touch different files.
- **[P2] Test coverage gaps.** Core is well-tested and the testers are unit-tested,
  but the **engine control loop** (admission, approveAndMerge, requestChanges, the
  conflict/retry path) and the **test-stage planner** have no unit tests — they're
  covered only by manual/e2e runs. The sibling-merge corruption bug and the
  workingDiff-skip bug both shipped and were caught by hand, not tests.
- **[P3] `now()` uses wall-clock** (fixed) but there's no ordering tiebreak; rapid
  task creation in the same ms relies on insert order.

---

## 6. Production-readiness checklist (the unsexy but essential)

- **[P0] Error handling & resilience.** Graceful handling of: SDK errors, git
  failures, network loss, a crashed/killed pipeline, orphaned worktrees on restart,
  a corrupt DB. Today many of these throw and strand a task.
- **[P0] Observability / telemetry (§20).** The PRD specifies a full event funnel on
  the existing Axiom pipeline (`desktop.*` events). **None are emitted.** Without
  them we can't measure the north-star (merged PRs), approval-without-edits, Scout
  productivity, or operational health. Plus crash reporting.
- **[P0] Crash recovery / restart hygiene.** On launch: reconcile DB state vs actual
  worktrees/branches, resume or clean up interrupted tasks, prune orphaned
  worktrees, handle a half-merged state.
- **[P1] Performance at scale.** Full UI re-render, SSE fan-out, N tasks, artifact
  blob growth, `listTasks` shape. Fine at 10 tasks; profile at 200.
- **[P1] Security / sandboxing.** Agents run the project's build/test commands on
  the host with no sandbox (documented CLI trust model, but a real concern for a
  product people run on their machines, especially with Scout generating work
  autonomously). At minimum: clear consent, allow/deny command policies, maybe an
  opt-in container/VM sandbox.
- **[P1] Cost controls.** Per-account daily budget that actually enforces; visibility
  into spend; guardrails against a runaway Scout draining budget on low-value churn
  (the §17 sprawl risk).
- **[P1] Data portability & backup.** The project is "portable with its repo" in
  theory (SQLite under `.freebuff/`), but no export/import, no backup, no sync.
- **[P2] Accessibility.** Keyboard nav is partial; no ARIA/screen-reader pass; color-
  only status encoding.
- **[P2] Internationalization** — later, but the strings are inline.

---

## 7. Product / UX gaps (what makes people *want* it)

The honest "would I use this daily" gaps, beyond the roadmap:

- **[P0] Quality-gate TRUST is everything.** The north-star is "approve without
  edits." If surfaced PRs are wrong too often, users re-review everything and the
  value collapses (§17). M1 made testing real (huge), but we need to *measure*
  approval-without-edits and keep it high. Stretch the gate: parallel attempts +
  synthesis (M3), perspective-diverse review, stronger model for review/test.
- **[P1] Model quality ceiling.** Everything runs on `deepseek-v4-flash` (cheap,
  fast, free). For genuinely review-ready PRs on non-trivial work, consider model
  tiering — flash for implement, a stronger model for review/test/synthesis — or a
  paid tier. Single cheap model is great for cost, risky for trust.
- **[P1] Latency / throughput.** A task takes ~2–3 min through the full gate now
  (browser test added time). Deep linear chains serialize → slow. Want: smarter
  parallelism (different-file tasks run concurrently), a **merge queue / "approve
  through a chain"** action (deep chains are tedious to approve one-by-one), and
  optimistic/streaming progress.
- **[P1] The "compounding" promise is undelivered** (Scout + learning, §2 above).
  This is the differentiation vs Conductor/Codex Desktop. Until it's real, this is
  "another parallel-agent app with good testing."
- **[P2] Real GitHub experience.** Actual PRs people review on GitHub, CI status,
  inline comments synced back, branch protection. Local-merge mode is a demo crutch.
- **[P2] Richer review surface.** File tree, inline diff comments, "request changes"
  on a specific line, open-in-editor (VS Code), syntax-highlighted diffs.
- **[P2] Task ergonomics.** Edit/split/merge tasks, reorder, manual dependency
  editing in the UI (today via chat), a DAG/graph view (PRD says "later"), bulk
  actions.
- **[P2] Bring-your-own-work.** Import GitHub issues / Linear tickets as tasks;
  templates / starter projects.
- **[P2] Cost & time estimates** per task before running; a project health dashboard
  surfacing the §18 metrics.

---

## 8. Suggestions / ideas (creative, beyond the PRD)

- **Auto-rebase-and-retry on sibling conflict.** The recovery is deterministic
  (reset onto main, re-implement) — offer a one-click or even automatic re-run so a
  pile of parallel single-file tasks "just works" instead of grinding approve→block
  →retry. (Keep it human-gated by default; make it one action.)
- **"Plan preview" before executing.** Show the proposed task graph + cost/time
  estimate and let the human tweak before the machine runs — reduces wasted runs.
- **Diff-aware test selection / caching.** Don't re-run the full browser/tmux suite
  if nothing relevant changed; cache evidence.
- **Scout as a reviewable backlog, not auto-spawn.** Surface Scout proposals as
  one-click chips ("Add X? Add Y?") so it compounds without sprawl or surprise.
- **Learning surfaced as suggestions.** When the learning agent wants to change a
  governing doc, show a diff the human can accept/reject — transparency as a feature.
- **Perspective-diverse review panel.** For risky changes, run N reviewers with
  different lenses (correctness/security/perf) and require a majority — cheap with a
  cheap model, big trust gain.
- **Inline "steer" on a running task** (surface `send_guidance` per task), not only
  via the orchestrator chat.
- **Time-travel / undo.** Every merge is a squash commit; offer one-click revert and
  a project timeline.
- **Project health dashboard** — merged-PR throughput, approval-without-edits trend,
  autonomy mix (Scout vs human), budget burn — the §18 metrics, made visible.
- **Editor/IDE bridge** — "open this task's worktree in VS Code", or a VS Code
  extension that mirrors the cockpit.

---

## 9. Suggested sequencing to V1 → shippable

1. **Finish V1 (M2):** Scout + learning loop + governing-doc edit/commit flow.
   This is what the product *is*; everything else is table stakes.
2. **Make it a desktop app:** Electron/Tauri shell + packaging + auto-update +
   "open project" / multi-project. Without this it's not "Desktop".
3. **Onboarding (§6.4):** first-run setup agent (run-config discovery + docs
   bootstrap) — the first thing users hit.
4. **MH hardening:** Freebuff GitHub App, real in-app auth, abuse/cost controls.
5. **Trust & resilience:** telemetry/metrics (measure approval-without-edits),
   stage-level error retries, in-flight cancellation, crash recovery, model tiering
   for review/test.
6. **Then reach (M3):** cloud execution (always-on), parallel attempts + synthesis,
   native notifications, richer GitHub/editor integrations.

**The two things most likely to decide whether people actually use it:**
(a) does the **quality gate earn trust** (approve-without-edits stays high), and
(b) does the **compounding loop visibly make the project better over time**. M1
delivered (a)'s foundation; M2 is the whole of (b). Everything in §3–§6 is what
turns the working loop into a product you can hand to someone who isn't us.
