# @codebuff/freebuff-desktop

Freebuff Desktop — a GitHub-native coding-agent orchestrator. See the design doc /
PRD at [`docs/freebuff-desktop-prd.md`](../docs/freebuff-desktop-prd.md).

## Status: M0 (thin spine)

This package is being built up in layers per the PRD roadmap (§15). The current
layer is the **orchestration core** — the headless engine the Electron UI will sit
on top of:

```
src/core/
  types.ts        — domain model (§14): Project, Task, DependencyEdge, BudgetLedger
  store.ts        — local SQLite persistence under .freebuff/ (bun:sqlite)
  graph.ts        — task-graph queries: unblocked tasks, cycle detection
  scheduler.ts    — FIFO admission under concurrency cap + rolling-24h daily budget
  worktree.ts     — git worktree lifecycle + gh PR helpers (branches from main, §8)
  orchestrator.ts — the §19 tool surface (create_task, add_dependency, ...)
  pipeline.ts     — fixed per-task stage runner (implement→simplify→review→test→pr)
```

The core has no Electron or React dependency and is exercised with `bun test`.

### Architecture note (Electron + Bun)

Electron's main process runs Node, not Bun. To honor the PRD's "Bun main process"
(reuse `sdk/` and `agent-runtime` directly, which export Bun-targeted TS) the app is
structured as **an Electron UI shell + a Bun orchestrator process** it spawns and
talks to over local IPC. This `core/` module is that Bun process's engine; the
Electron shell and the IPC bridge are a later layer in this same package.

## Run

```bash
bun test --cwd freebuff-desktop      # unit tests for the core
bun --cwd freebuff-desktop run typecheck
```
