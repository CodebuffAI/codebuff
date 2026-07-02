# Operating Freebuff Desktop for end-to-end testing

A field guide for a coding agent that needs to drive **Freebuff Desktop** end-to-end —
start it, hand it a real repo, let a real coding agent build through full turns, and
verify the result — **without a human clicking the UI**. Everything the React UI does
is a thin wrapper over a local HTTP + SSE API on one port, so an agent drives the exact
same surface with `curl`.

Read [`../../freebuff-desktop/README.md`](../../freebuff-desktop/README.md) for the
architecture (Electron shell + Bun orchestrator, the thread model) and
[`freebuff-desktop-prd.md`](../freebuff-desktop-prd.md) for the product model. This doc
is purely operational.

> **Model note.** Freebuff Desktop is the **thread model**, not the old task-DAG
> orchestrator (no `decompose → tasks → approve → squash-merge`, no Scout proposals,
> no `/api/chat`). If you find docs or scripts referring to those, they're stale — see
> §11.

---

## 1. Mental model (what you're driving)

```
each browser-style TAB is one THREAD
  └─ runs ONE full coding agent (the "harness") turn by turn
  └─ in its OWN git worktree (under <repo>/.freebuff/), branched from the default branch
  └─ fed by a per-thread QUEUE of upcoming prompts (auto-drains, top-down)

you POST a message ──► a turn runs ──► agent streams text/reasoning/tool-calls
                                   ──► turn ends (turnState: running → idle)
                                   ──► next queued item (if any) runs automatically
the assistant can PROPOSE follow-up prompts ──► park in the queue's "suggested" lane
                                                (promote to run them)
```

- **One Bun process** (`src/app/server.ts`) is the orchestrator + HTTP/SSE server, and
  in a packaged build also serves the built React UI. In dev the Vite server owns the
  UI and proxies `/api` + `/preview` to this process.
- **The harness** is pluggable, chosen per-thread (and a project-wide default):
  - `codebuff` — the hosted Codebuff agent via `@codebuff/sdk`. Needs a working
    Codebuff backend + auth (see §2).
  - `claude-code` — the user's **local authenticated Claude Code** (`@anthropic-ai/claude-agent-sdk`),
    reusing the terminal's subscription auth. No Codebuff key needed for the turn
    itself.
- **No approval gate.** A thread is a single agent running turns; there is no
  per-task "Approve" step. Branch/PR handling is the agent's job (e.g. the `open-pr`
  skill); the thread tracks an inferred `prState` (`none|open|merged|closed`).
- **State** lives in `<repo>/.freebuff/desktop.db` (bun:sqlite). The engine opens it at
  construction; **opening a different project rebuilds the engine** (no restart needed —
  `POST /api/project/open`).

---

## 2. Prerequisites (the easy-to-miss ones)

1. **For the `codebuff` harness: a Codebuff backend the SDK can reach.** The desktop's
   API host (sign-in, sessions, SDK) is `NEXT_PUBLIC_CODEBUFF_APP_URL`, defaulting to
   prod (`freebuff-desktop/src/app/api-host.ts`). Launched from the repo
   (`bun run app` / `dev` / `dev:web`), the direnv bun wrapper injects `.env.local`,
   so **repo launches target the LOCAL dev stack (localhost:3000)** — start the web
   app (`bun --filter @codebuff/web dev` or the repo's normal dev flow) and confirm
   `:3000` is listening before signing in or sending messages, or sign-in/turns fail.
   A non-prod host shows as a yellow `API: …` badge in the thread header. Shell env
   beats the wrapper's env file, so to force prod from a repo launch:
   ```bash
   NEXT_PUBLIC_CODEBUFF_APP_URL=https://www.codebuff.com bun run app
   ```
   (The **production** host rejects a local dev key with `401`.)
2. **Auth for the `codebuff` harness.** Either:
   - `CODEBUFF_API_KEY` in the orchestrator's environment (a dev key works against the
     local backend — easiest for headless runs), **or**
   - the in-app device-code login (`POST /api/auth/login/start`), which stores a token in
     `~/.config/freebuff-desktop`.
   The engine prefers the persisted login token, then falls back to `CODEBUFF_API_KEY`.
3. **For the `claude-code` harness: a logged-in local Claude Code.** It reuses your
   terminal subscription auth; no Codebuff key required for the turn. Sanity-check with
   `scripts/claude-smoke.ts` (§12).
4. **Bun** — the runtime + package manager. Everything is `bun …`, not `node`/`npm`.
5. For browser-in-the-loop checks (`browser_check` tool / test+review skills): system
   **Chrome** (Playwright drives it) and **tmux** (the harness shell runner). Missing
   either degrades those steps, it doesn't crash a turn.

---

## 3. Start it

Three ways, fastest-iteration last. All read `PORT` (default `8787`) and `TARGET_REPO`
for the orchestrator.

> ⚠️ **`bun --cwd freebuff-desktop run …` is broken in this repo.** Run the script
> path directly from the repo root, **or** `cd freebuff-desktop && bun run <script>`.

### a. Orchestrator + API only (best for headless / curl-driving)

```bash
# from the repo root (the bun wrapper's .env.local already targets localhost:3000)
CODEBUFF_API_KEY=<dev-key> \
TARGET_REPO=/Users/<you>/freebuff-projects/active \
PORT=8787 \
  bun freebuff-desktop/src/app/server.ts
```

Prints `Freebuff Desktop orchestrator on http://localhost:8787` and the target repo.
This serves the API immediately; it only serves the *built* UI if you've run
`bun run ui:build` first (not needed for curl-driving). Confirm readiness with the
dependency-free probe: `curl -s localhost:8787/healthz` → `ok`.

### b. Full web stack in a normal browser (no Electron)

```bash
cd freebuff-desktop && bun run dev:web      # → open http://localhost:5174
```

Starts the orchestrator on `:8787` **and** the Vite dev server on `:5174` (Vite proxies
`/api` + `/preview` to `:8787`). Opening `:5174` without the orchestrator gives a UI
stuck on "No threads open".

### c. Full Electron app

```bash
cd freebuff-desktop
bun run app          # builds UI + icons, launches Electron
bun run dev          # Vite + Electron, hot UI iteration
# point at a real repo instead of the bundled demo:
FREEBUFF_TARGET_REPO=/path/to/repo bun run app
```

Electron picks a free loopback port, spawns the orchestrator on it, waits for
`/api/state`, then points the window at it. Closing the window stops the orchestrator.

### Env knobs the orchestrator reads (`server.ts`)

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `8787` | HTTP/SSE port |
| `TARGET_REPO` | `~/freebuff-desktop-demo` | project repo to open at launch (falls back to the MRU recent project) |
| `TEST_CMD` | `node --test` | the project's test command (run-config used by the `test` skill) |
| `NEXT_PUBLIC_CODEBUFF_APP_URL` | prod | API host for sign-in, sessions, SDK (repo launches inherit localhost:3000 from `.env.local`; shell env wins) |
| `CODEBUFF_API_KEY` | — | fallback auth for the `codebuff` harness |
| `FREEBUFF_UI_DIR` | `…/dist-ui` | built SPA dir (set by the shell in packaged builds) |

If `$TARGET_REPO` has no `.git` **and** it's the default demo path, the server seeds a
tiny sample repo; a real repo is left alone.

---

## 4. Set up a fresh project to build

Each project is its own git repo. The engine creates per-thread worktrees under
`<repo>/.freebuff/`, so start from a clean repo on its default branch:

```bash
mkdir -p ~/freebuff-projects && cd ~/freebuff-projects
P=piano && mkdir -p "$P" && cd "$P"
printf '# %s\n\nOne-line spec.\n' "$P" > README.md
git init -q && git add -A && git commit -q -m init && git branch -M main
```

**Tip — use a symlink as `TARGET_REPO`** (`~/freebuff-projects/active`) so you can
repoint it between runs without changing the launch command:

```bash
ln -sfn ~/freebuff-projects/$P ~/freebuff-projects/active
```

You don't have to restart for a repo switch — the running server can open any repo:

```bash
curl -s -X POST localhost:8787/api/project/open \
  -H 'content-type: application/json' -d '{"path":"'"$PWD"'"}'
```

---

## 5. The API surface (everything the UI calls)

All `/api/*` routes enforce a **same-origin guard** (`origin-guard.ts`): a browser page
on another origin is rejected (DNS-rebinding defense). **`curl` passes** because it
sends no `Origin` header — non-browser clients are allowed.

### Snapshot & streams

| Method · Path | Purpose |
|---|---|
| `GET /healthz` | liveness — returns `ok` (use for the startup wait) |
| `GET /api/state` | full snapshot: `{project, threads[], agent, freebuff, previewReady, settings}` |
| `GET /api/events` | SSE stream of engine events (see §6) |
| `GET /api/thread/{id}` | one thread's full payload: `{thread, messages[], items[]}` |

### Threads

| Method · Path | Purpose |
|---|---|
| `GET /api/threads` | list open threads |
| `POST /api/threads` `{title?}` | **create a thread (tab)** → returns the `Thread` |
| `POST /api/thread/{id}/message` `{text, attachments?}` | **send a prompt — runs a turn** |
| `POST /api/thread/{id}/stop` | stop the running turn |
| `POST /api/thread/{id}/close` | close (keeps worktree + history for reopen) |
| `POST /api/thread/{id}/rehydrate` | restore a closed thread's file tree |
| `POST /api/thread/{id}/delete` | delete the thread |
| `POST /api/thread/{id}/agent` `{harnessId, model?}` | pin this tab's agent (`codebuff`/`claude-code`) + its model in one call (a premium Freebuff pick may be downgraded; returns resolved). Only before the thread starts — 409 once it has messages or a branch (agent/model/folder are fixed per thread) |
| `POST /api/thread/{id}/auto-queue-suggestions` `{on}` | auto-run assistant suggestions instead of parking them |

### Queue

| Method · Path | Purpose |
|---|---|
| `POST /api/thread/{id}/queue` `{prompt, label?}` | enqueue a prompt (auto-drains after the current turn) |
| `POST /api/thread/{id}/queue/skill` `{skill}` | enqueue a skill as a prompt |
| `POST /api/thread/{id}/queue/workflow` `{workflow}` | expand a workflow into one queued item per skill |
| `POST /api/thread/{id}/skill` `{skill}` | run a skill **now** (not queued) |
| `POST /api/thread/{id}/reorder` `{itemId, afterItemId?}` | reorder within the queue |
| `POST /api/queue/{itemId}/edit` `{prompt}` | edit a queued prompt |
| `POST /api/queue/{itemId}/delete` | remove a queued item |
| `POST /api/queue/{itemId}/promote` | promote a `suggested` item → `queued` |
| `POST /api/queue/{itemId}/demote` | move a `queued` item → `suggested` |

### Skills, workflows, docs, settings, project, utility

| Method · Path | Purpose |
|---|---|
| `GET /api/skills` · `GET /api/skills/search?q=` · `POST /api/skills/install` `{source,slug,name?}` · `POST /api/skill/{name}` `{prompt}` | manage skills |
| `GET /api/workflows` · `POST /api/workflow/{name}` `{skills[]}` | manage workflows |
| `GET·POST /api/doc/{name}` `{content}` | governing docs: `product`/`priorities`/`technical`/`learning` |
| `GET·POST /api/settings` `{settings}` | `.freebuff/settings.json` (e.g. `preview.entry`) |
| `POST /api/settings/agent` `{harnessId}` | set the **project-wide default** harness for new threads |
| `GET /api/auth/status` · `POST /api/auth/login/start` · `POST /api/auth/logout` | device-code auth |
| `GET /api/project/recents` · `POST /api/project/open` `{path}` · `GET /api/project/validate?path=` · `POST /api/project/init` `{path}` | open a project (folder choice itself is the native OS dialog; `validate` reports `needsInit` for non-repos, `init` runs `git init`) |
| `POST /api/run` `{command}` | run a shell command in the repo (utility) |

### Send a build like a human typing into a tab

```bash
BASE=http://localhost:8787
TID=$(curl -s -X POST $BASE/api/threads -H 'content-type: application/json' \
  -d '{"title":"piano"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

curl -s -X POST $BASE/api/thread/$TID/message \
  -H 'content-type: application/json' \
  -d '{"text":"Build a playable web-audio piano in a single index.html with no external libs. White and black keys, mouse + keyboard input, correct note frequencies."}'
```

Write the prompt the way a user would: one clear paragraph stating the artifact, the
key behaviors, and hard constraints. The agent runs it as a turn; you don't pre-split
into tasks.

---

## 6. SSE events & turn lifecycle (how to know a turn is done)

`GET /api/events` streams these (`EngineEvent`), plus `: ping` heartbeat comments
every 25s:

| `type` | Payload | Meaning |
|---|---|---|
| `state` | `{snapshot}` | full snapshot changed (also sent once on connect) |
| `thread` | `{threadId, thread, items}` | a thread's row or queue changed (also one per open thread on connect) |
| `agent` | `{threadId, event}` | a streamed agent event for a turn (`text`, `reasoning`, `tool_call`, `finish`, `error`) |
| `prompt` | `{threadId, text}` | a prompt was injected (e.g. a queue item starting) |
| `log` | `{level, message}` | engine log line |

**Turn lifecycle.** `POST …/message` (or a draining queue item) calls `runTurn`, which:

```
thread.turnState: idle → running     (emits a `thread`/`state` event)
  └─ streams `agent` events (text / reasoning / tool_call) …
thread.turnState: running → idle      (emits a `thread`/`state` event)
thread.lastTurnOutcome = completed | stopped | error
  └─ if the queue has a next item, it starts automatically
```

**Completion detection, two ways:**
- **SSE (preferred):** watch `thread` events; the thread is settled when
  `turnState === 'idle'` **and** its `items` contains no `queued`/`running` item.
- **Poll:** `GET /api/thread/{id}` and check the same condition. `lastTurnOutcome`
  distinguishes a clean finish from `stopped`/`error`.

---

## 7. Drive a build headlessly (the core loop)

A human watches the tab and types follow-ups. Headless, you create a thread, send the
build, then wait for the thread to settle — optionally enqueuing follow-ups or skills.
A reusable driver:

```bash
cat > /tmp/drive.sh <<'EOF'
#!/bin/bash
BASE=http://localhost:8787
TID="$1"
for i in $(seq 1 240); do
  T=$(curl -s $BASE/api/thread/$TID)
  python3 - "$T" <<'PY'
import sys,json
d=json.loads(sys.argv[1])
th=d["thread"]; items=d.get("items",[])
pending=[it for it in items if it["state"] in ("queued","running")]
running = th["turnState"]=="running" or pending
print(f'turn={th["turnState"]} outcome={th.get("lastTurnOutcome")} pending={len(pending)}')
sys.exit(1 if running else 0)
PY
  [ $? -eq 0 ] && { echo SETTLED; break; }
  sleep 5
done
EOF
chmod +x /tmp/drive.sh && /tmp/drive.sh "$TID"
```

Notes:
- **The queue auto-drains** — enqueue follow-ups (`…/queue`) and they run after the
  current turn with no extra nudge. There is no `/tick` and no approval step.
- **To run gate-style passes**, enqueue skills/workflows (e.g. a `test`/`review`
  skill) instead of approving tasks: `POST …/queue/skill {skill:"test"}`.
- A turn that **errors** sets `lastTurnOutcome:"error"` and stops draining that item —
  read the `agent` `error` event (or the thread's last message) to see why.

---

## 8. Watch progress efficiently (don't busy-poll)

Prefer the SSE stream (`curl -N $BASE/api/events`) and react to `thread`/`agent`
events. If you must poll, do it on a **5s cadence and only print transitions**, and
watch for the settled condition rather than a fixed sleep — and background it so the
harness notifies you on completion:

```bash
prev=""
for i in $(seq 1 120); do
  s=$(curl -s http://localhost:8787/api/thread/$TID | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['thread']['turnState'], d['thread'].get('lastTurnOutcome'), len([x for x in d['items'] if x['state'] in ('queued','running')]))")
  [ "$s" != "$prev" ] && echo "[$((i*5))s] $s" && prev="$s"
  echo "$s" | grep -q "^idle .* 0$" && { echo SETTLED; break; }
  sleep 5
done
```

A single web build is typically a few minutes wall-clock on the cheap model; a
`browser_check`/test skill dominates per-turn time when present.

---

## 9. Verify the outcome (don't trust "idle" alone)

`turnState:idle` + `lastTurnOutcome:completed` means the turn finished cleanly — it does
**not** prove the artifact is correct. The work lives in the **thread's worktree**, not
the repo root, until the agent merges/PRs it:

```bash
# find the thread's branch/worktree from the snapshot
curl -s localhost:8787/api/thread/$TID | python3 -c "import sys,json;t=json.load(sys.stdin)['thread'];print(t['branch'], t['worktreePath'], t['prState'])"

cd <worktreePath>
git log --oneline
ls; wc -l index.html
grep -nE "isFinite|Infinity|Error" index.html   # spot-check demanded behavior
```

For UI behavior, do a real smoke instead of eyeballing source:
- **Per-thread live preview:** the server serves a thread's worktree at
  `http://localhost:PORT/thread-preview/{threadId}/` (the project root is at `/preview`).
  This is exactly what the `browser_check` tool loads.
- Or open it with the preview tools (`preview_start` on the worktree dir,
  `preview_snapshot`, `preview_click`, `preview_screenshot`) and confirm actual behavior.
  **A render check only proves "renders, no console errors" — it does not prove
  correctness** of an algorithm. For logic-heavy work, verify the logic directly.

> **rAF gotcha:** `browser_check` is blind to `requestAnimationFrame`-driven games when
> the tab is backgrounded (rAF pauses). For animation/game loops, screenshot a
> foregrounded preview instead.

---

## 10. Skills, workflows & governing docs

- **Skills** are reusable named prompts (`.freebuff/skills/<name>.md`, plus built-ins).
  Run one now (`…/skill`) or queue it (`…/queue/skill`). Acquire more from the
  skills.sh registry via `…/skills/search` + `…/skills/install`.
- **Workflows** are named ordered lists of skills; queuing one expands into one queued
  item per skill (`…/queue/workflow`).
- **Governing docs** (`product`/`priorities`/`technical`/`learning`) are length-capped
  markdown the agent reads for context; the `reflect` skill appends durable learnings to
  `learning`. Read/write via `/api/doc/{name}`.
- **Assistant suggestions** park in the queue's `suggested` lane; `promote` to run them,
  or flip `auto-queue-suggestions` on so they drain automatically.

---

## 11. Failure modes seen in practice (check these first)

- **Stale docs/scripts referencing the old task model.** Anything mentioning
  `decompose`, `tasks`, `awaiting-approval`, `approve/squash-merge`, Scout proposals,
  `/api/chat`, `buildStageExecutors`, or `store.insertTask` predates the thread-model
  rewrite. The old task-model reference scripts (`m1-e2e`, `scout-test`, `seed-demo`)
  have been removed; use the live scripts in §12.
- **Prod backend 401s the dev key (codebuff harness).** If every turn fails instantly,
  you're pointed at prod — check the yellow `API:` badge / the orchestrator's
  "Freebuff API host" log line; repo launches should inherit localhost:3000 from
  `.env.local` (§2). Conversely, sign-in hanging on a repo launch usually means the
  local web app isn't up.
- **`claude-code` harness "not authed".** It reuses local Claude Code's subscription
  auth — make sure `claude` is logged in. Sanity-check with `scripts/claude-smoke.ts`.
- **UI stuck on "No threads open" in the browser.** You opened `:5174` without the
  orchestrator — use `bun run dev:web` (starts both), not Vite alone.
- **`bun --cwd freebuff-desktop run …` does nothing useful.** Known-broken in this repo
  (§3). Run the script path from repo root or `cd` in first.
- **Tasks "stuck running" after a restart.** On startup the engine flips orphaned
  `running` threads back to `idle` and auto-resumes turns that were genuinely in flight
  at quit (gated on `wasRunning`). A lingering "running" with no `agent` events is
  usually a dead turn — `stop` it and re-send.
- **`browser_check` blind to rAF games.** See the rAF gotcha in §9.
- **Playwright/Chrome mismatch.** The browser check uses system Chrome via Playwright;
  if Chrome isn't installed the check degrades (the turn still completes).
- **Cross-origin 403 on `/api/*`.** A browser page on a non-allowed origin is blocked by
  the origin guard. `curl` is fine (no `Origin` header); if you script from a page, use
  the same origin or the dev proxy.

---

## 12. Reference scripts (in `freebuff-desktop/scripts/`)

- `smoke-sdk.ts` — minimal `@codebuff/sdk` round-trip (custom tool on a cheap model)
  against the configured backend. Sanity-check key + URL before a full run:
  `NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:3000 bun freebuff-desktop/scripts/smoke-sdk.ts`
- `claude-smoke.ts` — one-turn smoke of the **Claude Code harness** against local
  authenticated Claude Code (creates a temp repo, asks it to write a file, verifies it
  landed): `bun freebuff-desktop/scripts/claude-smoke.ts`
- `dev.ts` / `dev-web.ts` — the dev launchers behind `bun run dev` / `bun run dev:web`.

Run scripts from the repo root (so workspace resolution + env apply):
`bun freebuff-desktop/scripts/<name>.ts`.

---

## 13. Quick checklist for a clean E2E run

1. Pick a harness. For `codebuff`: local backend up on `:3000` (repo launches target
   it via `.env.local` — confirm with the yellow `API:` badge), `CODEBUFF_API_KEY` set
   (or logged in). For `claude-code`: local `claude` is logged in.
2. Fresh project repo on its default branch; `active` symlink repointed (§4).
3. Start the orchestrator (§3a) → `curl localhost:8787/healthz` returns `ok`;
   `GET /api/state` shows the repo and no threads.
4. `POST /api/threads` to create a tab, then `POST …/message` with a clear
   one-paragraph prompt (§5).
5. Drive/watch via SSE or the poller (§7–8), backgrounded.
6. On settle, **verify the artifact** in the thread's worktree — source + a real
   browser/logic smoke via `/thread-preview/{id}/` (§9).
7. Enqueue follow-up skills/workflows as needed; record what fell short; fix; re-run.
