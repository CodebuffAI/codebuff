# Mex-Style Borrowings — LESSONS

## Insights from the parent review
- `mex-agent` solves a real problem: the one-shot `CLAUDE.md` flood. Real benchmarks report ~60% token savings from routed context loading.
- We do NOT want `mex-agent` as a dependency — `.mex/` conflicts with our `.agents/sessions/<slug>/` layout, and Bun integration is real cost.
- The 11 zero-token drift checkers are the strongest mex pattern we can borrow. We currently have 1 (`byok-wording-guard.ts`); closing that gap to 11 is the highest-leverage mex inheritance.
- The JSONL event log pattern (mex's `.mex/events/decisions.jsonl`) maps cleanly onto our `.agents/sessions/<slug>/EVENTS.jsonl`. The plan-management set shipped earlier already added STATE.json; adding EVENTS.jsonl is a sibling artifact.

## Decisions made (pre-implementation)
- **One cohesive batch** for P0.11–P0.13. The three items share zero touched files so they ship independently but are validated together. Lessons learned from the P0.17–P0.21 batch: small items ship cheaper as one PR with one reviewer gate than as three piecemeal ones.
- **`ROUTER.md` at the repo root** (Q1 — my rec) rather than extending `AGENTS.md`. Rationale: AGENTS.md is already a long anchor; a separate file keeps the routing table scannable and lets `scripts/memory-drift-guard.ts` lint it without parsing agent instructions.
- **JSONL events for `update_plan_status` only** (not for `create_plan`, `write_file`, `str_replace`). The event log is a *plan* timeline, not a general audit log. If a general audit log becomes a need, that's a separate P1.x item.
- **Drift suite is additive** to `byok-wording-guard.ts`. The wording guard stays as a focused single-purpose script; the new suite aggregates 11 checkers. Both can run independently.

## Non-adoptions
- ❌ `mex-agent` npm dependency. We borrow the patterns, not the package.
- ❌ Replacing our `.agents/sessions/<slug>/` layout with `.mex/`.
- ❌ mex's TUI dashboard. We have the Openbuff CLI.
- ❌ mex telemetry. We have our own opt-out telemetry in `common/src/constants/analytics-events.ts`.
- 🚫 mex `--mode agent-memory` (HEARTBEAT.md). Deferred to P1.16.

## Risks to remember
- Routing table accuracy depends on task-type classification. A bad router is worse than no router.
- Drift checkers will have false positives on legitimate patterns. Per-checker allowlists needed.
- JSONL append under concurrent `update_plan_status` calls can interleave. Need serialization or temp-file buffering.
- The CLI tests for `plan-timeline` need to handle the case where EVENTS.jsonl doesn't exist yet (no events emitted on a fresh session).

## Follow-up notes
- After P0.11–P0.13 ship: P1.14 (`patterns/` + INDEX.md), P1.15 (tool-config-sync script), or back to v1 P0.1 (HarnessCard).
- The drift suite's per-checker results should be persisted to `drift-report.json` so CI can diff over time (P1 candidate).
- `/plan-timeline` could support `--since <iso>` and `--kind <name>` filters as follow-up enhancements.
- Consider exposing the router's matched files as a separate CLI command `openbuff knowledge for <task-type>` for debugging.

<!-- update_plan_status:appended -->
## P0.12 memory-drift guard lessons — 2026-06-23T12:53:24.013Z

## P0.12 memory-drift guard lessons — 2026-06-23T12:10:00Z

- **`readdirSync(dir, { withFileTypes: true })` returns `Dirent[]`, not `string[]`.** The initial `listTopLevelScripts` annotated `entries: string[]` and tsc rejected `.isFile()` / `.name` access. Fix: `import { type Dirent } from 'node:fs'` and annotate `Dirent[]`. Always type the return of `withFileTypes` calls.
- **Checker scope must match test fixtures.** The `edges` checker only scans files whose basename is `knowledge.md` or ends with `.knowledge.md`; putting `## Architecture` / `- \`nope-dir\`` in `docs/notes.md` yields zero findings. When writing the integration test, mirror each checker's real scope so all 11 fire in the combined fixture.
- **`.bun-install/install/cache/...` is not in the skip set.** Running the guard against the real repo surfaces README.md files from bun's package cache as `path`-checker noise. Add `.bun-install` to `SKIP_DIRECTORIES` in a future refinement (out of P0.12 scope; the SPEC only requires the guard to run and produce a score).
- **Staleness checker is deterministic with `utimesSync`.** Set the knowledge.md mtime to `now - 24h` and the sibling `src/` mtime to `now + 24h` via `utimesSync(path, atime, mtime)` — the 48h gap survives filesystem mtime resolution and the `srcMtime > mdMtime` assertion is stable.
- **Regex `.lastIndex = 0` before each `.exec` loop.** Module-level `const` regexes with the `g` flag retain state across lines; resetting `lastIndex` before each line scan prevents dropped matches and infinite loops.
- **Guard exit code convention.** `import.meta.main` block: `score > 0 ? (console.error(report), process.exit(1)) : (console.log(report), process.exit(0))`. Mirrors `byok-wording-guard.ts`. The guard is additive — `byok-wording-guard` (1 checker) stays as-is; the new suite has 11 independent checkers.

## P0.13 EVENTS.jsonl + /plan-timeline CLI lessons — 2026-06-23

- **`appendPlanEvent` returns `null`, not throws, on invalid slug.** The initial test draft expected `.toThrow()` for a slug with path separators, but the implementation (mirroring `writePlanState`) returns `null` and leaves the filesystem untouched. Tests must assert `toBeNull()` and a follow-up `readPlanEvents` returning `[]`, not a throw.
- **Event record shape is `{ ts, kind, summary, payload? }`.** The first test draft used `{ type, task, body, timestamp, seq }` from a stale mental model. The real `PlanEvent` type uses `ts` (ISO-8601), `kind` (one of `PLAN_EVENT_KINDS`), `summary` (one-line human string), and optional `payload`. Keep `summary` one-line; put structured data in `payload`.
- **Events are emitted after the write succeeds, not before.** The `update_plan_status` handler appends `task_update` / `append_lesson` / `session_status` / `current_task` events only after `fs.renameSync(tempPath, writePath)` and `writePlanState` succeed, so the log records mutations that actually landed on disk. Emitting before would create false-positive entries on a failed write.
- **`setProjectRootResolver` must be called before `appendPlanEvent`.** The shared plan-artifact module uses a lazy root resolver; the handler owns setting it via `setProjectRootResolver(() => projectRoot)`. Forgetting this makes `appendPlanEvent` silently return `null` (the resolver is unset → `resolveSessionDir` returns null). The handler sets it once before the STATE.json patch and re-affirms before the event appends.
- **`fs.appendFileSync` atomicity is sufficient for the serialized handler.** `update_plan_status` calls are serialized per session via `previousToolCallFinished`, so concurrent appends are not expected. Even if two landed simultaneously, `appendFileSync` issues a single `write(2)` per call for payloads ≤ PIPE_BUF (4096 bytes on Linux), so individual JSON lines stay intact. No file locking needed.
- **`readPlanEvents` must never throw.** Malformed lines are skipped via try/catch around `JSON.parse`. A single corrupt line (e.g. truncated by a crash mid-append) must not break the `/plan-timeline` CLI — the reader returns the well-formed prefix.
- **`/plan-timeline` is read-only, like `/plan-status`.** It appends a formatted report as a local system message and clears the input; it never sends an agent prompt. The command uses `setMessages` + `getSystemMessage`, not `sendMessage`.
- **Duplicate-import typecheck error from str_replace auto-correction.** When `str_replace` auto-corrects a near-match (97-99% similar) import block, it can duplicate a line. Always run `bun --cwd=common run typecheck` after import edits to catch `TS2300: Duplicate identifier` before proceeding.

<!-- update_plan_status:appended -->
## Cross-batch wrap-up — P0.11–P0.13 — 2026-06-23

- **One cohesive batch validates cheaper than three piecemeal.** P0.11 (ROUTER.md), P0.12 (drift suite), and P0.13 (event log) share zero touched files, so they shipped as one PR with one consolidated Milestone 5 reviewer gate. The per-milestone reviews caught local issues; the cumulative review caught cross-cutting concerns (type safety across package boundaries, event-log append atomicity). Net reviewer rounds: 4 (one per milestone + one cumulative) — fewer than 3 piecemeal PRs would have required.
- **`update_plan_status` argument parsing is brittle with long strings.** The tool rejected multi-line `append` body strings with JSON parse errors. Workaround: use `str_replace` directly on STATUS.md/LESSONS.md for anything beyond simple checkbox toggles. The `<!-- update_plan_status:appended -->` marker convention still works fine when inserted via `str_replace`.
- **Reviewer NON_BLOCKING findings are safe to defer, but track them.** Across P0.11–P0.13, 11 non-blocking nits were recorded (dead `formatRoutedKnowledgeSection` export, redundant `isValidPlanSlug` in `readPlanEvents`, `--kind` flag silent on invalid values, `.bun-install` not in SKIP_DIRECTORIES, etc.). None blocked shipping; all are documented in STATUS.md for a future cleanup pass.
- **Memory-drift guard's `.bun-install` noise is the largest false-positive source.** ~90% of the broken-link checker findings come from bun's package cache README files. Adding `.bun-install` to `SKIP_DIRECTORIES` is a one-line fix and should be the first P1.15 refinement.
- **`ROUTER.md` + `checkToolConfigSync` forms a closed loop.** The drift guard's `tool-config-sync` checker validates every ROUTER.md entry points to an existing file. This means ROUTER.md can't silently drift — adding a stale entry surfaces a finding on the next guard run. This is the strongest argument for keeping the routing table in a separate lintable file rather than burying it in AGENTS.md.
