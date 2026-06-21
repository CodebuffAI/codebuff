# Operating Freebuff Desktop for end-to-end testing

A field guide for a coding agent that needs to drive the Freebuff Desktop
orchestrator end-to-end — start it, hand it a real project, let the real LLM build
it through the full pipeline, and verify the result — **without a human clicking
the UI**. Everything the React UI does is a thin wrapper over an HTTP+SSE API, so an
agent drives the exact same surface with `curl`.

Read [`freebuff-desktop-prd.md`](../freebuff-desktop-prd.md) for the product model
and [`freebuff-desktop-v1-gaps-and-roadmap.md`](../freebuff-desktop-v1-gaps-and-roadmap.md)
for known gaps. This doc is purely operational.

---

## 1. Mental model (what you're driving)

```
chat prompt ──► orchestrator decomposes into a task DAG (t1, t2, …)
                each task runs a pipeline: implement → simplify → review → test → pr
                → awaiting-approval  ──(human approves)──►  squash-merge to main
                                                            └─ unblocks dependents
                on review/test failure → blocked (human requests changes → re-run)
                on awaiting-approval, the Scout proposes follow-up tasks (a backlog)
```

- One Bun process (`server.ts`) is the orchestrator + HTTP/SSE server + static UI.
  No build step.
- Each **project is a git repo**. State (tasks, budget, docs) lives in
  `$TARGET_REPO/.freebuff/desktop.db` (bun:sqlite). Each task builds in its **own git
  worktree** branched from `main`; approval squash-merges that branch to `main`.
- The agents call the **real LLM** through the Codebuff web backend. There is no mock
  mode for a true E2E run — you need a working backend + API key (see §2).

---

## 2. Prerequisites (the easy-to-miss ones)

1. **A local backend on `:3000`.** The SDK/agent-runtime sends LLM traffic to
   `NEXT_PUBLIC_CODEBUFF_APP_URL` (see `packages/agent-runtime/src/llm-api/codebuff-web-api.ts`).
   The **production** host rejects the local dev key with `401`. So run the web app
   locally and point at it:
   ```bash
   export NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:3000   # NOT prod
   ```
   Start the web app separately (`bun --filter @codebuff/web dev` or the repo's
   normal dev flow) and confirm `:3000` is listening before starting builds.
2. **`CODEBUFF_API_KEY`** in the environment the server inherits (a dev key works
   against the local backend).
3. **Bun** (the runtime + package manager). Everything is `bun …`, not `node`/`npm`.
4. For the **test stage** to actually exercise UIs: system **Chrome** (Playwright
   drives it with `channel:'chrome'`) and **tmux** (the CLI runner). Missing either
   degrades the test stage, it doesn't crash the build.

---

## 3. Start the server

```bash
# from the repo root
TARGET_REPO=/Users/<you>/freebuff-projects/active \
PORT=8787 \
CONCURRENCY=2 \
  bun freebuff-desktop/src/app/server.ts
```

Env knobs (all optional, sane defaults):

| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `8787` | HTTP/SSE port |
| `TARGET_REPO` | `~/freebuff-desktop-demo` | the project repo to build in |
| `CONCURRENCY` | `2` | max tasks admitted to `running` at once |
| `ENABLE_SCOUT` | on | set `ENABLE_SCOUT=0` to silence follow-up proposals |
| `TEST_CMD` | `node --test` | the project's test command (run-config) |

The server prints `Freebuff Desktop orchestrator on http://localhost:8787` and the
target repo. If `$TARGET_REPO` has no `.git`, it seeds a tiny sample repo; if it's a
real repo it's left alone.

**Tip — use a symlink as `TARGET_REPO`** (`~/freebuff-projects/active`) so you can
repoint it at a new project between runs without changing the launch command. After
repointing, **restart the server** (it opens the DB at construction time).

---

## 4. Set up a fresh project to build

Each project is its own git repo on `main` with one initial commit:

```bash
cd ~/freebuff-projects
P=r5-03-piano
mkdir -p "$P" && cd "$P"
printf '# %s\n\nOne-line spec.\n' "$P" > README.md
git init -q && git add -A && git commit -q -m init && git branch -M main
ln -sfn ~/freebuff-projects/$P ~/freebuff-projects/active   # repoint the symlink
# then (re)start the server so it opens this project's .freebuff/desktop.db
```

Keep all test projects under one folder (e.g. `~/freebuff-projects/`) so they're
easy to review later.

---

## 5. The API surface (everything the UI calls)

| Method · Path | Purpose |
|---|---|
| `GET /api/state` | full snapshot: tasks (id, status, origin, stage, parents, title), budget |
| `GET /api/events` | SSE stream of engine events (logs, state changes, agent events) |
| `POST /api/chat` `{message}` | **send a build prompt** — orchestrator decomposes & starts |
| `GET /api/chat-history` | chat transcript |
| `POST /api/tick` | nudge the scheduler (admit ready work) — rarely needed by hand |
| `POST /api/run` `{command}` | run a shell command in the repo (utility) |
| `POST /api/task/:id/approve` | **approve & squash-merge** an `awaiting-approval` task |
| `POST /api/task/:id/request-changes` `{comments}` | send a blocked/again task back to implement |
| `POST /api/task/:id/abandon` | drop a task |
| `POST /api/task/:id/accept` | promote a Scout **proposed** task → ready (runs it) |
| `POST /api/task/:id/dismiss` | discard a Scout proposal |
| `GET /api/task/:id/artifacts` | stage artifacts incl. `blockReason`, test evidence, screenshots |
| `GET·POST /api/doc/:name` | read/save a project doc (e.g. `priorities`) |

Send a build like a human typing into chat:

```bash
curl -s -X POST http://localhost:8787/api/chat \
  -H 'content-type: application/json' \
  -d '{"message":"Build a playable web-audio piano in a single index.html …"}'
```

Write the prompt the way a user would: one clear paragraph stating the artifact, the
key behaviors, and hard constraints (e.g. "single index.html, no external libs").
The orchestrator decomposes it; you do **not** pre-split into tasks.

---

## 6. Task status machine (what to act on)

```
proposed ──promote──► ready ──admit──► running ──pipeline ok──► awaiting-approval
   │(scout: stays                                   │(review/test fail)
   │ until accept)                                  ▼
   │                                              blocked ──request-changes──► (re-runs)
   └─ human tasks auto-promote                awaiting-approval ──approve──► merged ──► unblocks dependents
```

- **`origin`** distinguishes `human` (your build's tasks) from `scout` (proposals).
  Drive only `human` tasks; leave `scout` `proposed` tasks unless you mean to run them.
- A task sitting at **`ready`** with incomplete parents is just waiting its turn —
  not stuck.

---

## 7. Drive a build headlessly (the core loop)

The whole point: a human normally clicks "Approve" on each task. Headless, you poll
state and approve `awaiting-approval` human tasks, and bounce `blocked` ones back.
A reusable driver:

```bash
cat > /tmp/drive.sh <<'EOF'
#!/bin/bash
BASE=http://localhost:8787
for i in $(seq 1 180); do
  STATE=$(curl -s $BASE/api/state)
  # approve human tasks waiting for approval
  echo "$STATE" | python3 -c "import sys,json;d=json.load(sys.stdin);print('\n'.join(t['id'] for t in d.get('tasks',[]) if t.get('origin')=='human' and t['status']=='awaiting-approval'))" \
    | while read T; do [ -n "$T" ] && curl -s -X POST $BASE/api/task/$T/approve >/dev/null && echo "approved $T"; done
  # retry blocked human tasks — empty comment lets the engine re-feed the gate's findings
  echo "$STATE" | python3 -c "import sys,json;d=json.load(sys.stdin);print('\n'.join(t['id'] for t in d.get('tasks',[]) if t.get('origin')=='human' and t['status']=='blocked'))" \
    | while read T; do [ -n "$T" ] && curl -s -X POST $BASE/api/task/$T/request-changes -H 'content-type: application/json' -d '{"comments":""}' >/dev/null && echo "retry $T"; done
  # done when every human task is merged
  echo "$STATE" | python3 -c "import sys,json;d=json.load(sys.stdin);h=[t for t in d['tasks'] if t.get('origin')=='human'];sys.exit(0 if h and all(t['status']=='merged' for t in h) else 1)" && { echo DONE; break; }
  sleep 5
done
EOF
chmod +x /tmp/drive.sh && nohup /tmp/drive.sh > /tmp/drive.log 2>&1 &
```

Notes:
- **`request-changes` with an empty comment is deliberate.** The engine prepends the
  gate's own `blockReason` into the next run's guidance, so an empty comment still
  re-feeds the findings (it won't thrash re-discovering the same issue).
- A real reviewer reads the diff. If you want to *simulate scrutiny*, fetch
  `/api/task/:id/artifacts`, read `blockReason`, and decide approve vs. request-changes
  yourself instead of auto-approving.

---

## 8. Watch progress efficiently (don't busy-poll)

Poll on a **5s cadence and only print transitions** — and watch for a specific
terminal condition rather than a fixed sleep. Run it backgrounded so the harness
notifies you on completion:

```bash
prev=""
for i in $(seq 1 90); do
  s=$(curl -s http://localhost:8787/api/state | python3 -c "import sys,json;d=json.load(sys.stdin);print(' '.join(t['id'][:2]+':'+t['status'] for t in d['tasks'] if t.get('origin')=='human'))")
  [ "$s" != "$prev" ] && echo "[$((i*5))s] $s" && prev="$s"
  echo "$s" | grep -qv ":merged" || { echo ALL_MERGED; break; }   # crude: all-merged
  sleep 5
done
```

A 4-task linear build is typically ~5–12 min wall-clock with the cheap model; the
**test stage (Playwright) dominates** per-task time.

---

## 9. Verify the outcome (don't trust "merged" alone)

`merged` means the gate passed and the branch landed on `main`. Then actually look:

```bash
cd ~/freebuff-projects/active
git log --oneline           # one commit per task, on main
wc -l index.html            # something got built
# spot-check the behavior the prompt demanded, e.g. div-by-zero handling:
grep -nE "isFinite|Infinity|Error" index.html
```

For UI behavior, do a real smoke instead of eyeballing source:
- The test-stage evidence is in `/api/task/:id/artifacts` (logic-test output +
  screenshots).
- Or open it yourself with the preview tools (`preview_start` on the project dir,
  `preview_snapshot`, `preview_click`, `preview_screenshot`) and confirm the actual
  behavior. **The browser test only proves "renders, no console errors" — it does not
  prove correctness** of an algorithm. For logic-heavy work, verify the logic directly.

---

## 10. The Scout backlog

After each task hits `awaiting-approval`, the Scout proposes follow-up tasks (shown
as a "💡 N suggestions" CTA / a Proposed column). They are a **reviewable backlog** —
they do **not** auto-run. Accept (`/accept`, runs it) or dismiss (`/dismiss`). The
backlog is capped (default 4 outstanding) so it can't grow without bound; the Scout
skips while full and resumes once you accept/dismiss some. Set `ENABLE_SCOUT=0` to
turn it off entirely for a quiet run.

---

## 11. Failure modes seen in practice (check these first)

- **"Built but dead."** The recurring trap: a feature is typecheck-clean and unit-
  tested in isolation yet inert live because of a flag/env-default/data-flow gap
  (e.g. Scout shipped behind a stale `enableScout:false`; gate stages silently
  skipped because they diffed committed history instead of the working tree). **Lesson:
  every feature needs a live smoke through the running app, not just isolation tests.**
- **Prod backend 401s the dev key.** If every agent call fails instantly, you're
  pointed at prod — set `NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:3000` and start
  the local web app (§2).
- **Tasks stuck at `running` after a restart.** Fixed: the engine requeues orphaned
  `running` → `ready` and kicks a tick on startup. If you see a stall, `POST /api/tick`.
- **A re-run loses prior work.** Fixed: re-runs rebase-keep the branch (reset only on a
  genuine sibling-merge conflict). If a retry seems to start from scratch, check the
  worktree wasn't hard-reset.
- **SDK resolves to the published package (401 / wrong version).** Any helper script
  must live **inside the workspace** (e.g. `freebuff-desktop/scripts/`) so it resolves
  the workspace `@codebuff/sdk` and honors the local-backend URL — not under `/tmp`.
- **tmux runner eats the first commands** if the shell sources a themed prompt — the
  runner uses `bash --norc --noprofile` for a clean prompt; keep it that way.
- **Playwright bundled-browser mismatch** — the browser tester uses system Chrome via
  `channel:'chrome'`; if Chrome isn't installed the test stage degrades.

---

## 12. Reference scripts (in `freebuff-desktop/scripts/`)

- `m1-e2e.ts` — drives a build and asserts the multi-surface test gate ran.
- `scout-test.ts` — verifies the Scout actually proposes grounded tasks.
- `smoke-sdk.ts` — minimal SDK round-trip against the local backend (sanity-check the
  key/URL before a full run).

Run with `bun freebuff-desktop/scripts/<name>.ts` from the repo root (so workspace
resolution + env apply).

---

## 13. Quick checklist for a clean E2E run

1. Local web backend up on `:3000`; `NEXT_PUBLIC_CODEBUFF_APP_URL` points at it;
   `CODEBUFF_API_KEY` set.
2. Fresh project repo on `main`; `active` symlink repointed (§4).
3. Start `server.ts` with `TARGET_REPO` → confirm the startup line + empty `/api/state`.
4. `POST /api/chat` with a clear one-paragraph prompt.
5. Start the driver (§7) and the transition-watcher (§8), backgrounded.
6. On "all merged", **verify the artifact** (§9) — source + a real browser/logic smoke.
7. Triage the Scout backlog (§10); record what fell short; fix; re-run.
