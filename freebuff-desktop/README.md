# @codebuff/freebuff-desktop

Freebuff Desktop — a GitHub-native coding-agent orchestrator. See the design doc /
PRD at [`docs/freebuff-desktop-prd.md`](../docs/freebuff-desktop-prd.md).

## Status: M0 (thin spine)

This package is being built up in layers per the PRD roadmap (§15). The current
layer is the **orchestration core** — the headless engine the Electron UI will sit
on top of:

```
src/core/
  types.ts        — domain model: Project, Thread, QueueItem, Skill, Workflow
  store.ts        — local SQLite persistence under .freebuff/ (bun:sqlite)
  graph.ts        — task-graph queries: unblocked tasks, cycle detection
  worktree.ts     — git worktree lifecycle + gh PR helpers (branches from main, §8)
  orchestrator.ts — the §19 tool surface (create_task, add_dependency, ...)
  pipeline.ts     — fixed per-task stage runner (implement→simplify→review→test→pr)
```

The core has no Electron or React dependency and is exercised with `bun test`.

### Architecture note (Electron + Bun)

Electron's main process runs Node, not Bun. To honor the PRD's "Bun main process"
(reuse `sdk/` and `agent-runtime` directly, which export Bun-targeted TS) the app is
structured as **an Electron UI shell + a Bun orchestrator process** it spawns and
talks to over local IPC.

```
electron/main.cjs (Node)                src/app/server.ts (Bun)
┌─────────────────────────┐  spawn   ┌───────────────────────────────┐
│ BrowserWindow            ├─────────►│ Engine (store/worktree/docs/   │
│  └ loads 127.0.0.1:PORT  │  HTTP/   │ scheduler/pipeline) +          │
│ child-process lifecycle  │◄── SSE ──┤ self-contained UI (index.html) │
└─────────────────────────┘          └───────────────────────────────┘
```

`electron/main.cjs` picks a free loopback port, spawns the Bun orchestrator with
that `PORT`, waits for `/api/state` to answer, then points the window at it. There is
no separate renderer build step — the Bun server serves the existing UI and the
window talks to it over fetch + EventSource, exactly as a browser would. The window
owns the orchestrator's lifecycle: closing/quitting the app stops the Bun process.

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
