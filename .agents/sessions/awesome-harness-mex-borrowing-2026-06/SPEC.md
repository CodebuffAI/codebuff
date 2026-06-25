# Mex-Style Borrowings — SPEC (P0.11–P0.13)

## Overview
Borrow the three highest-leverage patterns from `mex-agent` (https://github.com/mex-memory/mex) without adopting the dependency. Ship them as additive changes to our existing harness: (1) a task-routed context loader, (2) an 11-checker memory-drift guard suite, and (3) a structured JSONL event log under plan sessions.

## Goals
- Reduce per-session token usage by routing the agent to the right `knowledge.md` files for the current task type rather than dumping everything.
- Add a zero-token drift-check suite so memory/knowledge files stay in sync with the codebase that consumes them.
- Give the plan executor (and humans) a queryable timeline of what changed in a plan session, instead of relying on `LESSONS.md` prose diffs.

## Non-Goals
- Adopt `mex-agent` as a direct npm dependency.
- Reimplement `mex check`/`mex sync`/`mex heartbeat` verbatim — borrow the patterns, fit them to our layout (`.agents/sessions/<slug>/`).
- Replace `update_plan_status` or `create_plan` with mex's `.mex/events/decisions.jsonl`. We *extend* with `EVENTS.jsonl` and keep `LESSONS.md` as the human-readable companion.
- Ship the P1 items (P1.14 patterns directory, P1.15 tool-config-sync, P1.16 HEARTBEAT.md) — those come after P0.11–13 land and we have enforcement.

## Requirements

### P0.11 — Task-routed context loading
- New `ROUTER.md` at the project root (alongside `AGENTS.md`).
- Format: a small table mapping task type (e.g. `cli-command`, `tool-handler`, `provider-config`, `plan-artifact`, `db-migration`) to a list of relevant files/dirs to load.
- `packages/agent-runtime/src/system-prompt/prompts.ts` (or the equivalent knowledge-file inclusion site) reads the router and appends only the matched knowledge files to the system prompt.
- If `ROUTER.md` is missing, fall back to today's behavior (load all knowledge.md files) with a single warning log.
- Token-savings target: 40–60% of the current per-task knowledge.md payload.

### P0.12 — Memory-drift guard suite (`scripts/memory-drift-guard.ts`)
- Eleven checkers, in order: `path`, `edges`, `index-sync`, `staleness`, `command`, `dependency`, `cross-file`, `script-coverage`, `tool-config-sync`, `todo-fixme`, `broken-link`.
- Output: a `drift score` (count of findings) and a per-checker breakdown. Exit 0 if score is 0, exit 1 otherwise.
- The existing `byok-wording-guard.ts` (1 checker) stays as-is; the new suite is additive.
- `bun run --cwd=scripts guard:memory-drift` runs the suite.
- Covered by `scripts/__tests__/memory-drift-guard.test.ts` with at least one assertion per checker (smoke-level — full corpus testing comes in P1.x).

### P0.13 — JSONL event log + `openbuff plan timeline` CLI
- `common/src/util/plan-artifacts.ts` adds `EVENTS.jsonl` helpers: `appendPlanEvent(slug, event)` and `readPlanEvents(slug, opts)`.
- `update_plan_status` and any future state-mutating plan tool append a single line per call to `EVENTS.jsonl`. Atomic via append (single-line JSON per call).
- New CLI command `openbuff plan timeline <slug>` (short alias `openbuff plan tl`) renders the timeline: timestamped events with a one-line summary each.
- `/plan-timeline` slash alias wired into `cli/src/commands/command-registry.ts`.
- Backward-compatible: sessions without `EVENTS.jsonl` render an empty timeline with a hint to start using `update_plan_status`.

## Acceptance Criteria
- `ROUTER.md` exists at the repo root and contains a task-type table covering at least 5 task types present in our codebase.
- `bun --cwd=common run typecheck`, `bun --cwd=packages/agent-runtime run typecheck`, `bun --cwd=cli run typecheck`, `bun --cwd=scripts run typecheck` all exit 0.
- `bun run --cwd=scripts guard:memory-drift` exits 0 against the current codebase (or returns a non-zero drift score with documented exceptions).
- `bun test scripts/__tests__/memory-drift-guard.test.ts` passes with ≥11 assertions (one per checker).
- `bun test common/src/util/__tests__/plan-artifacts.test.ts` passes with new event-log tests.
- `bun --cwd=cli test src/commands` passes including a new test for `openbuff plan timeline`.
- Manual smoke: `bun --cwd=cli run dev` → `/plans` shows the existing sessions, `/plan-timeline <slug>` renders the events emitted by prior `update_plan_status` calls.

## Relevant files
- New: `ROUTER.md` (root), `scripts/memory-drift-guard.ts`, `scripts/__tests__/memory-drift-guard.test.ts`, `cli/src/commands/plan-timeline.ts`.
- Modified: `packages/agent-runtime/src/system-prompt/prompts.ts` (or equivalent knowledge-inclusion site), `common/src/util/plan-artifacts.ts` (event-log helpers), `common/src/tools/params/tool/update-plan-status.ts` + `packages/agent-runtime/src/tools/handlers/tool/update-plan-status.ts` (append event), `cli/src/commands/command-registry.ts` (wire `/plan-timeline` slash command), `scripts/package.json` (`guard:memory-drift` script).
- Reference patterns: `scripts/byok-wording-guard.ts`, `cli/src/commands/plan-artifacts.ts`, `agents/base2/base2.ts`.