# Freebuff Desktop — Design Doc & PRD

> Status: **Draft for discussion**. "Freebuff Desktop" is the working name.
> Author: design exploration. Nothing here is implemented yet.

## 1. Summary

Freebuff Desktop is a free, GitHub-native coding-agent desktop app. The familiar
shape — multiple parallel agent "threads," each on its own branch/worktree, each
producing a PR — already exists (Conductor, Claude Desktop, Codex Desktop). Our
bet is on **what's next**: pushing automation past "one chat = one change" toward a
**self-driving improvement machine** that the human steers rather than operates.

Three ideas define the product:

1. **An orchestrator, not a chat.** You talk to one main agent. It decomposes
   work into a **dependency graph of tasks**, spawns them, and keeps unblocked
   tasks moving — and it (not just you) is fluent at creating and wiring tasks.
2. **A full change→merge pipeline per task.** Each task runs a fixed, code-backed
   pipeline — implement → simplification → review → automated (incl. end-to-end)
   testing → PR — arriving ready for a human yes/no. Agents *adapt* the pipeline by
   judgment (e.g. skip testing for a typo fix); the user does not author the workflow
   in V1. *(Multiple parallel attempts + synthesis-of-attempts is a later addition —
   M3; V1 runs a single attempt per task.)*
3. **It compounds.** Finishing a task triggers (a) **scouting** that proposes
   the next tasks in line with the project's priorities, and (b) **learning** — a
   "dreaming" pass that reviews the whole trajectory and curates durable guidance
   into a small set of governing markdown docs that advise every future agent.

The human's job shifts from "write the prompt and watch" to "set direction, edit
the governing docs, and approve merges." The machine does the rest and gets better
at it over time. It is **self-driving along the threads you start**: you seed the
work, and it keeps going — decomposing, completing, follow-up-scouting, and
learning — but it does not invent work from a cold start (see §9).

## 2. Goals & Non-Goals

### Goals
- **Maximize merged-PR throughput per unit of human attention.** The headline
  metric: high-quality PRs produced and merged per hour of human time spent.
- **Autonomous task decomposition & generation.** Agents create, wire, and sequence
  tasks (via dependencies) — the human seeds direction, not a task list.
- **A trustworthy automated quality gate.** Simplification, adversarial review, and
  real end-to-end testing so a PR is genuinely "ready," not "ready-looking."
  (Parallel attempts + synthesis are a later quality boost — M3.)
- **A learning loop that visibly improves output** over a project's lifetime.
- **Radical transparency & control.** Every governing doc is a plain markdown file
  the user can read and edit in the app; every agent transcript and test artifact is
  inspectable. No hidden state.
- **Free** for use on the user's own project (consistent with Freebuff's model).

### Non-Goals (first release / V1)
- Not a general chat assistant or a replacement for the CLI/IDE — it's a
  project-driving cockpit.
- Not multi-repo / monorepo-spanning orchestration — one GitHub repo per project
  (you can open several projects in separate windows).
- Not a hosted/cloud agent farm — V1 runs agents on the user's machine against the
  Freebuff backend; cloud execution is a later phase (M3).
- Not GitLab/Bitbucket — GitHub only in V1.
- Not a CI/CD or deploy tool — we stop at "PR merged."
- Not autonomous-merge. A human approves every merge.

## 3. Who It's For

- **Solo builders & small teams** on a GitHub repo who want to run many small
  improvements concurrently without babysitting each one.
- **"Director" mode developers** who'd rather review and steer than type prompts —
  people already using Conductor/Codex-style parallel agents and wanting more
  autonomy and less hand-holding.

Primary job-to-be-done: *"Keep my project improving along the direction I've set,
and only pull me in to approve good work or make real decisions."*

## 4. Differentiation — the thesis

| Existing parallel-agent desktop apps | Freebuff Desktop |
|---|---|
| You create each thread/task by hand | Orchestrator + agents create and wire most tasks; you seed and steer |
| Review is "read the diff yourself" | Built-in simplify + adversarial review + **real e2e testing** before it reaches you (parallel attempts + synthesis: M3) |
| Work stops when the task is done | The Scout proposes the next tasks; the machine keeps going within a budget |
| The agent forgets between tasks | A curated, role-split knowledge base improves every future agent |
| Config is hidden | Governing docs are editable markdown in the sidebar — the knowledge steering every agent is transparent |

The moat is the **compounding loop**: task generation + automated quality gate +
learning, all steered by transparent, user-editable governing documents.

## 5. Core Concepts

- **Project** — a GitHub repo + its governing docs + its task graph + accumulated
  learnings. One window = one project.
- **Task** — one coherent change, sized to a reviewable PR (can be small). Has a
  branch + git worktree, a status, optional **parent tasks** (dependencies), and a
  transcript. The atomic unit of work.
- **Task Graph (DAG)** — tasks plus dependency edges. A task is **unblocked** when
  all parents are **merged** (§8). The scheduler advances unblocked tasks in creation
  order (FIFO) — there is no priority field to manage.
- **Orchestrator** — the agent you chat with. Owns the graph: creates/updates
  tasks, wires dependencies, routes guidance to task agents, and *reads* the
  governing docs (changing a doc goes through a task/PR, not the chat — §19). It does
  not write code itself; it directs.
- **Task Agent** — per-task overseer that runs the task's pipeline and reports up.
- **Pipeline** — the fixed, code-backed sequence of stages each task runs (implement
  → simplify → review → test → PR; see §7). Not a user-authored file in V1 — agents
  adapt it by judgment (skip stages that don't apply to fit the task).
- **Governing Docs** — the small, curated markdown set that advises every agent
  (see §10). Edited by both agents and the human.

## 6. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Freebuff Desktop (Electron)                                       │
│                                                                   │
│  Renderer (React)                Main process (Bun)               │
│  ┌───────────────┐   IPC   ┌──────────────────────────────────┐  │
│  │ Orchestrator  │◄───────►│ Scheduler  (task admission,       │  │
│  │ chat          │         │            concurrency, budget)   │  │
│  │ Task board    │         │ Worktree manager (git)            │  │
│  │ Doc editor    │         │ Task Agent runners (SDK)          │  │
│  │ Diff/PR view  │         │ Governing-doc store               │  │
│  └───────────────┘         │ Test executors (browser / tmux)   │  │
│                            │ git + gh CLI · Freebuff auth      │  │
│                            └─────────────┬────────────────────┘  │
└──────────────────────────────────────────┼───────────────────────┘
                                            │  Freebuff/Codebuff backend
                                            ▼  (agent-runtime, models, SDK)
                                   ┌──────────────────┐
                                   │  GitHub  /  git  │
                                   └──────────────────┘
```

**Tech choices:**
- **Electron shell + React renderer.** Matches the category (Conductor is Electron)
  and gives us native filesystem + child-process control, which a worktree/agent
  orchestrator fundamentally needs.
- **Bun main process.** The orchestration glue runs on Bun, matching the monorepo
  (Bun workspaces) and reusing `sdk/`/`agent-runtime` directly without a second
  runtime.
- **Reuse the existing stack.** Agents run via `sdk/` against the Freebuff
  backend; tool execution rides on `packages/agent-runtime/`; shared types/tools
  from `common/`. The desktop main process is mostly *orchestration glue* — the
  scheduler, the worktree manager, and the test executors — not new agent
  infrastructure.
- **Local-first execution.** Worktrees and processes live on the user's machine and
  the app must be open for work to progress; the heavy model calls go to the
  backend. Cloud execution (always-on, machine-off) is a later phase (M3).

### 6.1 Worktree manager
- One git worktree per active task under a managed directory (e.g.
  `.freebuff/worktrees/<task-id>`), each on branch `freebuff/<task-slug>`.
- Lifecycle: create on task start → agent works in isolation → on completion the
  branch is pushed and a PR opened → worktree retained until merge/abandon, then
  GC'd. (We already run agents in worktrees today; this generalizes it.)
- **Branching:** every task branches from `main`. Dependencies are *ordering only*
  (a task waits until its parents are merged), so branching from `main` already
  includes the parents' work — no branching from an unmerged parent (see §8).

### 6.2 Scheduler
The control loop that makes the machine "always making progress":
- Maintains the queue of **unblocked** tasks in creation order (FIFO).
- Enforces the **concurrency limit** (max simultaneous task agents) and the
  **daily budget** — the primary runaway guards.
- Handles **task admission**: agent-generated tasks land as `proposed` and are
  auto-promoted to `ready`, then run while under budget + concurrency; when a ceiling
  is hit, further work queues until the budget refreshes (rolling 24h) or a running
  task frees a slot (see §9).
- Before surfacing a task, rebases its branch onto latest `main` and re-runs the
  test pass; if it doesn't apply cleanly, marks the task `blocked` for the human
  (no auto-resolve agent — see §8).
- **Concurrency default: ~5 task agents** running at once (user-visible, tunable
  later). The cap is on *tasks*; each task's pipeline still spawns its own
  stage sub-agents.

### 6.3 Authentication
- **GitHub via local `git` + `gh` CLI (V1).** The app shells out to the user's
  local `git` (clone, push `freebuff/*` branches) and the `gh` CLI (open PRs,
  `gh pr merge --squash`), reusing the user's existing `gh` auth. This avoids
  standing up a GitHub App for early/internal use. *(Before shipping to outside
  users, replace this with a **Freebuff GitHub App** — fine-grained `contents` +
  `pull_requests` perms, per-repo install — so we don't depend on each user's local
  `gh` setup. That's a pre-public-launch task, not a day-one one. GitHub-only either
  way.)*
- **Freebuff account.** The user signs in with their existing Freebuff login (same
  backend/auth as the CLI). All model calls are proxied through the Freebuff
  backend, and the **daily budget belongs to that account** (see §13). One account
  can drive multiple project windows; they share the account's daily budget.

### 6.4 Onboarding & first-run setup
When a user adds a repo, a one-time **setup pass** runs before normal work:
1. **Clone** the repo into a managed location and create the `.freebuff/` directory.
2. **Run-config discovery.** A setup agent inspects the repo (package manager,
   framework, scripts, CI config) to infer the **build / dev-server / test
   commands** and writes them to project config. These are what the testing pass
   (§7.1) uses to actually run the app; the user can review and edit them.
3. **Docs bootstrap.** A bootstrap agent reads the codebase and drafts
   `product.md` and `technical.md` from what it finds; the role docs
   (`implementation/review/testing/task-generation/learning.md`) start as short
   templates. `priorities.md` is seeded but flagged for the user to fill in, since
   strategy/intent can't be inferred from code. The user reviews the drafts before
   the machine starts.

### 6.5 Runtime lifecycle
- **App must be open.** V1 is local-first; agents run in the desktop process, so
  work only progresses while the app is running. (Cloud/always-on is M3.)
- **Pause & resume at stage boundaries.** Closing the app **pauses** in-flight
  tasks: the scheduler stops issuing work and records each task's *last completed
  stage*. On next launch, a paused task resumes by **re-running the interrupted
  stage from its start** — there's no mid-stage agent state to serialize, which keeps
  resume simple. (A stage re-run is cheap and idempotent in the worktree.)

## 7. The Per-Task Pipeline (the quality gate)

Every task runs a **fixed, code-backed pipeline**. It is not a user-authored file
in V1 — the stages below are the default, and agents adapt them by judgment (the
Task Agent skips stages that don't apply, e.g. no testing for a doc-typo fix). The
default pipeline:

```
   IMPLEMENT  →  SIMPLIFY  →  REVIEW  →  TEST  →  PR (ready for human)
                                 │         │
                                 └────┬────┘
                          feedback loop (bounded retries)
```

1. **Implement.** A single coding agent makes the change in the task's worktree,
   working from the task description + the governing docs. *(V1 runs one attempt.
   Multiple parallel attempts + a synthesis stage that merges them is an M3 quality
   boost — see Roadmap.)*
2. **Simplification pass.** An agent whose only job is to make the change *smaller
   and cleaner*: reuse existing code, delete the unnecessary, improve design. (We
   already have a `simplify` skill — this is its agentized form.)
3. **Review pass.** Adversarial review for bugs, edge cases, and failure modes.
   Findings are **applied by a fixer agent and re-reviewed**, up to a bounded number
   of retries (default 2); if it still doesn't pass, the task escalates to the human
   with the findings attached rather than looping forever. (Mirrors the
   `code-review` skill.)
4. **Testing pass.** A **test planner** reads the diff + governing "Product" doc to
   decide *what* should be verified, then executes (see §7.1).
5. **PR assembly.** Open/refresh the PR with a written summary, the test evidence,
   the review notes, and links back into the app. The task moves to
   `awaiting-approval`.

**Adapting the pipeline.** The stage set is fixed in code, but agents decide how
much of it to run for a given task: skip the test pass for changes with no runtime
surface, skip simplify for a one-line fix, etc. The fallback when unsure is to run
the full pipeline. (User-authored custom workflows, and the M3 parallel-attempts
fan-out, are later additions — not V1.) The pipeline maps cleanly onto the
multi-agent verify patterns we already use elsewhere — this product *productizes*
them per task.

### 7.1 End-to-end testing — "actually go and do it"
The hardest and most differentiating piece. Approach:
- **Decide what to test.** The test planner uses the **Product** governing doc
  (what the product is / how it works) + the diff to enumerate the scenarios worth
  exercising — not generic unit tests but real user-visible behavior.
- **Execute across surfaces**, picking the right harness:
  - **Web** → headless/preview browser (we already have preview tooling).
  - **CLI / server** → run it in a tmux session and assert on output.
  - **The project's own suite** → the planner can also run the **discovered
    build/test/typecheck commands** (§6.4) when those are the best evidence (e.g. a
    pure-logic change with no UI surface). Testing stays *agentic* — the planner
    decides what's worth running per task; there is no forced floor — but the
    discovered commands are always available to it, so deterministic checks aren't
    orphaned.
- **Capture evidence** — screenshots, logs, network, transcripts — attached to the
  PR so the human approves on proof, not vibes.
- Failures feed the bounded retry loop before the task is ever surfaced.

**V1 ships web + CLI/tmux testing only**, behind the test planner. Mobile/native
simulators are deferred to a later phase (M3) — this is the riskiest part of the
product and we harden the two highest-value surfaces first.

## 8. Task Graph & Dependencies

Dependencies have **two gates** so a dependent can make progress without waiting on
the human to merge: it **starts** as soon as its parents finish their workflow
(review + testing), and only **merges** after its parents merge.

- **Edge semantics:** `B depends on A` ⇒
  - **Start gate** — B starts once A reaches `awaiting-approval` (A's pipeline —
    implement → review → test → PR — is done). B branches from `main` and merges A's
    unmerged branch in, so it builds on A's not-yet-landed code. With several unmerged
    parents, B branches off an integration of all of them; if they conflict, B is
    `blocked` for a human (no auto-resolver).
  - **Merge gate** — B can only merge once all its parents are merged: its branch is
    stacked on their commits, so it can't land ahead of them. When a parent merges, B
    is **restacked** onto `main` (`git rebase --onto`, dropping the parent's now-landed
    commits) so it becomes mergeable on its own.
- **Independent tasks run fully in parallel.** Tasks with no dependency between them
  branch from `main` and run concurrently (up to the concurrency cap), each opening
  its own PR. This is the common case and the main source of throughput.
- **Parent disruption restacks the child.** If a parent re-runs (request-changes) its
  tip moves; the child is restacked onto the new tip. If the child is mid-pipeline the
  restack is deferred until it settles. A restack that conflicts → the child is
  `blocked` for a human.
- **Sibling-merge races.** Two independent tasks can touch the same files. Before a
  task is surfaced, the scheduler **rebases its branch onto latest `main` and
  re-runs the test pass**; if the rebase doesn't apply cleanly, the task is marked
  `blocked` for the human to resolve. There is no auto-resolving integration agent —
  conflicts surface to a person.
- **Cycle prevention.** The orchestrator's `add_dependency` tool rejects edges that
  would create a cycle.
- **Merge & cascade.** Approval **squash-merges** the PR to `main` via
  `gh pr merge --squash` (one clean commit per task), which restacks any dependents
  onto `main`. If the human **abandons or rejects** a task, its (transitive) dependents
  — whose work was built on it — are marked `blocked` for the user to redirect or drop;
  any that already started have their worktrees GC'd so a re-run starts fresh.

## 9. Continuous Task Generation (the Scout)

When a task reaches `awaiting-approval` (PR-ready), a **Scout agent** runs — so the
loop keeps turning without waiting on the human to merge:
- Reads **`priorities.md`**, the just-completed work, and the current graph.
- Proposes follow-up tasks (bug fixes it noticed, natural next steps, debt it
  created, opportunities aligned with the project's priorities).
- **Wires dependencies freely.** A dependent now starts as soon as its parent passes
  review + testing (§8) — it no longer waits on the human to merge — so the Scout wires
  a dependency whenever work builds on another task, and still prefers independent
  tasks when work is genuinely separate.
- New tasks enter as **`proposed`** with a one-line rationale. There is no priority
  field — once promoted, they run in creation order (FIFO).

**Seeded, not cold-start.** The Scout only runs *off the back of a completed task*,
so the machine extends the threads the user started and their follow-ons — it does
**not** invent work from nothing when the project is idle. When every seeded thread
and its descendants are done, the machine goes quiet until the user seeds again.
This is the main structural brake on sprawl: no human input, no new work.

**We trust the Scout.** There is no proposal cap and no dedupe gate — the Scout is
prompted (via `task-generation.md`) to propose only genuinely worthwhile,
non-redundant work, and we rely on that judgment. The backlog is effectively
unbounded.

**The remaining brakes are budget and concurrency, always on:**
- Proposed tasks are auto-promoted to `ready` and run **while under the project's
  daily budget and concurrency cap**; once a ceiling is hit, further work queues
  until the budget refreshes (rolling 24h) or a running task frees a slot.
- Merges always stay human-gated, so nothing the Scout generates reaches `main`
  without a human yes.

## 10. Learning — the "dreaming" loop

When a task reaches `awaiting-approval` (PR-ready), a **learning agent** reviews the
*entire* trajectory — implementation, simplification, review, testing, and even the
task-generation step — and extracts durable lessons. (It runs at the
same trigger as the Scout, while context is fresh, rather than waiting on merge.)
This is where the product compounds.

### 10.1 The governing documents
A small, curated, role-split set of markdown files. Two families:

All governing docs live under the project's **`.freebuff/docs/`** directory in the
repo. Two edit paths:
- **Agents** change docs **inside a task**, so the edit ships in that task's PR and
  is reviewed, length-cap-gated (§10.2), and merged like code — leaving a git trail.
- **The human** edits docs **inline in the sidebar** (§12), which **commits directly**
  to the repo. It's their own steering doc; routing a one-word fix through a full
  task/PR would be needless friction. (The length cap still applies as a save-time
  check.)

**A. Project knowledge (domain & direction)** — the "what and why":
- **`product.md`** — what the product is, its content/subject matter, how it works.
- **`priorities.md`** — strategy, positioning, current goals — what we're betting on
  and what matters now (the steering input for §9). *(Merges the former
  strategy + goals into one file so there's a single source of direction.)*
- **`technical.md`** — durable technical context: high-level architecture, key
  invariants, non-obvious gotchas, and "why it's built this way" decisions.
  **Explicitly excludes anything already obvious from the code** — no restating
  file layout or function signatures; only what a reader *couldn't* infer by
  reading the source.

**B. Role guidance (how to work well here)** — the "how", split by agent role so
each agent reads only its slice:
- **`implementation.md`** — conventions and patterns that make code land well.
- **`review.md`** — what to look for, recurring failure modes in this repo.
- **`testing.md`** — how to test this project, which surfaces, known flakiness.
- **`task-generation.md`** — what makes a good task here, sizing, what to avoid.
- **`learning.md`** — guidance for the learning loop itself (how to write good,
  non-redundant learnings).

Every agent, at every step, reads the applicable doc(s). Every task can edit them.

### 10.2 Keeping docs lean (avoiding doc-rot)
The failure mode is bloat and contradiction. We do **not** run a separate curator
(for now). Instead, leanness is enforced two ways — a **hard cap** and a **rule**:

**Hard length cap (enforced as a merge gate).** Each governing doc has a fixed
maximum length — generous but bounded. The default is **~400 lines (~16 KB) per
doc**, tunable per doc (e.g. `technical.md` may warrant more room than
`task-generation.md`). An edit that pushes a doc past its cap **cannot be merged**;
the gate rejects it the way a failing test would. This makes space a zero-sum resource: to add something, the agent must
condense existing content or drop the least important lines to make room. The cap
turns "keep it lean" from a soft suggestion into a constraint the machine has to
satisfy, and it's a standing signal to the learning agent to prune as it writes.

**Leanness rule (how the agent stays under the cap):**
- **Edits clean up as they go.** When adding a learning, the agent first reads the
  doc and *integrates* — rewriting or replacing a nearby line rather than appending
  — and deletes anything the new knowledge makes redundant or stale. The doc is a
  living synthesis, never an append-only log.
- **Learnings are evidence-backed.** Each is grounded in a real moment from the
  trajectory, not a free-floating assertion — vague advice doesn't earn a line.
- **Smaller is better.** A learning that doesn't change what an agent would *do*
  isn't worth keeping. The bar for adding a line is "this would have changed an
  outcome." When near the cap, the agent ranks existing lines by this bar and
  evicts the weakest to fit the new one.
- Because docs are edited inside normal tasks/PRs (§10.1), every doc change is
  reviewed and diffable, and the human can edit or revert any of it directly.

## 11. Agent Roster

| Agent | Runs | Responsibility | Reads |
|---|---|---|---|
| **Orchestrator** | persistent (the chat) | own the task graph, route guidance, read docs | all governing docs |
| **Task Agent** | per task | execute & adapt the pipeline, report status | role docs for its stages |
| **Implementer** | per task | make the change in the worktree | `implementation.md`, `product.md` |
| **Simplifier** | per task | shrink & clean the diff | `implementation.md` |
| **Reviewer (+ fixer)** | per task | find bugs/failure modes, apply fixes | `review.md` |
| **Test planner + executor** | per task | decide & run e2e tests | `testing.md`, `product.md` |
| **Scout agent** | post-task | propose next tasks | `priorities.md`, `task-generation.md` |
| **Learning agent** | post-task | extract & integrate lessons (lean edits) | trajectory, `learning.md` |

The pipeline that wires these together is fixed in code (§7); agents decide which
stages to run per task. Users don't author it in V1. *(Deferred to M3: Attempt
agents ×N + a Synthesizer that merges them. The integration/conflict-resolution
agent was cut entirely — conflicts surface to the human, §8.)*

## 12. UX / UI

**Layout (three panes):**
- **Left — navigation:** the **Task Board**, a **kanban by status** (`proposed`,
  `ready`, `running`, `awaiting-approval`, `merged`, `blocked`/`failed`) with
  dependencies shown as badges/links on each card. (A full DAG graph view is a later
  addition.) Plus a pinned list of the **governing docs** — one click to open and
  edit any of them inline; a human edit here **commits directly** to the repo (agent
  edits go through tasks/PRs — §10.1). Transparency is a feature; nothing is buried.
- **Center — the orchestrator chat** (primary surface) OR, when a task/doc is
  selected, that task's detail / the doc editor.
- **Right — context:** for a selected task, its live pipeline stage, diff, test
  evidence, transcript, and the PR with **Approve & Merge** / request-changes.

**Task detail view** shows the pipeline as a progress strip (implement →
simplify → review → test → PR), each stage expandable to its agent's work and
artifacts.

**"Grill me" toggle (clarify before acting).** A small toggle sits next to the
orchestrator's input box:
- **On** — before creating tasks, the orchestrator *interrogates* the prompt: it
  asks focused follow-up questions to flesh out intent, scope, edge cases, and
  acceptance criteria until the request is well-specified, then proceeds. Best when
  the user has a fuzzy idea and wants help sharpening it.
- **Off (default)** — the orchestrator takes the prompt at face value and acts
  immediately, decomposing into tasks without a question round. Best when the user
  knows exactly what they want and doesn't want to be slowed down.

The toggle only governs *up-front clarification*; the orchestrator can still ask a
question mid-flight if it hits a genuine blocker. (Conceptually this maps to the
harness's plan/clarify behavior, surfaced as a one-click user control.)

**Talking to tasks.** In V1 the human chats **only with the orchestrator**; guidance
to a specific task is routed through it ("tell the auth task to also handle SSO").
One mental surface, simplest model. Opening a task and chatting directly to its Task
Agent for fine-grained steering is a later addition, not part of V1.

**The budget meter** (global, prominent): a live, **display-only** readout of how
much of today's **daily budget** remains (used vs. remaining), plus current
concurrency vs. cap. The budget is set by Freebuff and is not user-adjustable — the
meter is there for *visibility*, so the user always knows how much headroom the
machine has left today and roughly how much more it can do before the budget
refreshes. The machine always runs budgeted-auto (§9); "autonomous" never means
"opaque." (The user's levers are pausing the project and approving/declining PRs —
not the budget itself.)

**Approvals inbox:** a queue of `awaiting-approval` tasks so the human's core loop
is "review the next ready PR → approve or comment."

**Review & merge round-trip.** From a PR-ready task the human has two actions, both
in-app:
- **Approve & Merge** — squash-merges the PR to `main` via `gh pr merge --squash`
  (§8). No context switch to GitHub required.
- **Request changes** — the human's comments are fed back to the task as guidance
  and the relevant pipeline stages **re-run** (re-implement → re-review → re-test),
  producing an updated PR. The task stays the same task; the graph doesn't grow a
  duplicate. The user can iterate this as many times as needed.

(The PR also exists on GitHub and can be reviewed there; the app detects external
merges. But the intended loop keeps the user in the cockpit.)

**Notifications (V1: in-app only).** The events that need a human — a task reached
PR-ready (needs approval), a task is `blocked` (merge conflict, repeated review
failure, broken run-config), or the daily budget is exhausted — surface as **in-app
badge counts** on the Task Board and the approvals inbox. *(Native desktop/OS
notifications with a quiet mode are a later addition; the app must be open for work
to progress anyway in V1, so the user is already in it.)*

## 13. Human-in-the-Loop & Safety

- **Merge is human-gated.** The machine prepares; the human approves. (Auto-merge of
  clean-gate tasks is a later, opt-in setting — not in the default loop.)
- **The daily budget is the ceiling, and Freebuff sets it.** Freebuff users don't
  pay per token — each account gets a **token-based daily budget**, fixed by us and
  not user-adjustable, that replenishes on a **rolling 24h** basis. Users see it via
  a **display-only meter** (§12). On exhaustion, an in-flight task is allowed to
  **finish its current stage, then new work pauses** until headroom returns — work
  is never corrupted mid-stage. Because the model is **DeepSeek v4 Flash for every
  stage** — uniform and extremely cheap — the daily allowance is enough to run
  **dozens of agents a day**. This uniform-cheap model is precisely what makes the
  "machine that keeps going" economically viable in a free product; there's no
  premium-model tier drawing the budget down faster.
- **The two hard runtime ceilings are budget and concurrency** (default ~5 tasks),
  surfaced live. There is **no backlog cap** — the Scout is trusted and the backlog
  is unbounded; what keeps it from sprawling is structural: the Scout only fires off
  completed *seeded* work (§9), and budget/concurrency throttle execution. Hitting a
  ceiling pauses *new* work, never corrupts in-flight work.
- **Everything is inspectable & editable** — governing docs, every agent
  transcript, every test artifact. No hidden state.
- **Execution runs on the host** (in the task's worktree), like the CLI today — it's
  the user's own repo. There is no per-task sandbox/container in V1; the implication
  (agents run the project's build/test commands on the user's machine) is documented
  for the user at setup. Sandboxing is a possible later hardening.
- **Governing docs have a hard length cap** enforced as a merge gate (§10.2): an
  edit that exceeds the cap can't merge, forcing the machine to condense or prune
  rather than let guidance bloat unboundedly.
- **Kill switches:** pause project, pause a task, abandon a task (GC its worktree).
- **Destructive-action guardrails:** agents never force-push, never touch `main`
  directly, never merge without the gate. (Matches repo conventions.)

## 14. Data Model (sketch)

```
Project {
  id, repoUrl, defaultBranch,
  runConfig: { build, devServer, test },   // discovered at setup (§6.4), user-editable
  mergeStrategy: 'squash',                  // default; per-project
  dailyBudget, concurrencyCap              // set by the Freebuff backend, not the user
}
Task {
  id, createdAt, title, description, status,   // FIFO order by createdAt; no priority
  parents: TaskId[], branch, worktreePath, prUrl,   // branches from main (§8)
  lastCompletedStage, transcripts, testEvidence,    // resume re-runs the next stage
  origin: 'human' | 'scout', rationale
}
DependencyEdge { from: TaskId, to: TaskId }
BudgetLedger { accountId, tokensUsed, windowStart }   // rolling 24h window
```

Persisted locally (per project, e.g. SQLite under `.freebuff/`), so a project is
portable with its repo. `lastCompletedStage` is all that's needed to **pause on
app-close and resume** — relaunch re-runs the next stage (§6.5). GitHub access goes
through the local `gh` CLI (§6.3), so there's no App-install record. **Governing docs
are not rows — they are markdown files committed under `.freebuff/docs/`**, so
they're versioned, diffable, and reviewed like any other code change, and the agents
editing them leave a git trail. Worktrees live under `.freebuff/worktrees/`
(gitignored). The pipeline is code, not data — there is no workflow record.

## 15. Roadmap

The product only makes sense when all three differentiators run together — the
orchestrator generates tasks, the quality gate makes them mergeable, and the
learning loop makes the next round better. So **V1 ships the full loop end-to-end**;
we sequence *within* V1 by building a thin spine first and thickening each stage,
not by deferring whole pillars. Each milestone is a working machine, just a
sharper one.

- **M0 — Thin spine (walking skeleton).** The whole loop, minimally: orchestrator
  chat creates/wires a couple of tasks → each runs a single-attempt pipeline
  (implement → review → web test) → PR → a basic Scout step proposes one
  follow-up → a basic learning step integrates one lesson into the governing docs.
  Runs budgeted-auto within the daily budget, human-gated merge. *Goal: the loop
  closes and visibly turns once.*
- **M1 — Thicken the quality gate.** Add the simplification pass, adversarial review
  with bounded retries, and CLI/tmux testing alongside web, plus the agent-adapted
  pipeline (skip stages by judgment). *Goal: surfaced PRs are genuinely
  review-ready.* (Still single-attempt; no synthesis.)
- **M2 — Thicken the loop (V1 complete).** Real scouting (dependency-aware follow-up
  generation off completed seeded work) and real learning (role-split docs,
  evidence-backed, lean self-integrating edits under the length cap — §10.2). *Goal:
  the machine measurably improves the project and its own guidance over time.*
- **MH — Pre-public-launch hardening.** Gating items required before shipping to
  outside users (not aspirational): the full **Freebuff GitHub App** replacing local
  `gh` (so onboarding doesn't depend on each user's `gh` setup), plus abuse/auth
  hardening. *Goal: safe to hand to people who aren't us.*
- **M3 — Reach (post-launch).** Parallel attempts ×N + synthesis; native desktop
  notifications; direct task chat; simulator/native e2e; cloud execution (machine-off,
  always-on); multi-repo.

> Phasing is about *depth per stage*, not *which pillars exist*. From M0 on, a user
> can watch the orchestrator → gate → scout → learning cycle run; later
> milestones make each link stronger and more trustworthy.

## 16. Key Decisions (resolved)

These were the open choices; all are now settled for V1.

**Platform & stack**
1. **Desktop shell:** Electron + React renderer.
2. **Main-process runtime:** Bun (matches the monorepo; reuses `sdk`/`agent-runtime`).
3. **Execution:** local-first — agents run on the user's machine; the app must be
   open for work to progress. Cloud execution is M3.
4. **Persistence:** SQLite under `.freebuff/`; governing docs are markdown files
   under `.freebuff/docs/`; worktrees under `.freebuff/worktrees/` (gitignored).
5. **VCS & auth:** GitHub only. **V1 uses the local `git` + `gh` CLI** (the user's
   existing `gh` auth); a fine-grained **GitHub App replaces it in the pre-public-
   launch hardening step (MH)**. Freebuff sign-in (same backend as the CLI) for model
   access; the daily budget is per Freebuff account.
6. **Sandboxing:** none in V1 — execution runs on the host in the task's worktree
   (the user's own repo), consistent with the CLI trust model.
7. **Concurrency:** default ~5 task agents at once (tunable, user-visible).
8. **App-close:** pause in-flight tasks; on relaunch resume at the **last completed
   stage boundary** (re-run the interrupted stage — no mid-stage state to serialize).

**Setup**
9. **Run config:** a setup agent discovers build/dev/test commands from the repo and
   saves them (user-editable); the testing pass uses them.
10. **Docs bootstrap:** a bootstrap agent drafts `product.md` + `technical.md` from
    the codebase; role docs start as templates; `priorities.md` is left for the user.

**Quality gate**
11. **Pipeline authoring:** there is **no user-authored workflow** in V1. The pipeline
    is fixed in code; agents adapt it by judgment (skip stages that don't apply).
    Custom user-defined workflows are a possible later addition.
12. **Attempts:** **V1 runs a single attempt per task** (implement → simplify →
    review → test → PR). Parallel attempts ×N + a synthesis stage are deferred to M3.
13. **Models:** DeepSeek v4 Flash for every stage (no premium tier).
14. **E2E test surfaces:** web (preview browser) + CLI/server (tmux). Mobile/native
    simulators are M3.
15. **Review loop:** findings are auto-fixed by a fixer agent and re-reviewed, up to
    2 retries, then escalated to the human.

**Task graph & loop**
16. **Dependencies:** ordering-only — **every task branches from `main`**, and a
    dependent waits until its parent is **merged**. No branching from unmerged
    parents, no integration agent; sibling-merge conflicts surface to the human as
    `blocked` after a pre-surface rebase-onto-main + re-test. The **Scout prefers
    independent tasks** so the loop doesn't stall waiting on approvals.
17. **Scheduling order:** FIFO by creation time — no priority field.
18. **Scout & Learning triggers:** both run at PR-ready, while context is fresh,
    without waiting on merge.
19. **Autonomy is seeded, not cold-start:** the Scout only fires off completed
    seeded work; the machine never invents work when idle. Within that, it runs
    budgeted-auto (no mode selector).
20. **No Scout cap or dedupe; unbounded backlog.** The Scout is trusted to propose
    only worthwhile, non-redundant work; budget + concurrency are the only runtime
    brakes.

**Docs & learning**
21. **Project-knowledge docs:** `product.md` + `priorities.md` (strategy + goals
    merged) + `technical.md` (architecture/gotchas, nothing obvious from code).
22. **No curator, no raw learnings log.** Leanness via self-integrating edits under a
    **hard per-doc length cap** (default ~400 lines / ~16 KB, tunable per doc),
    enforced as a merge gate. **Doc-edit paths:** human inline edits commit directly;
    agent doc edits ride the task/PR flow (§10.1).

**Product & UX**
23. **Task chat:** orchestrator-only in V1; direct per-task chat is later.
24. **Task board:** kanban by status with dependency badges; DAG graph view later.
25. **Grill-me toggle:** default **off** (act directly); on = clarify first.
26. **Budget meter:** display-only; token-based, rolling-24h, finish-then-pause on
    exhaustion. The budget is set by Freebuff and not user-adjustable.
27. **Review & merge:** in-app — Approve & Merge **squash-merges** via
    `gh pr merge --squash`; Request-changes feeds comments back and re-runs the
    pipeline on the same task. Merge is always human-gated; auto-merge is a later
    opt-in.
28. **Notifications:** **in-app badges only** in V1 (PR-ready / blocked / budget
    exhausted); native desktop/OS notifications are a later addition.
29. **Projects:** one repo per project, one project per window, multiple windows
    (sharing the account's daily budget).
30. **Release framing:** **M0–M2 build V1** (the full loop) as internal milestones,
    not separate public releases; **MH** is pre-public-launch hardening (GitHub App,
    abuse/auth); **M3** is post-launch reach (attempts+synthesis, cloud, etc.).

## 17. Risks

- **Quality-gate trust.** If "ready" PRs are wrong too often, the human re-reviews
  everything and the value proposition collapses. *Mitigation: invest hardest in
  testing + adversarial review; show evidence, not assertions; track an
  approval-without-edits rate as the north-star quality metric.*
- **Task sprawl / low-value churn.** With no proposal cap or dedupe, a trusted Scout
  could generate near-duplicate or marginal tasks and quietly drain the budget on
  noise. *Mitigation: the Scout fires only off completed seeded work (no cold-start),
  budget + concurrency throttle execution, and merges are human-gated; `task-
  generation.md` is the lever to tighten what "worthwhile" means. Watch the
  Scout-task approval rate — if it's low, revisit adding dedupe/a backlog cap.*
- **Learning-doc rot.** Bad or bloated guidance degrades every agent. *Mitigation:
  evidence-backed learnings, edits that integrate and prune as they go under the
  length cap, human edits via normal review (§10.2).*
- **Bootstrap & run-config quality.** The setup agent's drafted docs and discovered
  build/test commands seed everything downstream; if they're wrong, every later
  agent inherits the error. *Mitigation: surface both for human review before the
  machine starts; treat a broken run-config as a `blocked` state, not a silent
  test-skip.*
- **Host execution.** Agents run the project's build/test commands on the user's
  machine with no sandbox. *Mitigation: it's the user's own repo (CLI trust model);
  document the implication at setup; sandboxing is a later hardening if needed.*
- **Availability expectation.** Local-first means work only advances while the app is
  open; users may expect cloud-style always-on. *Mitigation: set the expectation in
  onboarding; pause/resume makes closing safe; cloud execution is the M3 answer.*
- **Sibling-merge conflicts.** Independent tasks branched from `main` can touch the
  same files and collide at merge. *Mitigation: V1 deliberately avoids the hardest
  case (no building on unmerged parents); a pre-surface rebase-onto-main + re-test
  catches collisions and routes them to the human as `blocked` rather than
  auto-resolving (§8). If conflicts become common, an integration agent can be added
  later.*
- **e2e flakiness.** Real testing is the differentiator and the hardest to make
  reliable. *Mitigation: scope to web+CLI first; capture artifacts; treat flaky
  tests as a learning the testing doc records.*
- **Scope.** This is a large surface. *Mitigation: the M0–M3 milestones — a thin
  spine first, then thickening each stage, so the loop is testable from M0.*

## 18. Success Metrics

- **North star:** **merged PRs** — the volume of accepted, merged changes the
  machine produces. (Because every user runs on the same fixed daily budget, dollar
  cost is roughly constant across users and isn't the metric; throughput is.)
- **Quality:** % of surfaced PRs approved without human edits.
- **Autonomy:** % of merged tasks that were agent-generated (Scout) vs.
  human-seeded — rising over a project's life.
- **Compounding:** measurable improvement in approval-without-edits rate over time
  (evidence the learning loop works).
- **Operational health (not a success metric):** how often projects hit the daily
  budget ceiling — informs whether the fixed budget is sized right.

## 19. Orchestrator Tool Surface

The orchestrator is the only agent the user chats with, and it does **not** write
code — it directs. Its entire capability is this tool set (the contract between the
chat and the rest of the system). Sub-agents in the pipeline (implementer, reviewer,
etc.) use the normal Codebuff coding tools — read/write/run — **not** these.

```ts
// — Task graph management —
create_task(input: {
  title: string
  description: string          // the spec the Task Agent works from
  parents?: TaskId[]           // dependencies; must already exist
}): { taskId: TaskId }

update_task(input: { taskId: TaskId; title?: string; description?: string }): void

add_dependency(input: { from: TaskId; to: TaskId }): void
  // "to depends on from": to waits until from is merged. Rejects cycles (§8).
remove_dependency(input: { from: TaskId; to: TaskId }): void

abandon_task(input: { taskId: TaskId }): void
  // stops work, GCs the worktree, marks unmerged dependents `blocked` (§8).

// — Task interaction & inspection —
send_guidance(input: { taskId: TaskId; message: string }): void
  // routes a steer to a running Task Agent ("also handle SSO"). No-op text is
  // queued if the task is between stages.
get_task(input: { taskId: TaskId }): {
  status: TaskStatus; stage: PipelineStage | null
  prUrl?: string; parents: TaskId[]; origin: 'human' | 'scout'
}
list_tasks(input?: { status?: TaskStatus }): TaskSummary[]

// — Governing docs (read-only here) —
read_doc(input: { name: DocName }): string
  // Writes do NOT happen through the orchestrator. To change a doc it creates a
  // normal task ("update priorities.md to ...") so the edit ships via a PR (§10.1).
```

```ts
type TaskStatus =
  | 'proposed' | 'ready' | 'running' | 'awaiting-approval'
  | 'merged' | 'blocked' | 'failed' | 'abandoned'
type PipelineStage =
  | 'implement' | 'simplify' | 'review' | 'test' | 'pr'
type DocName =
  | 'product' | 'priorities' | 'technical'
  | 'implementation' | 'review' | 'testing' | 'task-generation' | 'learning'
```

**Invariants the tool layer enforces** (not left to the model): cycle rejection on
`add_dependency`; `send_guidance` only to a live task; `parents` must reference
existing tasks; doc writes never go through the orchestrator.

The **Scout** uses the same `create_task`/`add_dependency` tools — it *is* an
orchestration-capable agent scoped to proposing follow-ups — which is why its output
lands as ordinary `proposed` tasks in the same graph.

## 20. Telemetry

The desktop app is a **new client on the existing logging pipeline** (`docs/
logging.md`) — no new infra. It logs with `@codebuff/logging` via `logger.*` and
ships analytics with `trackEvent(...)`, both mirrored to the Axiom **`freebuff`**
dataset through `POST /api/logs` (Bearer-authed, batched), exactly like the CLI.
PostHog is kept for product analytics.

- **New identity fields:** `source: 'desktop'`, `service: 'freebuff-desktop'`.
  Correlation keys reuse the standard ones: `user_id` = Freebuff account;
  `client_session_id` = one app launch; **`client_request_id` = the task id**
  (so a task's whole pipeline traces end-to-end, like `run_id` does for an agent
  run); a `project_id` rides in `data`. Structured payload goes in `data` (JSON
  string; read via `parse_json(data)` in APL).
- **Events to emit** (the funnel + the health signals that back §18's metrics):

  | event | key `data` fields | powers |
  | --- | --- | --- |
  | `desktop.app_launched` | version, os | install→active funnel |
  | `desktop.project_added` | project_id, repo | activation |
  | `desktop.project_setup_completed` | discovered run-config ok?, docs drafted | setup success rate |
  | `desktop.task_created` | task_id, origin (`human`/`scout`), parents | autonomy mix |
  | `desktop.stage_started` / `desktop.stage_completed` | task_id, stage, durationMs, tokens, retries | pipeline cost/latency, retry rates |
  | `desktop.task_surfaced` | task_id (→ `awaiting-approval`) | throughput, time-to-ready |
  | `desktop.changes_requested` | task_id, round | quality (re-run loops) |
  | `desktop.task_merged` | task_id, edited_before_merge?, mergeStrategy | **north star** + approval-without-edits |
  | `desktop.task_blocked` / `desktop.task_abandoned` | task_id, reason | failure modes |
  | `desktop.doc_edited` | doc, by (`bootstrap`/`learning`/`human`), cap_hit? | doc-rot/cap pressure |
  | `desktop.scout_proposed` | parent_task_id, count | Scout productivity/sprawl |
  | `desktop.budget_exhausted` | account, windowStart | budget-sizing health |

- **Metric derivations:** north-star **merged PRs** = count of `task_merged`;
  **approval-without-edits** = `task_merged` with `edited_before_merge=false` and no
  preceding `changes_requested`; **autonomy** = `origin='scout'` share of
  `task_merged`; **Scout-task approval rate** (the §17 sprawl watch) = merged ÷
  proposed for `origin='scout'`; **budget-ceiling frequency** = `budget_exhausted`
  rate. All queryable with `scripts/logs/query-logs.ts --service freebuff-desktop`.
- **Cost levers are the standard ones:** ship `info`+ (drop `debug`), summarize
  large payloads rather than shipping diffs/transcripts verbatim, `data` truncated
  to ~64 KB. Per-stage token counts belong in `data`, not full prompt bodies.
