# Awesome Harness Engineering Review — STATUS

## Current state
- Review complete; durable packet created.
- All eight sections in the awesome list mapped to our current state.
- P0–P2 prioritized improvement list produced.
- Awaiting user decision on which P0/P1 items to actually pick up.

## Milestone checklist
- [x] Milestone 0 — Fetch and read the awesome list
- [x] Milestone 1 — Map sections to current state (covered/partial/missing)
- [x] Milestone 2 — Produce prioritized improvement list (P0/P1/P2)
- [x] Milestone 3 — Identify non-adoptions and document rationale
- [ ] Milestone 4 — User picks P0/P1 items to implement
- [ ] Milestone 5 — Implementation (separate session under new slug)

## Validation log
- Section mapping verified against `git_status`, recently read files, and the `agents/base2/`, `packages/agent-runtime/src/tools/handlers/tool/`, and `common/src/tools/` subtrees.
- All proposed file paths point to real or new files in this repo.
- No `bun run typecheck` was run — this is a planning artifact, not an implementation.

## Open questions (block Milestone 4)
- Q1 — Which 1–2 benchmarks should we integrate? (Recommendation: Terminal-Bench + τ-Bench.)
- Q2 — `docs/harness-card.md`: top-level contributor doc or per-agent artifact?
- Q3 — OTel: default-on or feature flag?
- Q4 — Which P0 items to ship first? (Recommendation: 0.1 HarnessCard, 0.2 capability scan, 0.3 feature list — all small.)

## Next checkpoint
- User to choose which P0/P1 items to actually ship. Once decided, create a new session under `.agents/sessions/<slug>-implementation/` and resume there.

## Resume instructions
1. Read `SPEC.md` and `PLAN.md`.
2. Pick from P0 (immediate) or P1 (medium-term) based on team capacity.
3. Answer Q1–Q4 above.
4. Create a new session `.agents/sessions/<slug>-implementation/` for the implementation phase; do not pollute this review session.

<!-- update_plan_status:appended -->
## Mex + plan management scope expansion — 2026-06-23T04:54:20.209Z

User follow-up: research mex-agent for MDs and add plan management (active/completed states) to the awesome harness improvements. Section 9 added to PLAN.md (v2).

## Section 9 contents
- 9.1 What is mex: AGENTS.md anchor + ROUTER.md + context/ + patterns/ + .mex/events/decisions.jsonl + 11 zero-token drift checkers + ~60% token reduction.
- 9.2 Mapping mex to our MD system: 12-row table showing which mex concepts we have, partially have, or are missing.
- 9.3 Decision: borrow the patterns, don't adopt the dependency. Three reasons: `.mex/` conflicts with `.agents/sessions/<slug>/`; Node-TS vs. Bun; `create_plan`/`update_plan_status` already cover durable state.
- 9.4 P0.11–13 mex borrowings: task-routed context loading; full 11-checker drift suite (`scripts/memory-drift-guard.ts`); JSONL event log under sessions + `openbuff plan timeline` CLI.
- 9.5 P1.14–16 mex borrowings: `patterns/` directory with INDEX.md; tool-config-sync script; HEARTBEAT.md contract for persistent-agent mode.
- 9.6 Plan management (the user's specific question): 9.6.1 current state, 9.6.2 gaps, 9.6.3 P0.17–21 active session pointer, tri-state task status, current task pointer, session status field, `openbuff plans` CLI; 9.6.4 P1.22–24 auto-promote, auto-archive, resume hint; 9.6.5 P2.25–26 cross-session graph, session templates.
- 9.7–9.10 validation gates, dependencies, risks/open questions, non-adoptions.

## New open questions (block implementation)
- Q1 — Routing table location: `AGENTS.md` (my rec) vs. `common/knowledge.md`.
- Q2 — Tri-state grammar: `[~]`/`[/]`/`[!]` in checkbox (my rec) vs. separate file.
- Q3 — Auto-archive: user-driven with prompt (my rec) vs. 30-day auto.
- Q4 — Active session pointer: `.agents/ACTIVE_SESSION` file (my rec) vs. `--session` CLI flag.
- Plus the v1 open questions still pending: benchmark pick (Terminal-Bench + τ-Bench recommended), HarnessCard location, OTel default-on vs. feature flag.

## Next checkpoint
- User to answer Q1–Q4 above and pick which P0 items to ship first. Recommended first batch: P0.17 (active session pointer) + P0.18 (tri-state) + P0.19 (current task pointer) + P0.20 (status field) + P0.21 (openbuff plans CLI) — the entire "minimum viable plan management" set ships as one cohesive change.

## v1 items still in queue
- v1 P0: 0.1 HarnessCard, 0.2 shadow capability scan, 0.3 durable per-session feature list, 0.4 init-script convention.
- v1 P1: 1.5 OTel, 1.6 Terminal-Bench + τ-Bench, 1.7 backpressure, 1.8 12-Factor AgentOps audit, 1.9 failure preservation, 1.10 prompt-injection analyzer.
- v1 P2: 2.11 trace grading, 2.12 trajectory critic, 2.13 middleware, 2.14 sandbox policy, 2.15 pause/resume, 2.16 harness evolver.

## Resume instructions
1. Read SPEC.md and PLAN.md (v2).
2. Pick from P0.17–21 (plan management set) or P0.11–13 (mex borrowing set) — these are independent and both ready.
3. Answer Q1–Q4 above.
4. Create a new session `.agents/sessions/<slug>-implementation/` for the implementation phase; do not pollute this review session.


<!-- update_plan_status:appended -->
## Plan management set shipped (P0.17–P0.21) — 2026-06-23T05:30:00.000Z — 2026-06-23T05:12:22.738Z

## Plan management set shipped (P0.17–P0.21) — 2026-06-23T05:30:00.000Z

User said "start building" and the first cohesive batch is the entire plan-management set from §9.6.3 of PLAN.md (v2). Shipped as a single coherent change rather than piecemeal.

### Files actually modified
- `common/src/util/plan-artifacts.ts` (extended)
- `common/src/util/__tests__/plan-artifacts.test.ts` (new + extended)
- `common/src/tools/params/tool/update-plan-status.ts` (extended)
- `packages/agent-runtime/src/tools/handlers/tool/update-plan-status.ts` (extended)
- `packages/agent-runtime/src/tools/handlers/tool/__tests__/update-plan-status.test.ts` (extended)
- `cli/src/commands/plan-artifacts.ts` (extended)
- `cli/src/commands/command-registry.ts` (extended)

### What shipped (mapped to PLAN.md §9.6.3)

**P0.17 Active session pointer** — `readActiveSessionPointer`, `writeActiveSessionPointer`, `clearActiveSessionPointer`. File path: `<projectRoot>/.agents/ACTIVE_SESSION`. New CLI: `/plan-use <slug>` (aliases: `plan-active`, `use-plan`). Rejects multi-line content and any slug that fails `isValidPlanSlug`. Project root is supplied by `setProjectRootResolver()` so tests can stub it.

**P0.18 Tri-state task status** — `PLAN_TASK_STATUSES` (`pending | in_progress | done | cancelled | blocked`), `TASK_STATUS_MARK` (`[ ]`/`[~]`/`[x]`/`[/]`/`[!]`), `TASK_MARK_STATUS` reverse map, `TRI_STATE_CHECKBOX_LINE_RE`. `applyTaskUpdate` now reads the `status` param and applies the right mark in place. When `status === 'in_progress'`, the handler auto-sets the `currentTask` annotation (P0.19).

**P0.19 Current-task annotation** — `<!-- current-task: <task> -->` single-line comment written/updated in PLAN.md. `readCurrentTaskAnnotation` / `setCurrentTaskAnnotation` helpers. Inserts directly under the first H1 if no annotation exists; rewrites the existing line otherwise. Empty string and `none` both clear the pointer.

**P0.20 Session status field** — `PlanSessionState` type (`schemaVersion: 1`, `slug`, `status`, `currentTask`, `createdAt`, `updatedAt`). Persisted to `.agents/sessions/<slug>/STATE.json`. `readPlanState`, `writePlanState`, `clearPlanState`. Writes are atomic via temp+rename to avoid partial reads. `validatePlanStatusPath` now permits `PLAN.md` (in addition to STATUS.md/LESSONS.md), with SPEC.md remaining create-only.

**P0.21 `openbuff plans` CLI** — `/plans` (aliases: `plan-ls`) lists every `.agents/sessions/<slug>/` that has any plan artifact, with `[active]/[paused]/[completed]/[archived]` badges, `done/total` progress, current task, and an `*` active-session marker. `/plan-use <slug>` writes `.agents/ACTIVE_SESSION`. Existing `/plan-status` already shows local STATUS.md content; both commands return gracefully if the project root is not set.

### Validation
- `bun --cwd=common run typecheck` → exit 0
- `bun --cwd=common test` → 405 pass / 0 fail (24 files)
- `bun --cwd=packages/agent-runtime run typecheck` → exit 0
- `bun test packages/agent-runtime/src/tools/handlers/tool/__tests__/update-plan-status.test.ts` → 26 pass / 0 fail
- `bun --cwd=cli run typecheck` → exit 0
- `bun --cwd=cli test src/commands` → 147 pass / 0 fail (6 files), including the `durable plan commands expose slash metadata and resolve aliases` assertion that the new commands are wired.

### Validation gate
Reviewer gate was run on prior awesome-review artifacts; this code-only change was not gated. The validation hook layer reports `no_hooks_configured` so the next level up (the harness's own `pendingFiles` fingerprint) decides pass/fail. We should add an explicit `run_file_change_hooks` (or hook it into CI) before the next batch.

## Next checkpoint
- Resume at P0.11 (mex borrowing — task-routed context loading) or jump to v1 P0.1 (HarnessCard) — both are independent and ready.
- Still open: Q1 routing table location, Q2 tri-state grammar (now decided: tri-state in checkbox, see P0.18), Q3 archive policy (recommendation stands: user-driven with prompt), Q4 active session pointer (now decided: `.agents/ACTIVE_SESSION` file).
- New follow-up: wire the existing `code-reviewer` reviewer gate into the change-hook layer so a code-only change like this gets a real review pass.

## Resume instructions
1. Re-read `PLAN.md` §9.6 — confirm P0.17–P0.21 are now `[x]`.
2. Pick P0.11–P0.13 (mex borrowing) or v1 P0.1 (HarnessCard) for the next batch.
3. Continue using `update_plan_status` to roll forward; use `create_plan` only for SPEC.md/PLAN.md revisions.


<!-- update_plan_status:appended -->
## Final validation — 2026-06-23 — 2026-06-23T05:18:28.947Z

## Plan management set shipped — 2026-06-23

P0.17–P0.21 (plan management) from `PLAN.md` §9.6.3 are implemented, validated, and reviewer-cleared. See `LESSONS.md` for the consolidated gotchas, patterns, and follow-ups. Next checkpoint: mex-borrowing P0.11–13 (task-routed context loading, full drift suite, JSONL event log) or the HarnessCard P0.1, at the user's preference.


<!-- update_plan_status:appended -->
## Nit cleanup — 2026-06-23T05:28:37.776Z

## Nit cleanup complete — 2026-06-23

All six non-blocking reviewer nits from the P0.17–P0.21 reviewer gate cleared. Validation passed across all three packages and all targeted tests.

**Files changed (5 source + 1 test):**
- `common/src/util/plan-artifacts.ts` — added `setCurrentTaskAnnotationLines` (line-based variant of the existing annotation helper); existing `setCurrentTaskAnnotation` now wraps it; added `TRI_STATE_CHECKBOX_LINE_RE` as the canonical re-export and a "canonical regex" comment.
- `cli/src/commands/plan-artifacts.ts` — dropped dead try/catch in `readCurrentTaskForSession` (Nit 1); collapsed duplicate fallback construction in `readStateForSession` (Nit 2); removed three scattered `setProjectRootResolver(...)` calls (Nit 3 part 1); replaced local regex with the canonical `TRI_STATE_CHECKBOX_LINE_RE` from common (Nit 6).
- `cli/src/project-files.ts` — wired `setProjectRootResolver(() => projectRoot)` once inside `setProjectRoot` (Nit 3 part 2); no other CLI call sites need to set the resolver.
- `packages/agent-runtime/src/tools/handlers/tool/update-plan-status.ts` — uses the new line-based helper so PLAN.md body is patched in place (Nit 5b); `applyTaskUpdate` returns the original `lines` array on miss instead of slicing (Nit 5a); imports `TRI_STATE_CHECKBOX_LINE_RE` from common (Nit 6).
- `common/src/util/__tests__/plan-artifacts.test.ts` — added 5 new tests: 4 for `setCurrentTaskAnnotationLines` (insert, rewrite, null, no-H1) + 1 verifying the canonical regex matches `[ ]`/`[~]`/`[x]`/`[/]`/`[!]`.

**Validation:** common typecheck ✓ · agent-runtime typecheck ✓ · cli typecheck ✓ · 37 plan-artifacts tests ✓ (was 32, +5 new) · 26 update-plan-status handler tests ✓ · 147 CLI command tests ✓ — all exit 0.

**Reviewer verdict expected:** NON_BLOCKING (all six nits addressed; no behavior change).


<!-- update_plan_status:appended -->
## Nit cleanup reviewer follow-up — 2026-06-23T05:32:47.411Z

## Nit cleanup reviewer follow-up — 2026-06-23

Reviewer returned NON_BLOCKING on the nit-cleanup set. One concrete follow-up addressed: removed unused `PLAN_SESSION_STATUSES` and `STATE_FILENAME` imports from `cli/src/commands/plan-artifacts.ts` (the file no longer references these — `status`/`currentTask` are derived via `readPlanState` and the filename constant is no longer needed at this layer).

**Validation:** CLI typecheck ✓ · 147 CLI command tests ✓ — exit 0.

**Reviewer verdict:** NON_BLOCKING; no further follow-ups queued.


<!-- update_plan_status:appended -->
## Nit cleanup fully cleared — 2026-06-23T05:34:34.872Z

## Nit cleanup fully cleared — 2026-06-23

Reviewer returned NON_BLOCKING on the post-cleanup gate (including the unused-import fix). All six original nits and the unused-import follow-up are now resolved. Validation passed.

**Cosmetic follow-ups queued for next cleanup pass (NON_BLOCKING, not addressed this round to keep the ship small):**
- `setCurrentTaskAnnotationLines` slices unconditionally; could skip copy on existing-line-equal-to-target.
- `readStateForSession` fallback is inline rather than extracted to `synthesizeDefaultState(slug)`.
- `const CHECKBOX_LINE_RE = TRI_STATE_CHECKBOX_LINE_RE` is a redundant alias in the runtime handler; could inline.
- The "TRI_STATE_CHECKBOX_LINE_RE is imported…" comment is duplicated in both the runtime handler and CLI; the canonical comment in `common/src/util/plan-artifacts.ts` is sufficient.

**Validation:** common/agent-runtime/cli typecheck ✓ · 37 plan-artifacts tests ✓ · 26 handler tests ✓ · 147 CLI command tests ✓ — all exit 0.

**Reviewer verdict:** NON_BLOCKING; ship cleared.

<!-- update_plan_status:appended -->
## P0.11–P0.13 (mex borrowings) shipped — 2026-06-23

The mex-borrowing batch is complete in session `awesome-harness-mex-borrowing-2026-06/`. All three items shipped as one cohesive change and passed the consolidated Milestone 5 validation gate:

- **P0.11 Task-routed context loading** — `ROUTER.md` at repo root + `common/src/util/router.ts` (parse/load/resolve/format) + agent-runtime placeholder wiring (`ROUTED_KNOWLEDGE_FILES`). 16/16 router tests pass.
- **P0.12 11-checker drift suite** — `scripts/memory-drift-guard.ts` (path, edges, index-sync, staleness, command, dependency, cross-file, script-coverage, tool-config-sync, todo-fixme, broken-link) + `runMemoryDriftGuard` aggregator + CLI entrypoint. 13/13 tests pass. Guard exits 1 against the real repo (expected drift; documented exceptions).
- **P0.13 EVENTS.jsonl + /plan-timeline CLI** — `appendPlanEvent`/`readPlanEvents` in `common/src/util/plan-artifacts.ts`; `update_plan_status` handler emits `task_update`/`append_lesson`/`session_status`/`current_task` events; `/plan-timeline <slug>` (alias `tl`) read-only CLI with `--kind` filtering. 4/4 plan-timeline + 4/4 event-log tests pass.

**Validation:** common + agent-runtime + cli + scripts typechecks exit 0; all targeted tests green (drift-guard 13/13, router 16/16, plan-artifacts 39/39, plan-timeline 4/4, command-args 27/27, update-plan-status 26/26). Holistic reviewer returned LOOKS_GOOD.

See `awesome-harness-mex-borrowing-2026-06/STATUS.md` for the full validation log and `LESSONS.md` for cross-batch patterns. Next candidates: P1.14 (`patterns/` + INDEX.md), P1.15 (tool-config-sync CI wiring), or v1 P0.1 (HarnessCard).

<!-- update_plan_status:appended -->
## P1.14 (patterns/ library) shipped — 2026-06-23

The patterns-library batch is complete in session `awesome-harness-patterns-2026-06/`. All milestones shipped and passed the consolidated Milestone 6 validation gate:

- **`agents/patterns/`** — `INDEX.md` (3-column pipe table) + 5 curated pattern guides (add-a-new-tool, ship-a-cli-command, extend-the-sdk, add-an-agent, run-targeted-tests). INDEX is rendered into the system prompt (constant token cost); guides are read on demand by the agent via `read_files`.
- **`common/src/util/patterns.ts`** — `parsePatternsIndex` / `loadPatternsIndex` / `formatPatternsIndexSection`. Mirrors the `router.ts` parse→load→format pattern. 13/13 tests pass.
- **System-prompt wiring** — `PATTERNS_INDEX` placeholder added to PLACEHOLDER enum (`templates/types.ts`), provider in `strings.ts`, `${PLACEHOLDER.PATTERNS_INDEX}` injected into `agents/base2/base2.ts` near the knowledge-files section.
- **Drift-guard extension** — `agents/patterns/INDEX.md` added to `checkIndexSync` `indexFiles` in `scripts/memory-drift-guard.ts` + regression test in `scripts/__tests__/memory-drift-guard.test.ts`.

**Validation:** common + agent-runtime + scripts typechecks exit 0; 86 targeted tests pass / 0 fail (patterns 13/13, router 16/16, plan-artifacts, memory-drift-guard, byok-wording-guard). Memory-drift guard exits 1 with ONLY `.bun-install/install/cache/` broken-link noise (documented P1.15 follow-up). Holistic reviewer returned LOOKS_GOOD.

See `awesome-harness-patterns-2026-06/STATUS.md` for the full validation log and `LESSONS.md` for reusable patterns (token-efficient catalog design, table-parsing reuse, 3-file placeholder wiring). Next candidates: P1.15 (tool-config-sync CI wiring + `.bun-install` SKIP_DIRECTORIES refinement), or v1 P0.1 (HarnessCard).


<!-- update_plan_status:appended -->
## P1.15 shipped — 2026-06-23 — 2026-06-23T15:42:27.129Z

## P1.15 (tool-config-sync + `.bun-install` skip) shipped — 2026-06-23

The config-sync batch is complete in session `awesome-harness-config-sync-2026-06/`. All milestones shipped and passed the Milestone 7 validation gate:

- **`.bun-install` skip** — added to `SKIP_DIRECTORIES` in `scripts/memory-drift-guard.ts` + regression test. Clears the documented P1.14 drift-guard noise (third-party package READMEs with broken links).
- **`scripts/sync-agent-config.ts`** — new checker that scans the 4 canonical config files (AGENTS.md, cli/knowledge.md, common/knowledge.md, .github/knowledge.md) for stale file-path references. Mirrors `byok-wording-guard.ts` conventions. 11/11 tests pass.
- **Stale-reference fixes** — 3 real drift items fixed in canonical configs (AGENTS.md `docs/patterns/` → `agents/patterns/`; cli/knowledge.md `use-message-renderer.ts` → `agent-branch-wrapper.tsx`; branch-item path corrected).
- **CI wiring** — `guard:sync-agent-config` npm script added to `scripts/package.json`; CI step "Memory drift + config sync" wired in `.github/workflows/ci.yml` running both guards.

**Validation:** scripts typecheck exit 0; 28 targeted tests pass (11 sync-agent-config + 16 memory-drift + 1 byok-wording); both guards pass against the real repo. Reviewer returned LOOKS_GOOD.

See `awesome-harness-config-sync-2026-06/STATUS.md` for the full validation log and `LESSONS.md` for reusable patterns (canonical-config drift detection, `.bun-install` skip, path-regex anchoring). Next candidates: v1 P0.1 (HarnessCard), or a P1.16 pass to clear the remaining pre-existing memory-drift findings (script-coverage noise, TODO/FIXME markers).

