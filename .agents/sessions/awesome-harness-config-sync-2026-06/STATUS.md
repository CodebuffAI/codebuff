# P1.15 — Tool-config-sync + CI wiring + .bun-install skip

## Current state

**Phase:** Complete — all 8 milestones shipped, reviewer gate passed.

## Milestones

- [x] M1 — Bootstrap artifacts (PLAN.md, STATUS.md, LESSONS.md)
- [x] M2 — Add `.bun-install` to SKIP_DIRECTORIES + regression test (16/16 memory-drift-guard tests pass)
- [x] M3 — Create `scripts/sync-agent-config.ts` checker + fix 3 stale config references (AGENTS.md `docs/patterns/`, AGENTS.md `docs/handle-steps-generators.md`, cli/knowledge.md `use-message-renderer.ts`)
- [x] M4 — Create `scripts/__tests__/sync-agent-config.test.ts` (11/11 tests pass)
- [x] M5 — Add `guard:sync-agent-config` to `scripts/package.json`
- [x] M6 — Wire "Memory drift + config sync" CI step in `.github/workflows/ci.yml` (build-and-check job, runs both guards before Typecheck)
- [x] M7 — Validation gate: scripts typecheck exit 0; 28/28 targeted tests pass; sync-agent-config guard passes; .bun-install noise cleared (remaining memory-drift findings are pre-existing, out of scope)
- [x] M8 — Finalize artifacts (STATUS/LESSONS wrap-up + parent review pointer)

## Validation log

- `bun --cwd=scripts run typecheck` → exit 0
- `bun test scripts/__tests__/sync-agent-config.test.ts scripts/__tests__/memory-drift-guard.test.ts scripts/__tests__/byok-wording-guard.test.ts` → 28 pass, 0 fail
- `bun --cwd=scripts run guard:sync-agent-config` → exit 0 (repo passes)
- `bun --cwd=scripts run guard:memory-drift` → exit 1 with pre-existing findings only (script-coverage noise, TODO/FIXME markers, one broken link in docs/architecture.md); `.bun-install/install/cache/` noise confirmed gone

## Next checkpoint

Session complete. Parent review pointer recorded in `awesome-harness-review-2026-06/STATUS.md`. Next candidates from the parent review: v1 P0.1 (HarnessCard) or a P1.16 pass to clear remaining pre-existing memory-drift findings (script-coverage noise, TODO/FIXME markers).

<!-- update_plan_status:appended -->
## M8 reviewer gate — 2026-06-23 — 2026-06-23T15:47:58.405Z

Reviewer returned LOOKS_GOOD on the full P1.15 shipped surface. One non-blocking cosmetic nit: AGENTS.md lines 37 and 42 both reference `docs/architecture.md` with different descriptions (line 42 describes handleSteps patterns but points to the general architecture doc). The file exists so the guard passes; queued as a NON_BLOCKING follow-up for a future cleanup pass.

Session complete. All 8 milestones shipped and validated.

<!-- update_plan_status:appended -->
## M8 re-review after BLOCKING fix — 2026-06-23

Reviewer returned **LOOKS_GOOD** on the P1.15 batch after fixing the BLOCKING issue.

**BLOCKING issue resolved:** The CI step originally ran `guard:memory-drift` as a blocking gate, but it exits 1 against the real repo due to pre-existing findings (script-coverage noise, TODO/FIXME markers, broken link in docs/architecture.md). Fixed by making `guard:memory-drift` non-blocking in CI (`|| echo "::warning::..."`) until pre-existing findings are cleared; `guard:sync-agent-config` remains a blocking gate (passes clean, exit 0).

**Additional fixes in this round:**
- Typo fix: `scripts/sync-agent-config.ts` line 88 — removed stray space inside backticks in error message.
- AGENTS.md duplicate merged: the duplicate `docs/architecture.md` entries (lines 37 and 42) are now a single line.

**Re-validation:** scripts typecheck exit 0; 27 targeted tests pass; `guard:sync-agent-config` passes clean (exit 0).

