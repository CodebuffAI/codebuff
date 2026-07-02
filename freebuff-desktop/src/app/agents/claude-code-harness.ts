/**
 * Claude Code harness: runs a thread turn through the user's LOCAL, already-
 * authenticated Claude Code via the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`).
 *
 * Why this works with no key plumbing: the SDK spawns the bundled Claude Code CLI,
 * which reads the same credentials the user established with `claude` / `claude login`
 * (Anthropic subscription/OAuth token, stored in the OS keychain or ~/.claude). So
 * "switch the agent to Claude Code" literally reuses the terminal session's auth —
 * provided no `ANTHROPIC_API_KEY` is set to override it. The model is the thread's
 * pick (see core/claude-models.ts), defaulting to Opus 4.8.
 *
 * Streaming: we ask for partial messages and drive everything off the raw Anthropic
 * stream events so order is preserved (text → tool → text interleaves correctly):
 *   - text_delta      → onText
 *   - thinking_delta  → onReasoning
 *   - tool_use blocks → accumulate input_json_delta, emit one `tool_call` on stop
 * The terminal `result` carries the session id (threaded back in as `resume` for the
 * next turn, so context/caching persist).
 *
 * Autonomy: permissionMode `bypassPermissions` (+ allowDangerouslySkipPermissions)
 * lets it read/write/edit and run bash in the thread's git worktree without prompts,
 * which is what a headless desktop agent needs.
 *
 * Steering: Claude Code runs a turn to completion, so mid-turn main-chat messages
 * aren't injected here; the engine's pump runs them as the next turn instead.
 */

import { accessSync, constants as fsConstants, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk'

import { NOTICE_CLAUDE_CODE_AUTH } from '../../core/parts'
import { CLAUDE_CODE_MODEL } from '../models'
import type { AgentHarness, HarnessCallbacks, HarnessResult, HarnessTurn } from './harness'
import {
  SUGGEST_PROMPTS_GUIDANCE,
  THREAD_TOOL_SPECS,
  type ThreadToolDeps,
} from './thread-tools'

interface ClaudeState {
  sessionId?: string
}

/**
 * The local Claude Code CLI refused the turn because it isn't authenticated
 * (signed out, expired/revoked OAuth token, or a broken API-key override). The
 * raw SDK error quotes Claude Code's terminal-oriented advice ("Please run
 * /login") which is meaningless inside Freebuff — so the engine treats this
 * class specially: the message below is user-facing, and the UI renders it as
 * a recovery card (see NOTICE_CLAUDE_CODE_AUTH) instead of a bare turn failure.
 */
export class ClaudeCodeAuthError extends Error {
  /** The SDK's original error text, kept for logs/diagnosis. */
  readonly causeMessage: string

  constructor(causeMessage: string) {
    super(
      'This agent runs your local Claude Code, which is signed out. To fix it, sign in from ' +
        'a terminal: run `claude /login`, finish the sign-in in your browser, then resend ' +
        'your message here. Or switch this thread to a Freebuff agent from the selector in ' +
        'the title bar.',
    )
    this.name = 'ClaudeCodeAuthError'
    this.causeMessage = causeMessage
  }
}

/**
 * Does the CLI's error text mean "the CLI isn't authenticated"? Matched against
 * the error-result string (in-band `is_error` results and the SDK's thrown
 * "Claude Code returned an error result: …" wrapper carry the same text). The
 * phrases are the CLI's exact auth failure copy: signed out ("Not logged in ·
 * Please run /login"), expired/revoked OAuth token, and the external-API-key
 * override ("Invalid API key · Fix external API key" — an env key claudeCodeEnv
 * missed). Deliberately NOT a bare "invalid api key": the result text can quote
 * arbitrary tool/model output (a third-party key error in the user's project),
 * and misclassifying that would hide the real error behind a bogus sign-in card.
 */
function isClaudeCodeAuthErrorMessage(message: string): boolean {
  return /not logged in|please run \/login|fix external api key|oauth token (has |was |been )?(expired|revoked)/i.test(
    message,
  )
}

/** Map a stream/spawn error to a typed/actionable error: {@link ClaudeCodeAuthError}
 *  for auth failures, a clear "install Claude Code" message when the SDK can't find
 *  its CLI binary (packaged app, no installed claude); anything else unchanged. */
export function translateClaudeCodeError(err: unknown): unknown {
  if (err instanceof ClaudeCodeAuthError) return err
  const message = err instanceof Error ? err.message : String(err)
  if (isClaudeCodeAuthErrorMessage(message)) return new ClaudeCodeAuthError(message)
  if (isClaudeCodeMissingCliMessage(message)) return new Error(CLAUDE_CODE_NOT_INSTALLED_MESSAGE)
  return err
}

/** Narrow an opaque {@link HarnessTurn.previousState} to this harness's own state
 *  shape before trusting it. The engine already replays state only for the
 *  matching harness, but validating here means a future mismatch starts a fresh
 *  session (no resume) instead of feeding a foreign object to `resume`. */
function isClaudeState(v: unknown): v is ClaudeState {
  if (typeof v !== 'object' || v === null) return false
  const s = (v as ClaudeState).sessionId
  return s === undefined || typeof s === 'string'
}

/** Tools the agent is pre-approved to use (so they run without a permission prompt). */
const ALLOWED_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'Bash',
  'Glob',
  'Grep',
  'LS',
  'TodoWrite',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
]

/**
 * Name of the in-process MCP server we expose to Claude Code so it gets the same
 * Freebuff custom tools the Codebuff harness has (suggest_prompts / write_doc /
 * browser_check). Tools surface to the model — and back through our stream — as
 * `mcp__freebuff__<name>`; the UI strips the prefix in formatTool.ts.
 */
export const FREEBUFF_MCP_SERVER = 'freebuff'

/** The fully-qualified tool names to pre-approve in `allowedTools`. */
export const FREEBUFF_MCP_TOOL_NAMES = [
  'suggest_prompts',
  'write_doc',
  'browser_check',
].map((n) => `mcp__${FREEBUFF_MCP_SERVER}__${n}`)

/**
 * Appended to Claude Code's built-in (preset) system prompt so it ends finished
 * work with follow-up suggestions, the same way the Codebuff thread agent does
 * (see THREAD_SYSTEM_PROMPT in thread-agent.ts). The tool reaches the model as
 * `mcp__freebuff__suggest_prompts`; we describe the behaviour rather than lean on
 * the qualified name.
 */
export const CLAUDE_CODE_SYSTEM_APPEND = `This thread runs inside the Freebuff desktop app, which has a per-thread queue of follow-up prompts beside the chat.

${SUGGEST_PROMPTS_GUIDANCE}`

/** MCP tool results are content blocks; we ship our JSON payloads as text. */
const jsonResult = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }],
})

/**
 * Env handed to the spawned Claude Code CLI. The whole point of this harness is to
 * reuse the user's local subscription/OAuth creds — but those are only used when no
 * `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` is present, since an API key OVERRIDES
 * subscription auth. The desktop process inherits a `.env` (Bun auto-loads it) that
 * sets `ANTHROPIC_API_KEY=dummy_anthropic_key` for the Codebuff/server paths; left in
 * place it leaks into the CLI and yields "Invalid API key · Fix external API key".
 *
 * The SDK REPLACES (does not merge) the subprocess env when `env` is set, so we spread
 * `process.env` and delete only the auth-override keys — keeping PATH/HOME/etc. intact.
 */
export function claudeCodeEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  return env
}

/**
 * Locate the Claude Code CLI the SDK should spawn.
 *
 * In dev the SDK finds its own version-matched native binary from node_modules.
 * The PACKAGED app has no node_modules (the orchestrator is a single Bun bundle),
 * so `query()` fails with "Native CLI binary for <platform> not found" unless we
 * point `pathToClaudeCodeExecutable` at a `claude` on disk. We reuse the user's
 * INSTALLED Claude Code — which matches this harness's reuse-your-subscription
 * design (same `~/.claude` creds).
 *
 * GOTCHA: a macOS app launched from Finder inherits a MINIMAL `PATH` (no
 * `~/.local/bin`, no Homebrew), so a plain PATH scan misses a claude the user
 * clearly has. We check well-known install locations explicitly first, then fall
 * back to PATH (dev / terminal-launched). Returns undefined if none found — the
 * caller then lets the SDK try its own binary (dev) or surfaces a friendly
 * "install Claude Code" error (packaged; see {@link isClaudeCodeMissingCliMessage}).
 */
export function resolveClaudeCodeExecutable(): string | undefined {
  // Explicit override always wins.
  const override = process.env.FREEBUFF_CLAUDE_PATH
  if (override && existsSync(override)) return override

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
  const bin = win ? 'claude.exe' : 'claude'

  const candidates = win
    ? [
        join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'claude', bin),
        join(home, '.local', 'bin', bin),
        join(home, '.bun', 'bin', bin),
      ]
    : [
        join(home, '.local', 'bin', 'claude'), // official installer / migrate-installer
        join(home, '.claude', 'local', 'claude'), // `claude` local install
        '/opt/homebrew/bin/claude', // Apple-silicon Homebrew
        '/usr/local/bin/claude', // Intel Homebrew / manual
        join(home, '.bun', 'bin', 'claude'), // bun global
        join(home, '.npm-global', 'bin', 'claude'), // npm global prefix
      ]
  for (const c of candidates) if (existsSync(c) && isExec(c)) return c

  // Fall back to a PATH scan (populated in dev / terminal-launched runs).
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue
    const p = join(dir, bin)
    if (existsSync(p) && isExec(p)) return p
  }
  return undefined
}

/** The SDK couldn't find its bundled native CLI (packaged app, no installed
 *  claude resolved). Detected so we can rethrow actionable install guidance
 *  instead of the raw "Reinstall @anthropic-ai/claude-agent-sdk" terminal-speak. */
function isClaudeCodeMissingCliMessage(message: string): boolean {
  return /native cli binary|pathToClaudeCodeExecutable|claude code executable|--omit=optional/i.test(
    message,
  )
}

const CLAUDE_CODE_NOT_INSTALLED_MESSAGE =
  'Claude Code CLI not found. The Claude Code (Fable/Opus) agent reuses your ' +
  'installed Claude Code and its subscription login. Install it (https://claude.ai/download ' +
  'or `npm i -g @anthropic-ai/claude-code`), run `claude` once to sign in, then restart ' +
  'Freebuff — or switch to the Codebuff (free) agent.'

/**
 * Claude Code adapter: wrap each shared {@link THREAD_TOOL_SPECS} entry as an
 * in-process MCP tool backed by the engine callbacks (`turn.toolDeps`), so Claude
 * Code gets the same tools as the Codebuff harness (which wraps the same specs via
 * buildThreadTools). The SDK's `tool()` takes a Zod RAW SHAPE (a `{ key: ZodType }`
 * map, not a `z.object(...)`) — which is exactly `spec.shape` — and the repo's zod
 * v4 raw shape is accepted (`AnyZodRawShape = ZodRawShape | v4 ZodRawShape`).
 *
 * Exported so a unit test can invoke the handlers directly (the SDK transport calls
 * them in-process when the model emits the matching tool_use).
 */
export function buildFreebuffMcpTools(deps: ThreadToolDeps) {
  return THREAD_TOOL_SPECS.map((spec) =>
    tool(spec.name, spec.description, spec.shape, async (args) =>
      jsonResult(await spec.run(deps, args)),
    ),
  )
}

/**
 * Translate the Claude Agent SDK message stream into our normalized callbacks.
 * Pure over the stream (no SDK/process coupling) so it's unit-testable. Returns the
 * session state to thread into the next turn.
 */
export async function consumeClaudeStream(
  stream: AsyncIterable<any>,
  cb: HarnessCallbacks,
  startSessionId?: string,
): Promise<ClaudeState> {
  let sessionId = startSessionId
  let resultSubtype = 'success'
  // Error text from an `is_error` result message, if one arrived. Non-null even
  // when the CLI exits 0 — the SDK only throws its "returned an error result"
  // wrapper on a NONZERO exit, so in-band failures must be classified here.
  let resultError: string | null = null
  // Tool-use block currently streaming its JSON input (one at a time per turn).
  let curTool: { id: string; name: string; buf: string } | null = null

  for await (const msg of stream) {
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init' && msg.session_id) sessionId = msg.session_id
        break

      case 'stream_event': {
        const ev = msg.event
        if (!ev) break
        if (ev.type === 'content_block_start') {
          const b = ev.content_block
          if (b?.type === 'tool_use') curTool = { id: b.id, name: b.name, buf: '' }
        } else if (ev.type === 'content_block_delta') {
          const d = ev.delta
          if (d?.type === 'text_delta' && d.text) cb.onText(d.text)
          else if (d?.type === 'thinking_delta' && d.thinking) cb.onReasoning(d.thinking)
          else if (d?.type === 'input_json_delta' && curTool) curTool.buf += d.partial_json ?? ''
        } else if (ev.type === 'content_block_stop' && curTool) {
          let input: unknown = {}
          try {
            input = curTool.buf ? JSON.parse(curTool.buf) : {}
          } catch {
            input = { _raw: curTool.buf }
          }
          cb.onEvent({ type: 'tool_call', toolName: curTool.name, input, toolCallId: curTool.id })
          curTool = null
        }
        break
      }

      case 'result':
        if (msg.session_id) sessionId = msg.session_id
        resultSubtype = msg.subtype ?? 'success'
        if (msg.is_error) {
          // Subtype 'success' carries the error in `result`; other subtypes in
          // `errors`. Fall back to the subtype so the note is never blank.
          const text =
            resultSubtype === 'success'
              ? msg.result
              : Array.isArray(msg.errors)
                ? msg.errors.filter(Boolean).join('; ')
                : ''
          resultError = (typeof text === 'string' && text) || resultSubtype
        }
        break
    }
  }

  // Only reached on a clean process exit — a nonzero exit makes the SDK throw
  // out of the loop above, and runTurn's catch classifies that path instead.
  if (resultError !== null) {
    // An in-band error result: recognize auth failures (recovery card), and
    // surface anything else verbatim so the turn isn't a silent empty message.
    if (isClaudeCodeAuthErrorMessage(resultError)) throw new ClaudeCodeAuthError(resultError)
    cb.onText(`\n\n⚠️ Claude Code error: ${resultError}`)
  } else if (resultSubtype !== 'success') {
    // A non-success terminal result (max_turns, …) may leave nothing in the
    // transcript — surface a short note so the turn isn't silently empty.
    cb.onText(`\n\n⚠️ Claude Code ended: ${resultSubtype}`)
  }

  cb.onEvent({ type: 'finish' })
  return { sessionId }
}

export class ClaudeCodeHarness implements AgentHarness {
  readonly id = 'claude-code' as const

  async runTurn(turn: HarnessTurn, cb: HarnessCallbacks): Promise<HarnessResult> {
    const prev = isClaudeState(turn.previousState) ? turn.previousState : {}
    const sessionId = prev.sessionId
    // Note: we don't forward `turn.images` here. Claude Code views attached images
    // via its `Read` tool on the path referenced in the prompt text (attachments.ts),
    // so it sees them without us constructing a multimodal SDK message.

    // Expose the Freebuff custom tools (suggest_prompts / write_doc / browser_check)
    // as an in-process MCP server bound to this turn's engine callbacks.
    const freebuffServer = createSdkMcpServer({
      name: FREEBUFF_MCP_SERVER,
      version: '1.0.0',
      tools: buildFreebuffMcpTools(turn.toolDeps),
    })

    const claudePath = resolveClaudeCodeExecutable()

    try {
      // query() inside the try so a synchronous spawn/resolve failure (e.g. the
      // SDK can't find its CLI binary) is translated too, not just stream errors.
      const stream = query({
        prompt: turn.prompt,
        options: {
          model: turn.model ?? CLAUDE_CODE_MODEL,
          cwd: turn.cwd,
          env: claudeCodeEnv(),
          // Keep Claude Code's full default behaviour, but append our follow-up
          // guidance so it ends finished work with suggest_prompts.
          systemPrompt: {
            type: 'preset',
            preset: 'claude_code',
            append: CLAUDE_CODE_SYSTEM_APPEND,
          },
          abortController: turn.abort,
          ...(sessionId ? { resume: sessionId } : {}),
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          includePartialMessages: true,
          mcpServers: { [FREEBUFF_MCP_SERVER]: freebuffServer },
          allowedTools: [...ALLOWED_TOOLS, ...FREEBUFF_MCP_TOOL_NAMES],
          // Point the SDK at a resolved Claude Code CLI. In dev the SDK finds its
          // own version-matched binary from node_modules (resolver may also find an
          // installed one — fine); the packaged app has no node_modules, so we reuse
          // the user's installed Claude Code. Undefined → let the SDK try its own.
          ...(claudePath ? { pathToClaudeCodeExecutable: claudePath } : {}),
        },
      })

      const state = await consumeClaudeStream(stream as AsyncIterable<any>, cb, sessionId)
      return { state }
    } catch (err) {
      // Recognize the CLI's auth failures and rethrow them typed, so the engine
      // shows a sign-in recovery card instead of the raw terminal-speak error
      // ("Please run /login" means nothing inside the desktop app). Aborts are
      // handled upstream (the engine checks its own signal before the error).
      throw translateClaudeCodeError(err)
    }
  }
}
