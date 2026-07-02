# Freebuff Desktop — Design Doc & PRD

> Status: **Shipped.** The thread-model design described here is implemented and
> merged (PR #307, "Overhaul Freebuff Desktop: thread/queue/workflows model + React
> UI"), with per-thread preview and browser-in-the-loop verification landing as
> follow-ups on the same line of work. "Freebuff Desktop" is the product name.
> Code lives in `freebuff-desktop/`.

## 1. Summary

Freebuff Desktop is a free, GitHub-native coding-agent desktop app. The familiar
shape — multiple parallel agent conversations, each on its own branch/worktree,
each able to produce a PR — exists in the category (Conductor, Claude Desktop,
Codex Desktop). Our bet is on **what you do with those conversations**: instead of
"one chat = one change," each conversation carries a **configurable queue of work**
you craft and then let run.

Three ideas define the product:

1. **Threads in tabs, not a task graph.** You work in browser-style tabs. Each tab
   is one **thread**: a single full coding agent running turn by turn in its own
   git worktree, with prompt caching carried across the whole conversation. A thread
   can make many changes over its life.
2. **A queue you craft, then let run.** Every thread has an ordered queue of upcoming
   prompts. You can stack feature prompts, skills, and whole workflows, reorder them,
   then flip **Autorun** and walk away — the thread drains the queue top-down,
   one turn at a time. The assistant proposes follow-ups (a `suggest_prompts` tool)
   that park in a **Suggestions** lane for you to promote or ignore.
3. **A composable, verifiable process.** **Skills** are reusable named prompts
   (review, simplify, test, reflect, open-pr — editable markdown). A **workflow** is
   an ordered list of skills (the seeded `ship` = review → simplify → test →
   reflect). `reflect` writes durable learnings into governing docs; `open-pr`
   commits and opens the PR. **Browser-in-the-loop** verification lets the test/review
   skills actually load the running app and catch behavioral bugs the agent can't see
   from the code alone.

The human's job is to **steer, not operate**: describe what you want, shape the
queue, accept good suggestions, and approve PRs. The thread does the turns. It is a
**software factory you steer, not operate**.

## 2. Goals & Non-Goals

### Goals
- **Let a human direct hours of coding work from a short queue.** Craft a queue,
  turn on Autorun, and a thread keeps building coherently across many turns.
- **Make the agent's process composable and editable.** Skills and workflows are
  plain markdown the user can read, edit, and recombine — no hidden pipeline.
- **Verify behavior, not just syntax.** Real testing — including loading the running
  app in a headless browser — so "tested" means "actually works," not "compiles."
- **A learning loop that compounds.** `reflect` curates durable guidance into a small
  set of governing markdown docs that advise future work.
- **Radical transparency & control.** Governing docs, skills, transcripts, the queue,
  and a per-thread live preview are all inspectable in the app. No hidden state.
- **Free** for use on the user's own project (consistent with Freebuff's model).

### Non-Goals (current release)
- Not a general chat assistant or a replacement for the CLI/IDE — it's a
  project-building cockpit.
- Not multi-repo orchestration — one local git repo open at a time (switchable from
  the UI; the engine swaps under the hood).
- Not a hosted/cloud agent farm — agents run on the user's machine against the
  Freebuff backend.
- Not GitLab/Bitbucket — GitHub (via local `git`/`gh`) for PRs.
- Not a CI/CD or deploy tool — we stop at "PR opened."
- Not autonomous-merge. A human reviews and merges.

## 3. Who It's For

- **Solo builders & small teams** on a git repo who want to describe work, queue
  follow-ups, and let a thread build for a long stretch without babysitting each turn.
- **"Director" mode developers** who'd rather shape a queue and review than type a
  fresh prompt for every change.

Primary job-to-be-done: *"Let me line up the work I want, turn it loose, and come
back to review — while the agent keeps the change coherent across turns."*

## 4. Differentiation — the thesis

| Existing parallel-agent desktop apps | Freebuff Desktop |
|---|---|
| One chat = one change | One thread = a whole queue of changes in one worktree, with prompt-cache continuity across turns |
| You type each prompt yourself | A **configurable queue** + **Autorun**: craft the work, then let it drain unattended |
| The agent's process is fixed/hidden | **Skills & workflows** are editable markdown you compose; `ship` is just a list you can change |
| Follow-up work is your job | The assistant **suggests** follow-ups that park in a lane; you promote what's good |
| "Tested" means "it compiled" | **Browser-in-the-loop**: the test/review skills load the running app and catch behavioral bugs |
| The agent forgets between changes | `reflect` curates durable learnings into transparent, editable governing docs |

The thesis: a **configurable queue you craft and let run**, a **composable process**
of skills/workflows, **suggestions** that extend the work, and
**browser-in-the-loop verification** — a software factory you steer, not operate.

## 5. Core Concepts

- **Project** — the open git repo + its governing docs + its skills/workflows + a
  local SQLite store. One repo open at a time; switchable from the UI.
- **Thread** — one conversation in one browser-style tab. Runs a single full coding
  agent turn by turn in its own git worktree/branch, carries a chat transcript and an
  ordered queue, and has an **Autorun** toggle. Status is `open`/`closed`; a thread's
  turn is `idle` or `running` (`Thread` in `src/core/types.ts`).
- **Queue item** — one upcoming (or running/done/suggested) prompt for a thread. A
  unified `queue_items` table; the **lane is the `state` column** (`queued` /
  `running` / `done` / `suggested`), ordered by a float `position` so inserts land
  between neighbors. `source` records who added it (`user` / `assistant` / `skill` /
  `workflow`).
- **Skill** — a reusable named prompt, an editable markdown file under
  `.freebuff/skills/<name>.md`. Builtins: `review`, `simplify`, `test`, `reflect`,
  `open-pr` (`BUILTIN_SKILLS` in `src/core/skills.ts`). Queuing a skill turns its body
  into one turn's prompt.
- **Workflow** — a named ordered list of skill names (a `workflows` table row).
  Queuing it **expands into one queued prompt per skill**, all sharing a
  `workflow_run_id`. The seeded `ship` workflow = `review → simplify → test →
  reflect` (`DEFAULT_WORKFLOWS`).
- **Governing docs** — a small, length-capped markdown set under `.freebuff/docs/`
  (`product`, `priorities`, `technical`, `learning`) that advise the agent. `reflect`
  appends learnings via the `write_doc` tool (`DocStore` in `src/core/docs.ts`).

## 6. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Freebuff Desktop                                                  │
│                                                                   │
│  Electron shell (Node)            Bun orchestrator (the engine)   │
│  ┌───────────────┐  loopback ┌──────────────────────────────────┐│
│  │ BrowserWindow │  HTTP/SSE │ ThreadEngine (pump, turns)        ││
│  │ + menu/tabs   │◄─127.0.0.1►│ Store (bun:sqlite, schema v5)     ││
│  │ spawns Bun    │           │ WorktreeManager (git, 1/thread)   ││
│  │ child proc    │           │ DocStore · SkillStore             ││
│  └───────────────┘           │ @codebuff/sdk → coding agent      ││
│         ▲                     │ git + gh CLI · browser tester     ││
│  React 19 + Zustand + Vite    └──────────────┬───────────────────┘│
│  renderer (SSE client)                       │                    │
└──────────────────────────────────────────────┼────────────────────┘
                                                │  Freebuff/Codebuff backend
                                                ▼  (models via @codebuff/sdk)
                                       ┌──────────────────┐
                                       │  GitHub  /  git  │
                                       └──────────────────┘
```

**Tech choices:**
- **Electron shell + Bun orchestrator split.** Electron's main process runs Node,
  but to reuse `@codebuff/sdk`/`agent-runtime` (Bun-targeted) the shell **spawns a Bun
  child process** — the orchestrator — and talks to it over loopback HTTP/SSE on a
  free `127.0.0.1` port (`electron/main.cjs`). The Electron menu owns browser-style
  tab accelerators (Cmd+T / Cmd+Shift+T / Cmd+W) and forwards them to the renderer.
- **The orchestrator process** (`src/app/server.ts`) is a `Bun.serve` HTTP+SSE
  server. It hosts the `ThreadEngine`, serves the built React SPA (packaged) or
  defers to Vite (dev), and exposes the thread/queue/skill/doc API the renderer drives.
  A single `/api/events` SSE stream broadcasts engine + thread + agent events; an
  open-project swap keeps clients streaming without a reconnect.
- **React 19 + Zustand + Vite renderer** (`src/app/ui/`). One Zustand store
  (`store/store.ts`) holds tabs, per-thread slices, queue items, skills, workflows,
  and toasts; `useSSE` reconnects and backfills; the API client is fire-and-forget
  with optimistic queue edits.
- **The coding agent runs via `@codebuff/sdk`.** Each turn calls `client.run(...)`
  with the thread agent definition, the thread's worktree as `cwd`, and the thread's
  `previousRun` for prompt-cache continuity (`ThreadEngine.runTurn`). The model is
  `deepseek/deepseek-v4-flash` for every turn (`src/app/models.ts`) — uniform and
  cheap, which is what makes "queue it and let it run" viable in a free product.
- **Persistence:** `bun:sqlite` at `<project>/.freebuff/desktop.db`, **schema v5**
  (`src/core/store.ts`): `threads`, `messages`, `queue_items`, `workflows`, plus the
  preserved `projects` and `budget_ledger`. Governing docs and skills are NOT rows —
  they are markdown files under `.freebuff/docs/` and `.freebuff/skills/`.
- **Packaging:** electron-builder ships a bundled Bun binary + a pre-bundled
  `orchestrator.js` (`scripts/build-orchestrator.ts`, `scripts/fetch-bun.ts`) + the
  built React SPA, so the user needs no system Bun. `playwright`/`playwright-core`
  stay external and are shipped beside the bundle for the browser tester (it drives
  the user's system Chrome, so no browser binaries ship).

### 6.1 Worktree manager
One git worktree per thread under `.freebuff/worktrees/<thread-id>`, each on a
`freebuff/<slug>` branch (`WorktreeManager` in `src/core/worktree.ts`). The worktree
is created **lazily** on the thread's first turn or first PR (`ensureWorktree`). On
`open_pr` the engine commits all changes, and if the repo has a remote, pushes and
opens a PR via `gh`; with no remote it records a `local://<branch>` reference.
Deleting a thread GCs its worktree; closing keeps it so reopen restores the work.

### 6.2 The ThreadEngine pump (turn loop)
`ThreadEngine` (`src/app/thread-engine.ts`) owns the store, worktrees, docs, skills,
and SDK client, and drives each thread:
- **`pump(threadId)` is a reentrant, per-thread loop** that runs turns **one at a
  time** (a `pumping` guard so concurrent triggers never double-run an item). Each
  iteration: run any **typed user message first** (it jumps the queue), then — while
  Autorun is on (or exactly one when `runNext`) — run the lowest-`position` `queued`
  item. `previousRun` is threaded through for prompt caching.
- **Crash recovery:** on startup any thread left `running` is reset to `idle` and any
  `running` queue item back to `queued` (the in-memory turn chain can't survive a
  restart).
- **Cost** is folded into the rolling-24h `budget_ledger` and a display total — now
  **informational only** (it does not gate work; see §13).

### 6.3 Authentication & project selection
- **Freebuff account.** Model calls go through `@codebuff/sdk` against the Freebuff
  backend (`CODEBUFF_API_KEY`), same as the CLI.
- **GitHub via local `git` + `gh`.** `open_pr` shells out to the user's `git`/`gh`
  to push branches and open PRs, reusing existing auth. (A fine-grained Freebuff
  GitHub App is the pre-public-launch replacement.)
- **Open any local repo.** The project directory isn't fixed at launch. `POST
  /api/project/open` tears down the current engine, stands up a fresh one on the
  chosen folder, and remembers it for next launch — all without dropping SSE clients.

## 7. The quality story — skills, workflows & browser-in-the-loop

There is **no fixed code-backed pipeline**. The "process" is data: skills are
editable prompts, workflows are editable lists of skills, and the user composes them.

### 7.1 Skills (the built-ins)
Each builtin is a single-turn instruction the full coding agent runs against the
current worktree (`BUILTIN_SKILLS`). They're seeded to disk on first open so they're
editable, and a user file of the same name overrides the builtin.
- **`review`** — adversarially trace the actual code paths for real defects
  (boundaries, null/empty, async/order, state drift, leaks) and fix genuine bugs;
  don't churn on style.
- **`simplify`** — make the change smaller/cleaner without altering behavior: reuse
  existing code, delete the unnecessary, improve naming.
- **`test`** — verify behavior, not just that it compiles/renders. The agent is told
  it **cannot see the screen**, so for any real logic/stateful behavior it must write
  and **run** a short headless script that drives the code and asserts state
  transitions (e.g. "does a guest board, pay, and leave; does money change"). This is
  the gap that previously let a game with a broken economy loop pass.
- **`reflect`** — capture durable learnings via the `write_doc` tool (append to
  `learning`, and `technical` for architecture decisions); keep it lean, do nothing
  if there's nothing worth recording.
- **`open-pr`** — make sure things are in a good state, then call `open_pr` to commit,
  push, and open the PR.

### 7.2 Workflows
A workflow is a named ordered list of skill names. Queuing it expands into one queued
prompt per skill, grouped under a shared `workflow_run_id` (shown as a labeled group
in the queue). The seeded **`ship`** = `review → simplify → test → reflect`. Users
can edit skills and define/edit workflows from the app (`/api/skill/*`,
`/api/workflow/*`).

### 7.3 Browser-in-the-loop (the verification upgrade)
The agent can run `node`/build commands but historically could not load a page,
click, and observe — so "tested" web/UI/game work was only syntactically verified.
The fix is the **`browser_check`** tool (`src/core/browser-check.ts`, built on
Playwright, shipped external to the bundle; drives the user's system Chrome and
falls back to bundled Chromium). It loads the thread's **per-thread preview** (§8)
in a real headless browser and returns whether it loaded and rendered plus any
console/page errors; if no browser can launch (e.g. CI) it returns a `harnessError`
instead of failing the turn. The built-in `test` and `review` skill prompts now tell
the agent to call it for any web/UI/game change, so they catch behavioral and visual
bugs the agent otherwise can't see. This — together with the per-thread preview that
lets the **human** see the running app — closes the biggest gap surfaced while
dogfooding (see `freebuff-desktop/DOGFOOD-NOTES.md`).

## 8. Per-thread Preview

Because each thread works in its own worktree, a single project-root preview can't
show a thread's in-progress work. The server therefore exposes
**`/thread-preview/<threadId>/…`**, which serves files from **that thread's git
worktree** (falling back to the project root if the worktree doesn't exist yet),
traversal-guarded (`servePreview` in `src/app/server.ts`). The UI's thread header has
a one-click **Preview / Reload / Hide preview** control that iframes it
(`ThreadView.tsx`), so you can watch a thread's web work run live inside the app. The
Vite dev proxy forwards `/thread-preview` to the orchestrator.

## 9. Suggestions (the assistant's follow-ups)

The thread agent has a **`suggest_prompts`** tool (`src/app/agents/thread-agent.ts`):
when it's genuinely useful, it proposes follow-up prompts (a natural next feature,
polish, a cleanup the work created). These land in the thread's **Suggestions lane**
(`state = 'suggested'`, `source = 'assistant'`) — they do **not** run automatically.
The user **promotes** a suggestion into the queue, edits it, or dismisses it. This
replaces the old "Scout": instead of a separate agent minting graph tasks, the same
coding agent offers ideas the user curates.

## 10. The thread agent & its tools

The thread agent (`threadAgentDefinition`) is one full coding agent — it reads and
edits files in the worktree, runs commands, and ships changes. Its tool set is the
base coding tools (`read_files`, `code_search`, `str_replace`, `write_file`,
`run_terminal_command`, …; `THREAD_AGENT_TOOLS`) plus three engine-wired custom
tools (`buildThreadTools`):

| Tool | Purpose |
|---|---|
| **`suggest_prompts`** | Park follow-up prompts in the Suggestions lane (§9). Does not run them. |
| **`write_doc`** | Append/replace a governing doc (`product`/`priorities`/`technical`/`learning`). Returns a **cap** error if the write exceeds the doc's length cap, so the agent condenses and retries. Used by `reflect`. |
| **`open_pr`** | Commit all changes, push the branch, open a PR (or `local://<branch>`). Used by `open-pr`. |

The system prompt instructs it to do the task completely, match existing style,
**verify by running commands** (rendering is not correctness), and only commit/open a
PR when a tool or the user asks.

## 11. UX / UI

**Layout.** A top **TabBar** of browser-style tabs over a two-pane **workspace**:
the **ThreadView** (transcript or live preview + composer) on the left, the
**QueuePanel** on the right (`App.tsx`).

**Tabs.** Each thread is a tab. Keyboard shortcuts (browser-style, all Cmd/Ctrl-
modified so they fire while typing): **new ⌘T**, **reopen last closed ⌘⇧T**, **close
⌘W**, **next/prev ⌘⇧] / ⌘⇧[** and **Ctrl+Tab / Ctrl+Shift+Tab**, **jump ⌘1–9**
(⌘9 = last) (`hooks/useKeyboard.ts`; the Electron menu owns the File-menu
accelerators and forwards them via IPC). A fresh thread auto-titles from its first
message.

**ThreadView.** Streams the live transcript (assistant text + a fold of tool calls),
auto-scrolling while pinned to the bottom. The header toggles the per-thread
**Preview** iframe (§8).

**QueuePanel (the centerpiece).** Lanes rendered from `queue_items`:
- A **Run lane** showing the `running` item (spinner) and the `queued` items in
  run order, **drag-to-reorder** via dnd-kit; workflow-expanded items show a group
  header. Each queued item can be edited inline, deleted, or demoted to Suggestions.
- Items are queued from the **main composer** (messages typed while a turn is
  running park here) and the **Skills** panel — the queue panel has no compose
  box of its own.
- A **done** list (history) and a **Suggestions** lane at the bottom, each suggestion
  promotable (↑) into the queue or dismissable.
- An **Autorun** checkbox (per thread). Off → a **Run next** button steps one item;
  on → the pump drains the queue top-down. Optimistic edits keep the panel snappy and
  reconcile from SSE.

**Toasts.** A lightweight toast surfaces otherwise-invisible action results — e.g.
`open_pr` reports "Opening PR…", the resulting URL, or a failure (`pushToast`).

**Talking to a thread.** One composer, queue-by-default: typed messages run
immediately when the thread is idle, and **join the queue** while a turn is
running. Each queued item carries a **Send now** action that delivers it like a
typed message — steering the running turn at its next step boundary (or running
next when idle, ahead of the rest of the queue) — so you can interrupt a
draining queue with a correction without clearing it.

## 12. Human-in-the-Loop & Safety

- **The human owns merges.** The app opens PRs (`open_pr` / the PR button); a person
  reviews and merges on GitHub. No autonomous merge.
- **The queue is the lever, Autorun the throttle.** Nothing runs that isn't in the
  queue (or typed). Autorun off = explicit single steps; Autorun on = unattended
  drain you can pause anytime by toggling it off.
- **Suggestions never auto-run.** The assistant can propose, only the user promotes.
- **Everything is inspectable & editable** — governing docs, skills, workflows, every
  transcript and tool call, the queue, and a per-thread live preview. No hidden state.
- **Execution runs on the host** in the thread's worktree (the user's own repo), like
  the CLI today — no per-thread sandbox.
- **Governing docs have a hard length cap** (default ~400 lines / ~16 KB,
  `DEFAULT_DOC_CAP`) enforced at save time; an over-cap `write_doc` returns an error
  so the agent must condense rather than let guidance bloat.
- **Crash recovery** resets interrupted turns/items so a restart is safe (§6.2).
- **Destructive-action guardrails:** agents work only in the thread's worktree/branch,
  never force-push, never touch the default branch directly (repo conventions).

## 13. Data Model

SQLite at `<project>/.freebuff/desktop.db`, **schema v5** (`src/core/store.ts`):

```
projects      ( id, repo_url, root_path, default_branch, run_config,
                merge_strategy, daily_budget, created_at )

threads       ( id, project_id, title, status('open'|'closed'),
                autorun, branch, worktree_path, base_ref, pr_url,
                turn_state('idle'|'running'), created_at, updated_at )

messages      ( seq, thread_id, role, text, acts_json, ts )   -- transcript

queue_items   ( id, thread_id, prompt, label,
                state('queued'|'running'|'done'|'suggested'),
                source('user'|'assistant'|'skill'|'workflow'),
                skill_name, workflow_run_id, workflow_name,
                position REAL, created_at, updated_at )         -- unified queue

workflows     ( project_id, name, skills_json )                -- ordered skill list

budget_ledger ( account_id, tokens_used, window_start )        -- rolling 24h, info-only
```

The lane is the `queue_items.state` column; `position` is a float so a reorder lands
between neighbors without renumbering (`positionAfter` in `src/core/queue-order.ts`,
shared by engine and renderer). Governing docs (`.freebuff/docs/`) and skills
(`.freebuff/skills/`) are **markdown files, not rows** — versioned, diffable, and
editable. Worktrees live under `.freebuff/worktrees/` (gitignored). Migration drops
the task-graph-era tables (`tasks`, `dependency_edges`, `task_artifacts`,
`chat_messages`) and preserves `projects` + `budget_ledger`.

## 14. Roadmap

The product is shipped and dogfooded. Sequencing from here is about **depth**, not
new pillars:

- **Shipped (PR #307).** Thread/tab model, unified queue + Suggestions, Autorun pump
  with prompt-cache continuity, skills + workflows (`ship`), governing docs with
  `reflect`/`write_doc`, `open_pr`, one worktree per thread, React/Zustand/Vite UI,
  Electron + Bun packaging.
- **Per-thread preview** (`/thread-preview/<id>`) + in-app Preview panel, and **error
  toasts** — landed as the first dogfood follow-ups.
- **Browser-in-the-loop** verification — the `browser_check` tool (Playwright,
  `src/core/browser-check.ts`) feeds the running per-thread preview's render + console
  errors back to the `test`/`review` skills — landed, closing the "agent can't see the
  screen" gap. CI also now runs the `freebuff-desktop` test suite (`test-freebuff-desktop`).
- **Next.** Richer skill/workflow authoring UI; deeper suggestion quality; project
  setup/onboarding (run-config + docs bootstrap); the Freebuff GitHub App; abuse/auth
  hardening for outside users; later, cloud execution and multi-repo.

## 15. Key Decisions

1. **Unit of work:** a **thread** (conversation in a tab) running a single full
   coding agent turn-by-turn in its own worktree — **not** a dependency graph of tasks.
2. **Continuity:** per-thread `previousRun` carries prompt caching across turns;
   one worktree per thread accumulates the changes.
3. **The queue is the control surface:** a unified `queue_items` table, lane = state,
   float `position`; **Autorun** drains it; typed messages jump it.
4. **Suggestions, not a Scout:** the assistant proposes follow-ups via
   `suggest_prompts` into a lane; the user promotes.
5. **Process is data:** **skills** (editable prompts) + **workflows** (editable skill
   lists), not a fixed code pipeline. Seeded `ship` = review→simplify→test→reflect.
6. **Verification:** the `test` skill must run real headless assertions; a
   **browser-in-the-loop** tool lets test/review load the running preview.
7. **Governing docs kept**, length-capped, written by `reflect`/`write_doc`.
   **Budget kept but informational** — it no longer gates work.
8. **Model:** `deepseek/deepseek-v4-flash` for every turn — uniform and cheap.
9. **Architecture:** Electron shell spawns a Bun orchestrator over loopback HTTP/SSE;
   React 19 + Zustand + Vite renderer; `bun:sqlite` schema v5; packaged with a
   bundled Bun + built SPA, Playwright external for the browser tester.
10. **GitHub via local `git`/`gh`** for PRs; Freebuff account for model access.

## 16. Risks

- **Verification trust.** If "tested" work is wrong too often, the user re-checks
  everything. *Mitigation: behavioral `test` skill + browser-in-the-loop; per-thread
  preview so the human can also see it run.*
- **Unattended drift over a long Autorun.** A long drain can wander off-intent.
  *Mitigation: Send now on any queued item steers mid-run to correct course;
  suggestions are opt-in; Autorun toggles off instantly; prompt-cache continuity keeps turns coherent.*
- **Suggestion noise.** Low-value suggestions clutter the lane. *Mitigation: the
  prompt tells the agent to suggest only genuinely useful follow-ups and nothing if
  the work feels complete; suggestions never auto-run.*
- **Learning-doc rot.** Bad/bloated guidance degrades future work. *Mitigation:
  evidence-backed `reflect`, integrate-and-prune edits, hard length cap.*
- **Host execution.** Agents run project commands on the user's machine, no sandbox.
  *Mitigation: it's the user's own repo (CLI trust model); sandboxing is later.*
- **Availability.** Local-first: work advances only while the app runs. *Mitigation:
  threads/queue persist; reopen restores; cloud execution is later.*

## 17. Success Metrics

- **North star:** **PRs opened/merged per active hour** — accepted change throughput
  per unit of human attention.
- **Queue leverage:** items drained per thread per session; share of turns run via
  Autorun vs. typed.
- **Verification quality:** rate of PRs approved without rework; behavioral bugs
  caught by the `test`/browser-in-the-loop path.
- **Suggestion uptake:** % of suggestions promoted vs. dismissed.
- **Compounding:** improvement in approval-without-rework over a project's life
  (evidence `reflect` is working).
- **Operational health (not a success metric):** rolling-24h spend per account
  (informational), thread/turn error rates.

## 18. Telemetry

The desktop app is a **new client on the existing logging pipeline**
(`docs/logging.md`) — no new infra. It logs with `@codebuff/logging` via `logger.*`
and ships analytics with `trackEvent(...)`, mirrored to the Axiom **`freebuff`**
dataset via `POST /api/logs` (Bearer-authed, batched), like the CLI.

- **Identity fields:** `source: 'desktop'`, `service: 'freebuff-desktop'`. Correlation
  keys reuse the standard ones: `user_id` = Freebuff account; `client_session_id` =
  one app launch; **`client_request_id` = the thread id** (so a thread's turns trace
  end-to-end). A `project_id` rides in `data` (JSON string; read via `parse_json`).
- **Events to emit** (the funnel + the health signals behind §17):

  | event | key `data` fields | powers |
  | --- | --- | --- |
  | `desktop.app_launched` | version, os | install→active funnel |
  | `desktop.project_opened` | project_id, repo | activation |
  | `desktop.thread_created` | thread_id | usage |
  | `desktop.turn_started` / `desktop.turn_completed` | thread_id, source (`user`/`skill`/`workflow`/`queue`), durationMs, cost | turn cost/latency |
  | `desktop.autorun_toggled` | thread_id, on | queue-leverage |
  | `desktop.queue_item_added` | thread_id, source, skill/workflow | queue composition |
  | `desktop.suggestion_proposed` / `desktop.suggestion_promoted` | thread_id, count | suggestion uptake |
  | `desktop.workflow_run` | thread_id, workflow, skill_count | process usage |
  | `desktop.pr_opened` | thread_id, pr_url, local? | **north star** |
  | `desktop.doc_written` | doc, by (`reflect`/`human`), cap_hit? | doc-rot/cap pressure |
  | `desktop.browser_check` | thread_id, rendered?, errors | verification quality |
  | `desktop.turn_failed` | thread_id, message | failure modes |

- **Cost levers are the standard ones:** ship `info`+ (drop `debug`), summarize large
  payloads rather than shipping diffs/transcripts verbatim, `data` truncated to
  ~64 KB; per-turn cost goes in `data`, not full prompt bodies.
