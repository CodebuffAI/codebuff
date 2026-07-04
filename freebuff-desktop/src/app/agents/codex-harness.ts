/**
 * Codex harness: runs a thread turn through the user's LOCAL, already-
 * authenticated Codex CLI via the official Codex SDK (`@openai/codex-sdk`).
 *
 * Why this works with no key plumbing: the SDK spawns the resolved `codex` CLI
 * (see resolveCodexExecutable), which reads the same credentials the user
 * established with `codex login` (their
 * ChatGPT/OpenAI subscription token in ~/.codex/auth.json). So "switch the agent
 * to Codex" literally reuses the terminal session's auth — provided no
 * `OPENAI_API_KEY` / `CODEX_API_KEY` is set to override it. The model is the
 * thread's pick (see core/codex-models.ts), defaulting to GPT-5.5.
 *
 * Streaming: the SDK surfaces Codex's JSONL events as typed `ThreadEvent`s. Codex
 * buffers a whole assistant message / reasoning block and emits it once at
 * `item.completed` (no token-level deltas like Claude Code), so we forward:
 *   - reasoning       item.completed → onReasoning (whole block)
 *   - agent_message   item.completed → onText      (whole message)
 *   - command / mcp   item.started   → tool_call   (shown as the call is made)
 *   - file_change / web_search / todo_list item.completed → tool_call
 * The `thread.started` event carries the thread id (threaded back in as `resume`
 * for the next turn, so context/caching persist).
 *
 * Autonomy: sandbox `danger-full-access` + `approvalPolicy: 'never'` let it
 * read/write/edit and run shell in the thread's git worktree without prompts —
 * the direct analog of the Claude Code harness's `bypassPermissions`, which a
 * headless desktop agent needs (each thread already runs in its own isolated
 * worktree branch). We deliberately skip Codex's own macOS seatbelt sandbox:
 * besides matching Claude Code's posture, the nested seatbelt is SIGKILLed when
 * Freebuff itself runs inside a constrained/sandboxed environment.
 *
 * Steering & images mirror the Claude Code harness: a turn runs to completion
 * (mid-turn chat becomes the next turn), and attached images are viewed by Codex
 * reading the path referenced in the prompt text rather than as SDK content.
 *
 * Freebuff custom tools (suggest_prompts / write_doc / browser_check): the Codex
 * SDK has no in-process tool transport, so we stand up a localhost MCP server for
 * the turn (see freebuff-mcp-server.ts) and point Codex at it via
 * `config.mcp_servers.freebuff.url`. Its handlers call this turn's `toolDeps`, so
 * Codex gets the same tools the other harnesses do; the suggest-follow-ups
 * guidance is appended to the prompt (Codex has no SDK system-prompt hook).
 */

import { accessSync, constants as fsConstants, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

import { Codex, type ThreadEvent, type ThreadItem } from '@openai/codex-sdk'

import { NOTICE_CODEX_AUTH } from '../../core/parts'
import { CODEX_MODEL } from '../models'
import { startFreebuffMcpServer } from './freebuff-mcp-server'
import type { AgentHarness, HarnessCallbacks, HarnessResult, HarnessTurn } from './harness'
import { SUGGEST_PROMPTS_GUIDANCE } from './thread-tools'

interface CodexState {
  threadId?: string
}

/** The MCP server name codex sees our tools under; its tools surface back through
 *  the stream as `mcp_tool_call` items with `server: 'freebuff'`, which the harness
 *  re-emits as `mcp__freebuff__<tool>` (formatTool strips the prefix). */
const FREEBUFF_MCP_SERVER = 'freebuff'

/**
 * Appended to each turn's prompt so Codex ends finished work with follow-up
 * suggestions, the same way the Codebuff/Claude harnesses do via their system
 * prompts (Codex exposes no SDK system-prompt hook, so it rides on the prompt).
 * The tool reaches Codex as a `freebuff` MCP tool; we describe the behaviour
 * rather than lean on the qualified name.
 */
const CODEX_SYSTEM_APPEND = `This thread runs inside the Freebuff desktop app, which has a per-thread queue of follow-up prompts beside the chat.

${SUGGEST_PROMPTS_GUIDANCE}`

/**
 * The local Codex CLI refused the turn because it isn't authenticated (never ran
 * `codex login`, or the stored ChatGPT/OpenAI token expired/was revoked, or an
 * `OPENAI_API_KEY` override is invalid). The raw error quotes terminal-oriented
 * advice that's meaningless inside Freebuff — so the engine treats this class
 * specially: the message below is user-facing, and the UI renders it as a
 * recovery card (see NOTICE_CODEX_AUTH) instead of a bare turn failure.
 */
export class CodexAuthError extends Error {
  /** The SDK's original error text, kept for logs/diagnosis. */
  readonly causeMessage: string

  constructor(causeMessage: string) {
    super(
      'This agent runs your local Codex CLI, which is signed out. To fix it, sign in from ' +
        'a terminal: run `codex login`, finish the sign-in in your browser, then resend ' +
        'your message here. Or switch this thread to a Freebuff agent from the selector in ' +
        'the title bar.',
    )
    this.name = 'CodexAuthError'
    this.causeMessage = causeMessage
  }
}

/**
 * Does the error text mean "the CLI isn't authenticated"? Matched against Codex's
 * auth failure copy: not logged in / run `codex login`, an expired-or-revoked
 * ChatGPT token, and 401/unauthorized from the backend. Deliberately narrow so an
 * arbitrary 401 quoted from the user's own project tooling isn't misclassified as
 * a Codex sign-in problem.
 */
function isCodexAuthErrorMessage(message: string): boolean {
  return /not (logged in|authenticated)|run (`|')?codex login|please (log|sign) ?in|chatgpt (login|token) (has |was |been )?(expired|revoked)|(401|unauthorized|unauthenticated)/i.test(
    message,
  )
}

/** Map a stream/spawn error to a typed/actionable error: {@link CodexAuthError}
 *  for auth failures, a clear "install Codex" message when the SDK can't find its
 *  CLI binary (packaged app, no installed codex); anything else unchanged. */
export function translateCodexError(err: unknown): unknown {
  if (err instanceof CodexAuthError) return err
  const message = err instanceof Error ? err.message : String(err)
  if (isCodexAuthErrorMessage(message)) return new CodexAuthError(message)
  if (isCodexMissingCliMessage(message)) return new Error(CODEX_NOT_INSTALLED_MESSAGE)
  return err
}

/** Narrow an opaque {@link HarnessTurn.previousState} to this harness's own state
 *  shape before trusting it, so a foreign object starts a fresh thread (no
 *  resume) instead of being fed to `resumeThread`. */
function isCodexState(v: unknown): v is CodexState {
  if (typeof v !== 'object' || v === null) return false
  const s = (v as CodexState).threadId
  return s === undefined || typeof s === 'string'
}

/**
 * Env handed to the spawned Codex CLI. The whole point of this harness is to
 * reuse the user's local ChatGPT/OpenAI login (stored in ~/.codex/auth.json) — but
 * that's only used when no `OPENAI_API_KEY` / `CODEX_API_KEY` is present, since an
 * API key OVERRIDES the subscription login. The desktop process inherits a `.env`
 * (Bun auto-loads it); left in place a stray OpenAI key would leak into the CLI
 * and bypass / break the subscription auth.
 *
 * The SDK REPLACES (does not merge) the subprocess env when `env` is set, so we
 * spread `process.env` and delete only the key overrides — keeping PATH/HOME/etc.
 * intact (the CLI needs PATH to run shell commands). The SDK requires string
 * values, so undefined entries are dropped.
 */
export function codexEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) out[k] = v
  }
  delete out.OPENAI_API_KEY
  delete out.CODEX_API_KEY
  return out
}

/** Is the SDK's own version-matched Codex binary present on disk (i.e. is
 *  `@openai/codex` installed as a node_modules dependency)? True in dev; false in
 *  the packaged app, whose orchestrator is a single Bun bundle with no
 *  node_modules. Used to decide whether to let the SDK resolve its bundled binary
 *  or to fall back to the user's installed Codex. */
function sdkBundledCodexOnDisk(): boolean {
  try {
    createRequire(import.meta.url).resolve('@openai/codex/package.json')
    return true
  } catch {
    return false
  }
}

/**
 * Locate a user-INSTALLED Codex CLI (well-known install locations, then a PATH
 * scan). A macOS app launched from Finder inherits a MINIMAL `PATH` (no
 * `~/.local/bin`, no Homebrew), so we check the common install dirs explicitly
 * first. Returns undefined if none is found.
 */
function findInstalledCodexExecutable(): string | undefined {
  const isExec = (p: string): boolean => {
    try {
      accessSync(p, fsConstants.X_OK)
      return true
    } catch {
      return false
    }
  }

  const home = homedir()
  const win = process.platform === 'win32'
  const bin = win ? 'codex.exe' : 'codex'

  const candidates = win
    ? [
        join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'codex', bin),
        join(home, '.local', 'bin', bin),
        join(home, '.bun', 'bin', bin),
      ]
    : [
        join(home, '.local', 'bin', 'codex'), // official installer
        '/opt/homebrew/bin/codex', // Apple-silicon Homebrew
        '/usr/local/bin/codex', // Intel Homebrew / manual
        join(home, '.bun', 'bin', 'codex'), // bun global
        join(home, '.npm-global', 'bin', 'codex'), // npm global prefix
      ]
  for (const c of candidates) if (existsSync(c) && isExec(c)) return c

  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    const p = join(dir, bin)
    if (existsSync(p) && isExec(p)) return p
  }
  return undefined
}

/**
 * Locate the Codex CLI the SDK should spawn — or undefined to let the SDK resolve
 * its own bundled binary.
 *
 * Resolution order:
 *  1. `FREEBUFF_CODEX_PATH` — explicit override (dev testing a specific build).
 *  2. undefined when `@openai/codex` is on disk (DEV) — let the SDK use its own
 *     version-matched binary. We PREFER it over any installed `codex`: the JSONL
 *     event protocol we parse is versioned with the SDK, and an arbitrary
 *     installed codex (a very different internal build on some machines) risks
 *     protocol drift or refusing to run.
 *  3. The user's INSTALLED codex (packaged app, no node_modules). We don't bundle
 *     the ~240 MB platform binary — Codex is offered only to users who have codex
 *     installed (the picker disables it otherwise; see {@link isCodexAvailable}).
 */
export function resolveCodexExecutable(): string | undefined {
  const override = process.env.FREEBUFF_CODEX_PATH
  if (override && existsSync(override)) return override

  // Dev: let the SDK use its own bundled, version-matched binary.
  if (sdkBundledCodexOnDisk()) return undefined

  return findInstalledCodexExecutable()
}

/** Short, user-facing reason shown when the Codex agent is disabled in the
 *  picker because no codex CLI is available. */
export const CODEX_UNAVAILABLE_REASON =
  'Codex CLI not installed — run `npm i -g @openai/codex` then `codex login`'

/**
 * Can this machine run the Codex harness at all? True when we can resolve SOME
 * codex to spawn: an explicit override, the SDK's bundled binary (dev), or a
 * user-installed codex (packaged). Drives the picker's disabled state so we never
 * offer Codex on a machine where every turn would fail "not installed".
 *
 * Memoized: availability is effectively static for a process (installing codex
 * mid-session is rare and a restart picks it up), and this runs on every state
 * snapshot — so we don't want a PATH scan each time.
 */
let codexAvailableCache: boolean | undefined
export function isCodexAvailable(): boolean {
  // Ops/test override: force the Codex agent off regardless of what's installed.
  // Read live (not cached) so it can be toggled without a restart.
  if (process.env.FREEBUFF_CODEX_DISABLED === '1') return false
  if (codexAvailableCache !== undefined) return codexAvailableCache
  const override = process.env.FREEBUFF_CODEX_PATH
  codexAvailableCache =
    (!!override && existsSync(override)) ||
    sdkBundledCodexOnDisk() ||
    findInstalledCodexExecutable() !== undefined
  return codexAvailableCache
}

/** The SDK couldn't find its bundled native CLI (packaged app, no installed
 *  codex resolved). Detected so we can rethrow actionable install guidance. */
function isCodexMissingCliMessage(message: string): boolean {
  return /unable to locate codex|codex cli binar|@openai\/codex/i.test(message)
}

const CODEX_NOT_INSTALLED_MESSAGE =
  'Codex CLI not found. The Codex (GPT-5.5) agent reuses your installed Codex and its ' +
  'ChatGPT/OpenAI subscription login. Install it (`npm i -g @openai/codex`), run ' +
  '`codex login` once to sign in, then restart Freebuff — or switch to the Freebuff ' +
  '(free) agent.'

/**
 * Translate one completed Codex item into a normalized `tool_call` event. MCP
 * tool calls are qualified as `mcp__<server>__<tool>` so the UI's formatTool
 * strips the prefix the same way it does for Claude Code's MCP tools.
 */
function emitToolCall(cb: HarnessCallbacks, item: ThreadItem): void {
  let toolName: string
  let input: unknown
  switch (item.type) {
    case 'command_execution':
      toolName = item.type
      input = { command: item.command }
      break
    case 'mcp_tool_call':
      toolName = `mcp__${item.server}__${item.tool}`
      input = item.arguments
      break
    case 'file_change':
      toolName = item.type
      input = { changes: item.changes }
      break
    case 'web_search':
      toolName = item.type
      input = { query: item.query }
      break
    case 'todo_list':
      toolName = item.type
      input = { items: item.items }
      break
    default:
      return
  }
  cb.onEvent({ type: 'tool_call', toolName, input, toolCallId: item.id })
}

/**
 * Translate the Codex SDK event stream into our normalized callbacks. Pure over
 * the stream (no SDK/process coupling) so it's unit-testable. Returns the thread
 * state to carry into the next turn.
 *
 * `command_execution` / `mcp_tool_call` items are emitted once, on `item.started`
 * (so the call shows as it's dispatched, not after it finishes); the `emitted`
 * set guards against a duplicate on their `item.completed`.
 */
export async function consumeCodexStream(
  stream: AsyncIterable<ThreadEvent>,
  cb: HarnessCallbacks,
  startThreadId?: string,
): Promise<CodexState> {
  let threadId = startThreadId
  const emitted = new Set<string>()
  // A fatal turn/stream error's message (turn.failed / top-level error). A fatal
  // error usually also makes the CLI exit nonzero, which the SDK turns into a
  // thrown "exited with code 1" (uninformative). So we DON'T surface it inline
  // here — we stash it and, whether the stream then throws or ends, raise a clean
  // error carrying THIS message (auth failures become a CodexAuthError). That
  // avoids double-reporting and keeps the useful reason.
  let fatal: string | null = null
  const raiseIfFatal = (): void => {
    if (fatal === null) return
    if (isCodexAuthErrorMessage(fatal)) throw new CodexAuthError(fatal)
    throw new Error(fatal)
  }

  try {
    for await (const ev of stream) {
      switch (ev.type) {
        case 'thread.started':
          threadId = ev.thread_id
          break

        case 'item.started': {
          const it = ev.item
          if (it.type === 'command_execution' || it.type === 'mcp_tool_call') {
            emitToolCall(cb, it)
            emitted.add(it.id)
          }
          break
        }

        case 'item.completed': {
          const it = ev.item
          switch (it.type) {
            case 'reasoning':
              if (it.text) cb.onReasoning(it.text)
              break
            case 'agent_message':
              if (it.text) cb.onText(it.text)
              break
            case 'command_execution':
            case 'mcp_tool_call':
              if (!emitted.has(it.id)) {
                emitToolCall(cb, it)
                emitted.add(it.id)
              }
              break
            case 'file_change':
            case 'web_search':
            case 'todo_list':
              emitToolCall(cb, it)
              break
            case 'error':
              // A non-fatal, item-level warning (e.g. truncated output): keep the
              // turn going but note it in the transcript.
              cb.onText(`\n\n⚠️ Codex: ${it.message}`)
              break
          }
          break
        }

        case 'turn.failed':
          fatal = ev.error?.message ?? 'unknown error'
          break

        case 'error':
          fatal = ev.message ?? 'unknown error'
          break

        // turn.started / turn.completed / item.updated carry no part to fold.
      }
    }
  } catch (streamErr) {
    // The exec threw (nonzero exit). Prefer the in-band fatal reason we captured;
    // otherwise surface the stream error itself (still classify it for auth).
    if (fatal === null) fatal = streamErr instanceof Error ? streamErr.message : String(streamErr)
    raiseIfFatal()
  }

  // Clean end of stream: if a fatal error arrived without the exec throwing,
  // still fail the turn with it.
  raiseIfFatal()

  cb.onEvent({ type: 'finish' })
  return { threadId }
}

export class CodexHarness implements AgentHarness {
  readonly id = 'codex' as const

  async runTurn(turn: HarnessTurn, cb: HarnessCallbacks): Promise<HarnessResult> {
    const prev = isCodexState(turn.previousState) ? turn.previousState : {}
    const threadId = prev.threadId

    // Stand up the localhost MCP server exposing the Freebuff custom tools, bound
    // to this turn's engine callbacks. Codex connects to it by URL (below).
    const mcp = await startFreebuffMcpServer(turn.toolDeps)

    const codexPath = resolveCodexExecutable()
    const codex = new Codex({
      env: codexEnv(),
      ...(codexPath ? { codexPathOverride: codexPath } : {}),
      // Register our tools as a streamable-HTTP MCP server. The SDK flattens this
      // into `--config mcp_servers.freebuff.{url,http_headers}=…`, which the CLI
      // connects to. The bearer header is the per-turn token the server requires.
      config: {
        mcp_servers: {
          [FREEBUFF_MCP_SERVER]: {
            url: mcp.url,
            http_headers: { Authorization: `Bearer ${mcp.token}` },
          },
        },
      },
    })

    // Full autonomy, mirroring the Claude Code harness's bypassPermissions: no
    // sandbox + never prompt for approval (headless desktop agent; the thread is
    // an isolated worktree). networkAccessEnabled is moot under full access but
    // kept explicit.
    const options = {
      model: turn.model ?? CODEX_MODEL,
      workingDirectory: turn.cwd,
      sandboxMode: 'danger-full-access' as const,
      networkAccessEnabled: true,
      approvalPolicy: 'never' as const,
      // The thread's worktree is a fresh branch, sometimes with no commits yet.
      skipGitRepoCheck: true,
    }

    try {
      // resumeThread when we have a prior thread id (carries context/caching);
      // otherwise start fresh. Codex views attached images via its shell/read on
      // the path in the prompt text (see attachments.ts), so we don't forward
      // turn.images as SDK content.
      const thread = threadId
        ? codex.resumeThread(threadId, options)
        : codex.startThread(options)

      // Append the follow-up-suggestions guidance to the prompt (Codex has no SDK
      // system-prompt hook), so it ends finished work with a suggest_prompts call.
      const prompt = `${turn.prompt}\n\n${CODEX_SYSTEM_APPEND}`
      const { events } = await thread.runStreamed(prompt, { signal: turn.abort.signal })
      const state = await consumeCodexStream(events, cb, threadId)
      return { state }
    } catch (err) {
      // Recognize the CLI's auth failures and rethrow them typed, so the engine
      // shows a sign-in recovery card instead of raw terminal-speak. Aborts are
      // handled upstream (the engine checks its own signal before the error).
      throw translateCodexError(err)
    } finally {
      await mcp.close()
    }
  }
}
