# Mex-Style Borrowings — PLAN (P0.11–P0.13)

> Inherits from `awesome-harness-review-2026-06/PLAN.md` §9.4 (mex borrowings). This file is the implementation source of truth for that section.

## Goals
- P0.11 Task-routed context loading (ROUTER.md)
- P0.12 11-checker memory-drift guard suite (`scripts/memory-drift-guard.ts`)
- P0.13 JSONL event log under plan sessions + `openbuff plan timeline` CLI

## Milestones

### Milestone 1 — Bootstrap (S)
- Create session dir `.agents/sessions/awesome-harness-mex-borrowing-2026-06/` with SPEC/PLAN/STATUS/LESSONS.
- Add STATUS.md entry "Bootstrap complete, beginning P0.11".

### Milestone 2 — P0.11 ROUTER.md + agent-runtime wiring (M)
- **2a.** Read `packages/agent-runtime/src/system-prompt/prompts.ts` to find where `knowledgeFilesPrompt` / `getProjectFileTreePrompt` are constructed.
- **2b.** Decide on task-type taxonomy (5+ types): `cli-command`, `tool-handler`, `provider-config`, `plan-artifact`, `db-migration`, `sdk-public-api`. Confirm by reading `agents/base2/base2.ts` for how task type is communicated today.
- **2c.** Author `ROUTER.md` at repo root with a small table: task type → knowledge files / spec files / patterns.
- **2d.** Wire a `loadRoutedKnowledge(taskType, projectRoot)` helper that reads `ROUTER.md`, returns the matched file paths, and is consumed by the agent-runtime knowledge prompt.
- **2e.** Add tests: `common/src/util/__tests__/router.test.ts` for the loader; verify fallback when ROUTER.md is missing.

### Milestone 3 — P0.12 drift suite (M)
- **3a.** Re-read `scripts/byok-wording-guard.ts` to mirror its structure (CLI flag parsing, exit codes, JSON-friendly summary).
- **3b.** Implement `scripts/memory-drift-guard.ts` with 11 checker functions and a `runMemoryDriftGuard(cwd)` entrypoint.
- **3c.** Each checker returns `{ name, findings: Finding[] }`. Aggregator computes a `drift score = sum(findings.length)` and exit code.
- **3d.** Wire `bun run --cwd=scripts guard:memory-drift` in `scripts/package.json`.
- **3e.** Tests: `scripts/__tests__/memory-drift-guard.test.ts` with at least one assertion per checker using small fixture files in a temp dir.

### Milestone 4 — P0.13 EVENTS.jsonl + timeline CLI (M)
- **4a.** Add `appendPlanEvent(slug, event)` and `readPlanEvents(slug, opts)` to `common/src/util/plan-artifacts.ts`. Event shape: `{ ts: ISO8601, kind: string, summary: string, payload?: unknown }`.
- **4b.** Wire `update_plan_status` handler to call `appendPlanEvent(slug, { kind: 'task_update' | 'session_status' | 'current_task' | 'append_lesson', summary, payload })` once per invocation.
- **4c.** New CLI `cli/src/commands/plan-timeline.ts` exports `registerPlanTimelineCommand()` mirroring the style of `cli/src/commands/plan-artifacts.ts`.
- **4d.** Wire `/plan-timeline <slug>` (alias `tl`) into `cli/src/commands/command-registry.ts`. Long form: `openbuff plan timeline`.
- **4e.** Tests: 4 in `common/src/util/__tests__/plan-artifacts.test.ts` (append, read, missing-file, malformed-line); 2 in `cli/src/commands/__tests__/plan-timeline.test.ts` (empty, populated).

### Milestone 5 — Validation gate
- Run typechecks in parallel across `common`, `packages/agent-runtime`, `cli`, `scripts`.
- Run targeted tests in parallel: `scripts/__tests__/memory-drift-guard.test.ts`, `common/src/util/__tests__/plan-artifacts.test.ts` + `router.test.ts`, `cli/src/commands/__tests__/plan-timeline.test.ts`, full `cli/src/commands` suite.
- Run `bun run --cwd=scripts guard:memory-drift` against current codebase; record exit code + drift score in STATUS.md.
- Run `code-reviewer` on the diff and address any blocking findings before finalizing.

### Milestone 6 — Durable artifacts + resume instructions
- Update STATUS.md with final state (shipped / pending / blocked).
- Update LESSONS.md with reusable patterns + gotchas discovered during execution.
- Update parent `awesome-harness-review-2026-06/STATUS.md` with a "P0.11–13 shipped" pointer.
- Print next-checkpoint recommendations (P1.14 patterns/INDEX.md, P1.15 tool-config-sync, or back to v1 P0.1 HarnessCard).

## Dependencies / ordering
- P0.11 (ROUTER.md) is independent.
- P0.12 (drift suite) is independent — extends the static-guard pattern but does not depend on P0.11.
- P0.13 (event log) extends `common/src/util/plan-artifacts.ts`; it depends on the P0.20 STATE.json layout shipped in the previous batch.
- All three can ship in one cohesive batch because their touched files don't overlap (`ROUTER.md` + `prompts.ts`; `scripts/memory-drift-guard.ts`; `plan-artifacts.ts` + `update-plan-status.ts` + `plan-timeline.ts`).

## Risks
- **R1.** Routing table effectiveness depends on accurate task-type detection. Start with a small allowlist; measure; expand.
- **R2.** Drift checkers may have false positives on legitimate patterns (e.g. `todo-fixme` will flag legitimate `TODO:` comments). Document allowlist per checker.
- **R3.** JSONL append races: two `update_plan_status` calls in parallel could interleave bytes. Mitigation: serialize via a mutex inside the handler, or use the existing temp+rename atomicity by buffering in a temp file. Document the chosen approach in LESSONS.md.
- **R4.** Routing table in `ROUTER.md` may drift from reality (new files added without updating the router). P0.12 includes a `tool-config-sync` style checker that flags ROUTER.md entries pointing to missing files.

## Open questions
- Q1 — Routing table location: `ROUTER.md` (root, my rec) or extend `AGENTS.md`?
- Q2 — Should `/plan-timeline` support filtering by event kind? (My rec: yes, `--kind task_update`.)
- Q3 — Drift score threshold for CI: fail on score > 0, or warn-only? (My rec: warn-only initially, fail-only on `broken-link` and `dependency`.)