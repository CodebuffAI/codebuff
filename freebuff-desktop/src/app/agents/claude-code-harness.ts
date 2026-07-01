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

import { createSdkMcpServer, query, tool } from '@anthropic-ai/claude-agent-sdk'

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
        break
    }
  }

  // A non-success terminal result (max_turns, error, …) may leave nothing in the
  // transcript — surface a short note so the turn isn't silently empty.
  if (resultSubtype !== 'success') {
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
        // Allow pointing at a specific Claude Code binary if the bundled one isn't
        // wanted (e.g. to match the user's installed version / auth).
        ...(process.env.FREEBUFF_CLAUDE_PATH
          ? { pathToClaudeCodeExecutable: process.env.FREEBUFF_CLAUDE_PATH }
          : {}),
      },
    })

    const state = await consumeClaudeStream(stream as AsyncIterable<any>, cb, sessionId)
    return { state }
  }
}
