# @codebuff/freebuff-desktop

Freebuff Desktop — a GitHub-native coding-agent orchestrator. See the design doc /
PRD at [`docs/freebuff-desktop-prd.md`](../docs/freebuff-desktop-prd.md).

## Architecture

Freebuff Desktop is the **thread model**: each browser-style tab is one thread
running a single full coding agent (the **harness** — hosted Codebuff or the
user's local Claude Code), turn by turn, in its own git worktree, fed by a
per-thread queue. It's structured as an **Electron UI shell + a Bun orchestrator
process** the renderer drives over local HTTP + SSE.

The orchestration core (`src/core/`) has no Electron or React dependency and is
exercised with `bun test`:

```
src/core/
  types.ts          — domain model: Project, Thread, QueueItem, Skill, Workflow
  store.ts          — local SQLite persistence under .freebuff/ (bun:sqlite)
  worktree.ts       — per-thread git worktree lifecycle (create / closeOut / remove)
  parts.ts          — fold streamed agent events into ordered render parts
  skills.ts         — built-in + user/global skill files; default workflows
  skill-registry.ts — skills.sh registry client (search / download)
  settings.ts       — .freebuff/settings.json (preview entry, …)
  docs.ts           — governing-doc store (length-capped markdown files)
  attachments.ts    — file/photo/folder attachment blocks
  browser-check.ts  — headless-browser render check (playwright)
  exec.ts           — process runner for git
  queue-order.ts    — fractional position ordering for the queue
```

`src/app/thread-engine.ts` is the engine that drives all of the above; the
pluggable agents live in `src/app/agents/` (see `harness.ts`).

### Electron + Bun split

Electron's main process runs Node, not Bun. To reuse `sdk/` (Bun-targeted TS) the
engine runs in a spawned Bun process the renderer drives over HTTP/SSE.

```
electron/main.cjs (Node)                src/app/server.ts (Bun)
┌─────────────────────────┐  spawn   ┌───────────────────────────────┐
│ BrowserWindow            ├─────────►│ ThreadEngine (store/worktree/  │
│  └ loads 127.0.0.1:PORT  │  HTTP/   │ docs/skills/harnesses) +       │
│ child-process lifecycle  │◄── SSE ──┤ the built React UI             │
└─────────────────────────┘          └───────────────────────────────┘
```

`electron/main.cjs` picks a free loopback port, spawns the Bun orchestrator with
that `PORT`, waits for `/api/state` to answer, then points the window at it. The
renderer is built by Vite (`bun run ui:build` → `dist-ui/`); the Bun server serves
that build and the window talks to it over fetch + EventSource. The window owns the
orchestrator's lifecycle: closing/quitting the app stops the Bun process.

It runs the orchestrator one of two ways (`resolveOrchestrator()` in `main.cjs`):

- **dev** — spawns a system `bun` on the TS source (`src/app/server.ts`).
- **packaged** — spawns the Bun binary shipped in app resources on the pre-bundled
  `orchestrator.js`. The user needs no system Bun. See **Packaging** below.

## Run

```bash
# Launch the desktop app (Electron shell + Bun orchestrator)
bun --cwd freebuff-desktop run app

# Point it at a real repo instead of the bundled demo repo
FREEBUFF_TARGET_REPO=/path/to/repo bun --cwd freebuff-desktop run app

# Just the orchestrator + UI in a browser (no Electron window), for fast iteration
PORT=8787 bun --cwd freebuff-desktop run app:server   # then open http://localhost:8787

bun test --cwd freebuff-desktop      # unit tests for the core
bun --cwd freebuff-desktop run typecheck
```

Env vars consumed by the shell: `FREEBUFF_TARGET_REPO` (repo to operate on) and
`FREEBUFF_BUN_PATH` (override the `bun` binary if it isn't on `PATH`). The
orchestrator itself reads `PORT`, `TARGET_REPO`, `TEST_CMD`, `CONCURRENCY`, and
`ENABLE_SCOUT` (see `src/app/server.ts`).

## Packaging (distributable app)

A packaged build ships its own Bun, so end users need nothing installed.

```bash
bun --cwd freebuff-desktop run dist        # → dist/ (.app + .dmg for the host OS)
bun --cwd freebuff-desktop run dist:dir    # unpacked .app only (fast, for testing)
```

`dist` runs `prepackage` then [electron-builder](https://www.electron.build/)
(config lives in `package.json` under `"build"`). `prepackage` produces a
`staging/` dir that electron-builder copies in as `extraResources`:

```
scripts/fetch-bun.ts          → staging/bun/bun          (the Bun runtime; copies
                                                           host Bun, or downloads the
                                                           pinned release for --target)
scripts/build-orchestrator.ts → staging/orchestrator/    (orchestrator.js bundled with
                                  orchestrator.js          `Bun.build`, plus ui/ and a
                                  ui/index.html            minimal playwright node_modules
                                  node_modules/            kept external because it uses
                                  *.scm                     dynamic requires)
```

`build-orchestrator.ts` bakes the `NEXT_PUBLIC_*` client env into the bundle at
build time via `Bun.build`'s `define` (same mechanism as the CLI binary —
`cli/scripts/build-binary.ts`), because `@codebuff/common` validates those at
import and throws otherwise. Values come from the build environment: `.env.local`
locally (dev), GitHub Secrets in CI (prod).

In the packaged app, `main.cjs` resolves `process.resourcesPath/bun/bun` and
`…/orchestrator/orchestrator.js`, sets `FREEBUFF_UI_PATH` to the shipped UI, and
runs with the orchestrator dir as cwd so the bundled `import 'playwright'`
resolves.

**Not yet wired (next milestones, out of scope for packaging):**
- **Auth.** The orchestrator needs `CODEBUFF_API_KEY` to construct its SDK client.
  Dev inherits it from the shell; a distributed app needs a login flow that
  supplies it (cf. the freebuff CLI's session/credential store). Until then, launch
  a packaged build with `CODEBUFF_API_KEY` in the environment.
- **Code signing / notarization.** `mac.identity` is `null` (unsigned). Shipping to
  users needs an Apple Developer cert + notarization (and equivalents on Win/Linux).
- **Cross-platform Bun.** `fetch-bun.ts --target <platform-arch>` downloads the
  right Bun, but cross-building the Electron app itself still needs the matching
  host or CI runner.
