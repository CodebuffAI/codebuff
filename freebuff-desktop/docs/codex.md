# Codex in Freebuff Desktop

Codex is one of the three pluggable agent **harnesses** a thread can run on
(alongside the hosted Freebuff agent and Claude Code). It drives the user's
**local, ChatGPT-authenticated Codex CLI** via `@openai/codex-sdk`, reusing their
`~/.codex` login with no API-key plumbing — exactly how the Claude Code harness
reuses the Anthropic subscription.

Code: `src/app/agents/codex-harness.ts` (+ `freebuff-mcp-server.ts`,
`src/core/codex-models.ts`). This doc is the "why", not a line-by-line tour.

## How it works

- **Auth** — the SDK spawns `codex exec`, which reads the credentials
  `codex login` stored in `~/.codex/auth.json`. This only works when **no**
  `OPENAI_API_KEY` / `CODEX_API_KEY` is set (a key overrides the subscription
  login), so `codexEnv()` strips both before spawning. `CODEX_HOME` relocates the
  config dir (used in tests: fresh `HOME` for isolation + real `CODEX_HOME`).
- **Model** — GPT-5.5 (`src/core/codex-models.ts`), persisted per-thread
  (`schema v16`, `codex_model`). The `-codex` variants (e.g. `gpt-5.5-codex`) are
  deliberately **not** offered: they `400` on a ChatGPT-account login, which is
  this harness's only auth path.
- **Streaming** — the SDK surfaces Codex's JSONL as typed `ThreadEvent`s. Codex
  buffers a whole reasoning block / assistant message and emits it once at
  `item.completed` (no token-level deltas like Claude Code). `consumeCodexStream`
  folds these into the shared parts model: reasoning → `onReasoning`,
  agent_message → `onText`, and command/file/mcp/web/todo items → `tool_call`
  (command & mcp emit on `item.started` so the call shows as it's dispatched; the
  rest on `item.completed`). MCP calls surface as `mcp__<server>__<tool>` so the
  UI's `formatTool` strips the prefix like it does for Claude Code.
- **Resume** — the `thread.started` event's `thread_id` is carried back as the
  harness state, so the next turn `resumeThread(id)` keeps context/caching.
- **Autonomy** — `sandboxMode: 'danger-full-access'` + `approvalPolicy: 'never'`,
  the direct analog of the Claude Code harness's `bypassPermissions` (see the
  sandbox trade-off below).
- **Signed out** — an unauthenticated CLI throws `CodexAuthError`, which the
  engine renders as a `codex-auth` recovery card ("Open Terminal" + copy
  `codex login`), mirroring the Claude Code auth card.

## Custom Freebuff tools over a local MCP server

The Codebuff/Claude harnesses expose `suggest_prompts` / `write_doc` /
`browser_check` to the model. Codex has **no in-process tool transport**, so each
turn stands up a tiny localhost **streamable-HTTP MCP server**
(`freebuff-mcp-server.ts`) whose handlers close over that turn's `ThreadToolDeps`,
and points Codex at it via `config.mcp_servers.freebuff.url`. The server is
hand-rolled (a small JSON-RPC subset: `initialize` / `tools/list` / `tools/call`
/ notifications) rather than using `@modelcontextprotocol/sdk` — see the zod
trade-off below.

**Access control.** Even on 127.0.0.1 for a few seconds on a random port, the
handlers have side effects (write files, launch a browser), so every request must
carry a **per-turn bearer token** (minted per turn, handed to Codex via
`mcp_servers.freebuff.http_headers`) **and** a loopback `Host` header. This blocks
any stray local process or DNS-rebinding webpage from reaching the tools during
the turn's window.

## Availability (we don't bundle Codex)

The `codex` binary is ~240 MB/platform — too heavy to ship in the installer. So
the packaged app uses the user's **installed** `codex`:

- `resolveCodexExecutable()` — `FREEBUFF_CODEX_PATH` override → the SDK's own
  bundled binary when `@openai/codex` is on disk (dev) → the user's installed
  codex (packaged, no `node_modules`).
- When no codex is available, `isCodexAvailable()` is false and the engine marks
  the Codex option **disabled** in the picker (greyed, "Not installed", with an
  install tooltip); the `/api/thread/{id}/agent` route also `400`s a Codex pick.
- Env knobs: `FREEBUFF_CODEX_PATH` (force a specific binary),
  `FREEBUFF_CODEX_DISABLED=1` (force the agent off), `CODEX_HOME` (config dir).

## Trade-offs we hit (and how we resolved them)

| Decision | Options | Chose | Why / cost |
|---|---|---|---|
| **Binary distribution** | bundle (+240 MB) · use installed codex · download-on-demand | **installed codex** | Small installer; but only works if the user has codex (hence the disabled picker state) and runs *their* version (protocol-drift risk). Download-on-demand is the "best of both" follow-up. |
| **Sandbox** | `workspace-write` (seatbelt, worktree-confined) · `danger-full-access` (no sandbox) | **`danger-full-access`** | Matches Claude Code's `bypassPermissions`, and `workspace-write`'s macOS seatbelt gets SIGKILLed when Freebuff runs inside a nested sandbox (CI/dev). Cost: no OS confinement — a prompt injection could act outside the worktree. Revisit: prefer `workspace-write` on real machines with a full-access fallback. |
| **CLI wrapper** | `@openai/codex-sdk` · raw-spawn `codex exec --experimental-json` | **SDK** (for now) | Insulates us from the *experimental* JSON flag/schema churn and keeps parity with Claude Code (also SDK-wrapped). But the SDK is a thin wrapper and `consumeCodexStream` is already SDK-agnostic, so dropping it later is contained. Cost: a heavy dev-only dependency. |
| **MCP server** | `@modelcontextprotocol/sdk` · hand-rolled JSON-RPC | **hand-rolled** | The monorepo pins zod to **v4** (root `overrides`); the MCP SDK needs zod **v3** and its internals throw under v4. Hand-rolling the small subset Codex uses also drops a dependency. |
| **Model id** | `gpt-5.5` · `gpt-5.5-codex` | **`gpt-5.5`** | The `-codex` variants `400` on ChatGPT-account auth. |

## Future ideas

- **Download-on-demand binary** — fetch the SDK-pinned `@openai/codex-<platform>`
  into app-support on first Codex turn, cache it, and point `codexPathOverride`
  there. Gives version consistency (kills the protocol-drift risk) and works
  without an installed codex — all without a bigger installer. Caveats: a one-time
  ~80–100 MB download, first-turn latency, and macOS quarantine/Gatekeeper on the
  fetched binary.
- **Prefer `workspace-write`** on end-user machines (OS-confined to the worktree),
  falling back to `danger-full-access` only where the seatbelt can't run.
- **Drop the SDK**, spawning `codex exec --experimental-json` directly — removes
  the heavy dependency and the dev-vs-packaged binary-resolution split, since the
  stream consumer is already decoupled. Weigh against owning the experimental CLI
  surface.
- **Refresh availability** without an app restart (a "Recheck" affordance), so
  installing codex mid-session enables the picker.
- **Token-level streaming** if/when Codex's JSON mode exposes deltas (today
  reasoning/messages arrive buffered at `item.completed`).
- **Multimodal** — forward attached images as SDK content instead of relying on
  Codex reading the referenced path.
- **Quieter auth failures** — suppress the item-level `401` transport note that
  currently prints just before the sign-in recovery card.

## Testing

- Unit: `codex-harness.test.ts` (stream mapping, error/auth classification, env,
  resolver, availability), `freebuff-mcp-server.test.ts` (JSON-RPC + the
  token/Host access control).
- Manual: `scripts/codex-smoke.ts` runs one real Codex turn against the local
  login (mirrors `scripts/claude-smoke.ts`).
- End-to-end via the HTTP/SSE API: see `docs/desktop/e2e-testing.md` — set
  `CODEX_HOME=~/.codex` alongside a fresh `HOME` so the harness reuses the real
  login while the orchestrator stays isolated.
