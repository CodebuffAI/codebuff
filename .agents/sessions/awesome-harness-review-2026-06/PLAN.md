# Awesome Harness Engineering Review — PLAN (v2)

> v2: added Section 9 (mex-style persistent memory + plan management). Sections 1–8 are unchanged from v1; this file is the durable source of truth from this point forward.

## Sections 1–8 (unchanged summary)

For full per-resource mapping see v1 of this file (or any prior reader). High-level recap:

- **Foundations (Section 2):** All major articles partially or fully applied. Durable plan artifacts, structured reviewer gate, read-before-edit, context-pruner cover the core. Gaps: telemetry, browser self-validation, evaluator design depth.
- **Context/Memory (Section 3):** Cache locality, masking, durable plan state, knowledge.md family, read-before-edit all shipped. Gaps: init scripts, per-session feature lists, context-efficient backpressure, failure preservation.
- **Constraints/Guardrails (Section 4):** Read-before-edit, hooks, reviewer gate, tool-permission filtering. Gaps: declarative sandbox policy, Lurkr-style shadow capability scan, prompt-injection analyzer.
- **Specs/Agent files (Section 5):** AGENTS.md, knowledge.md family, create_plan-driven specs. Gaps: GitHub Spec Kit (non-adoption), 12-Factor / 12-Factor AgentOps partial.
- **Evals/Observability (Section 6):** Existing evals/ folder, structured reviewer verdicts. Gaps: JSONL trace logs, OTel/AgentOps, trace grading, trajectory critics.
- **Benchmarks (Section 7):** Not run today. Recommended: Terminal-Bench + τ-Bench.
- **Runtimes/References (Section 8):** Our own runtime. Non-adoptions: Ralph Wiggum, skills.sh, Uni-CLI, Spec Kit. Gaps: HarnessCard, deepagents-style middleware, HEAAL.

## P0/P1/P2 list (unchanged from v1)

For the 16-item list (P0.1 HarnessCard → P2.16 harness evolver loop) see v1 PLAN.md. Headline items: P0.1 HarnessCard, P0.2 shadow capability scan, P0.3 durable per-session feature list, P0.4 init-script convention, P1.5 OTel, P1.6 Terminal-Bench + τ-Bench, P1.7 backpressure, P1.8 12-Factor AgentOps audit, P1.9 failure preservation, P1.10 prompt-injection analyzer.

## 9. Mex-style persistent memory + plan management (addendum, 2026-06-23)

Added in response to follow-up: can `mex-agent` (https://github.com/mex-memory/mex) help with our MDs, and how do we manage plans (active/completed states) for the plan executor?

### 9.1 What is mex?

`mex-agent` (npm package; CLI `mex` or `npx mex-agent`) is a "persistent project memory for AI coding agents" tool. It scaffolds a `.mex/` directory:

- `AGENTS.md` / `CLAUDE.md` — tiny auto-loaded anchor
- `ROUTER.md` — task-routing table so the agent loads only relevant context
- `context/` — architecture, stack, setup, decisions, conventions
- `patterns/` — reusable task guides with `INDEX.md`
- `.mex/events/decisions.jsonl` — append-only event log via `mex log`

It ships **11 zero-token drift checkers**: `path`, `edges`, `index-sync`, `staleness`, `command`, `dependency`, `cross-file`, `script-coverage`, `tool-config-sync`, `todo-fixme`, `broken-link`. CLI: `mex check` / `mex sync` / `mex log` / `mex timeline` / `mex heartbeat` / `mex init` / `mex watch` / `mex setup` / `mex doctor`. Reports ~60% token reduction per session in real measurements (Agrow, OpenClaw homelab benchmarks).

### 9.2 Mapping mex to our MD system

| Mex concept | Our equivalent | Gap |
|---|---|---|
| `AGENTS.md` / `CLAUDE.md` anchor | `AGENTS.md` (root) | Same; ours is also a one-shot dump — no router |
| `ROUTER.md` | ❌ none | No task-routed context loading |
| `context/` (arch/stack/setup/decisions/conventions) | `common/knowledge.md`, `cli/knowledge.md`, `.github/knowledge.md`, `packages/.../schema.knowledge.md` | Files exist but are flat, not routed |
| `patterns/` with `INDEX.md` | ❌ none | No pattern library |
| `.mex/events/decisions.jsonl` | `update_plan_status` appends to `LESSONS.md` | Same idea but text-based not JSONL; no timeline query |
| `mex check` (11 checkers) | `scripts/byok-wording-guard.ts` (1 checker) | Big gap — 10 missing checkers |
| `mex sync` | ❌ none | No drift-repair loop |
| `mex heartbeat` | ❌ none | No persistent-agent mode |
| `mex log` / `mex timeline` | `update_plan_status` | No structured queryable timeline |
| `mex init` | `mex setup` / onboarding prompt | Different intent; ours is interactive |
| Tool-config-sync | ❌ none | `AGENTS.md` and `knowledge.md` files drift independently |
| `--mode agent-memory` (HEARTBEAT.md) | ❌ none | No contract for OpenClaw-style homelab agents |

### 9.3 Decision: borrow the patterns, don't adopt the dependency

We do NOT recommend depending on `mex-agent`. Reasons:
- It owns its own scaffold (`.mex/`) which conflicts with our `.agents/sessions/<slug>/` durable-artifact layout.
- TypeScript-Node-only; our CLI is Bun; integration cost is real.
- Our `create_plan` / `update_plan_status` already cover the durable-state need.

We DO recommend borrowing the *patterns* mex pioneered: routing table, drift checkers, JSONL event log, pattern library, tool-config-sync.

### 9.4 P0 — routing + drift + event log (mex borrowings)

11. **Task-routed context loading** — add a `ROUTER.md` (or extend `AGENTS.md`) that maps task type → relevant `knowledge.md` / spec file. Wire into `getProjectFileTreePrompt` / `knowledgeFilesPrompt` in `packages/agent-runtime/src/system-prompt/prompts.ts`. Expected win: 40–60% token reduction. *Where:* `AGENTS.md`, `packages/agent-runtime/src/system-prompt/prompts.ts`. *Effort:* M.

12. **Extend `byok-wording-guard.ts` to a full drift suite** — add the 10 missing mex checkers as `scripts/memory-drift-guard.ts`: `path`, `edges`, `index-sync`, `staleness`, `command`, `dependency`, `cross-file`, `script-coverage`, `tool-config-sync`, `todo-fixme`, `broken-link`. Output a `drift score` like mex. *Where:* new `scripts/memory-drift-guard.ts` + `scripts/__tests__/memory-drift-guard.test.ts`. *Effort:* M.

13. **JSONL event log under sessions** — add `.agents/sessions/<slug>/EVENTS.jsonl` appended by `update_plan_status` and other state-mutating tools. CLI: `openbuff plan timeline <slug>` mirrors `mex timeline`. *Where:* `common/src/util/plan-artifacts.ts` (extend with `EVENTS.jsonl`), new `cli/src/commands/plan-timeline.ts`. *Effort:* M.

### 9.5 P1 — patterns + sync + heartbeat (mex borrowings)

14. **`patterns/` directory with `INDEX.md`** — curated library of reusable task guides (e.g., "add a new tool", "ship a CLI command", "extend the SDK"). Wire `query_index` / `read_subtree` to surface relevant patterns by task type. *Where:* new `agents/patterns/`, `packages/indexer/`. *Effort:* M.

15. **Tool-config-sync** — `scripts/sync-agent-config.ts` detects when `AGENTS.md`, `common/knowledge.md`, `cli/knowledge.md`, `.github/knowledge.md` disagree and emits a sync prompt. Mirrors mex's `tool-config-sync` checker. *Where:* new `scripts/sync-agent-config.ts`. *Effort:* S.

16. **HEARTBEAT.md contract for persistent-agent mode** — opt-in scaffold for OpenClaw-style homelab agents needing a long-lived heartbeat. Mirrors mex's `--mode agent-memory`. *Where:* new `common/src/templates/heartbeat/` + `agents/heartbeat/`. *Effort:* M.

### 9.6 Plan management: active / completed states

User follow-up: how do we manage our plans? Set what is active, what is completed? For the plan executor mostly.

#### 9.6.1 Current state

- `create_plan` writes SPEC/PLAN/STATUS/LESSONS under `.agents/sessions/<slug>/`.
- `update_plan_status` toggles `- [ ]` ↔ `- [x]` and appends lessons.
- `base2-execute-plan` (extends `base2` with `{ executePlan: true }`) is the executor.
- `listPlanSessions` returns sessions sorted by mtime, no status field.
- `workflowTodo` in `agents/base2/base2.ts` tracks active work in-message but is not durable.

#### 9.6.2 Gaps

- ❌ No "active session" concept — multiple sessions on disk, no pointer to which is being executed.
- ❌ No tri-state task status (pending / in_progress / done). Only binary `[ ]` / `[x]`.
- ❌ No "currently active task" pointer in PLAN.md — the executor doesn't know which item to work on next.
- ❌ No session status field (active / paused / completed / archived).
- ❌ No cleanup / archive mechanism — old completed sessions stay on disk.
- ❌ No `openbuff plans` CLI listing sessions with status.
- ❌ `update_plan_status` only edits STATUS.md / LESSONS.md; can't mark PLAN.md tasks in_progress.

#### 9.6.3 P0 — minimum viable plan management

17. **Active session pointer** — `.agents/ACTIVE_SESSION` file containing the slug of the current session. Updated by `create_plan` (new session → set active) and by an explicit `openbuff plan use <slug>` CLI command. Read by `base2-execute-plan` to scope the system prompt. *Where:* new `.agents/ACTIVE_SESSION` convention; `agents/base2/base2.ts` reads it; new `cli/src/commands/plan-use.ts`. *Effort:* S.

18. **Tri-state task status** — extend checklist grammar to `- [ ]` (pending), `- [~]` (in_progress), `- [x]` (done). Update `update_plan_status` to accept `in_progress: true` and toggle `[~]`. Add `[/]` (cancelled) and `[!]` (blocked) for completeness. *Where:* `packages/agent-runtime/src/tools/handlers/tool/update-plan-status.ts`, `common/src/util/plan-artifacts.ts`. *Effort:* S.

19. **Current task pointer in PLAN.md** — `<!-- current-task: TASK-3 -->` annotation near the top of PLAN.md. `update_plan_status` updates it when a task transitions to in_progress. Executor reads it to know what to work on. *Where:* `common/src/util/plan-artifacts.ts` parser, `agents/base2/base2-execute-plan.ts`. *Effort:* S.

20. **Session status field** — sibling `.agents/sessions/<slug>/STATE.json` containing `{ status: "active" | "paused" | "completed" | "archived", currentTask: string | null, updatedAt: ISO8601 }`. `update_plan_status` transitions the status. `listPlanSessions` returns it. *Where:* `common/src/util/plan-artifacts.ts`, `cli/src/commands/plan-artifacts.ts`. *Effort:* S.

21. **`openbuff plans` CLI command** — list sessions with `[active]`, `[paused]`, `[completed]`, `[archived]` badges, last-updated timestamp, progress (x/y tasks done), current task. Mirrors `listPlanSessions` but with a status column. *Where:* new `cli/src/commands/plan-list.ts` (or extend `plan-artifacts.ts`). *Effort:* S.

#### 9.6.4 P1 — auto-progress + cleanup

22. **Auto-promote task to in_progress** — when the executor calls an edit tool, infer the active task from the file path and auto-update `<!-- current-task: ... -->`. *Where:* `agents/base2/base2-execute-plan.ts`. *Effort:* M.

23. **Auto-archive completed sessions** — when all tasks in a session are `[x]`, prompt the user to mark it `completed`; after 30 days in `completed`, auto-archive to `.agents/sessions/_archive/`. *Where:* new `cli/src/commands/plan-archive.ts`. *Effort:* M.

24. **Resume hint from `update_plan_status`** — when re-opening a session, the `update_plan_status` reply should include "Resuming from TASK-3 (in_progress)" so the executor and user have a clear handoff. *Where:* `packages/agent-runtime/src/tools/handlers/tool/update-plan-status.ts`. *Effort:* S.

#### 9.6.5 P2 — multi-session coordination

25. **Cross-session task graph** — let a PLAN.md reference tasks in other sessions via `[slug:TASK-id]`. Enables dependencies between plans. *Where:* `common/src/util/plan-artifacts.ts`, `agents/base2/base2-execute-plan.ts`. *Effort:* L.

26. **Session templates** — `create_plan --template <name>`; template defines initial structure of PLAN.md / STATUS.md. *Where:* `common/src/util/plan-artifacts.ts`. *Effort:* M.

### 9.7 Updated validation gates

- **P0 items (11–13, 17–21):** unit test for the new primitive; `bun run typecheck`; `bun run --cwd=cli test`; `bun run --cwd=scripts guard:memory-drift`.
- **P1 items (14–16, 22–24):** integration test + one benchmark run.
- **P2 items (25–26):** design doc + proof-of-concept.

### 9.8 Updated dependencies

- P0.11 (routing) is independent.
- P0.12 (drift suite) extends the existing `scripts/byok-wording-guard.ts` pattern.
- P0.13 (event log) extends `common/src/util/plan-artifacts.ts`.
- P0.17 (active session pointer) depends on P0.20 (status field).
- P0.18 (tri-state) is independent.
- P0.19 (current task pointer) depends on P0.18.
- P0.21 (`openbuff plans` CLI) depends on P0.20.
- P1.x (patterns, sync, heartbeat) all depend on P0.12 (drift suite) for enforcement.
- P2.x all depend on P0/P1.

### 9.9 Risks / open questions

- **R1:** Routing table effectiveness depends on good task classification. Start minimal, measure.
- **R2:** Drift checkers have false positives. mex's denylist patterns and ours will need tuning per project.
- **R3:** Active session pointer is a single global file; multi-agent scenarios need a per-agent or per-run pointer. Defer.
- **Q1:** Should the routing table live in `AGENTS.md` (root) or `common/knowledge.md`? My recommendation: `AGENTS.md` since it's already agent-loaded.
- **Q2:** Should the tri-state grammar use `[~]` (in_progress) / `[/]` (cancelled) / `[!]` (blocked), or simpler `[ ]` / `[x]` plus a separate file? My recommendation: tri-state in the checkbox grammar — more discoverable.
- **Q3:** Auto-archive after 30 days? Or user-driven? My recommendation: user-driven with a prompt; don't surprise users.
- **Q4:** Should the active session pointer be `.agents/ACTIVE_SESSION` (file) or a CLI command flag (`openbuff --session <slug>`)? My recommendation: file for persistence + CLI for override.

### 9.10 Non-adoptions (mex-related)

- ❌ Adopting `mex-agent` as a direct dependency. We borrow the patterns instead.
- ❌ Replacing our `create_plan` / `update_plan_status` with mex's `.mex/events/decisions.jsonl`. We extend, not replace.
- 🚫 The mex TUI dashboard — we have our own CLI UX.
- 🚫 mex telemetry — we have our own opt-out telemetry in `common/src/constants/analytics-events.ts`.

## v1 16-item list (P0–P2) — reference

P0: 0.1 HarnessCard, 0.2 Lurkr-style capability scan, 0.3 durable per-session feature list, 0.4 init-script convention.
P1: 1.5 OTel GenAI exporter, 1.6 Terminal-Bench + τ-Bench, 1.7 backpressure, 1.8 12-Factor AgentOps audit, 1.9 failure preservation, 1.10 prompt-injection analyzer.
P2: 2.11 trace grading, 2.12 trajectory critic, 2.13 middleware chain, 2.14 sandbox policy, 2.15 pause/resume, 2.16 harness evolver.

## Updated 26-item list (after v2) — at-a-glance

P0: 0.1, 0.2, 0.3, 0.4, 0.11, 0.12, 0.13, 0.17, 0.18, 0.19, 0.20, 0.21.
P1: 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.14, 1.15, 1.16, 1.22, 1.23, 1.24.
P2: 2.11, 2.12, 2.13, 2.14, 2.15, 2.16, 2.25, 2.26.
