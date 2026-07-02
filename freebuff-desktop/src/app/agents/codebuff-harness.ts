/**
 * Codebuff harness: runs a thread turn through the hosted Codebuff agent framework
 * (DeepSeek v4 Flash) via the SDK client. This is the original code path, lifted
 * out of ThreadEngine.runTurn behind the {@link AgentHarness} interface so the
 * engine can swap in other agents (e.g. Claude Code) without changing its turn
 * bookkeeping.
 */

import { isFreebuffMultimodalModelId } from '@codebuff/common/constants/freebuff-models'
import type { CodebuffClient, RunState } from '@codebuff/sdk'

import { DEFAULT_FREEBUFF_MODEL } from '../models'
import { unauthenticatedError } from './freebuff-session-manager'
import {
  buildThreadTools,
  threadAgentDefinition,
  THREAD_AGENT_TOOLS,
  THREAD_SUBAGENT_DEFINITIONS,
} from './thread-agent'
import type { AgentHarness, HarnessCallbacks, HarnessResult, HarnessTurn } from './harness'

/**
 * Spawn / flow-control tool calls that would be noise in the transcript: the
 * subagent boxes already represent each spawn, and end_turn / set_output are
 * plumbing the user doesn't need to see.
 */
const HIDDEN_TOOL_NAMES = new Set([
  'spawn_agents',
  'spawn_agent_inline',
  'end_turn',
  'set_output',
  'set_messages',
  'add_message',
])

export class CodebuffHarness implements AgentHarness {
  readonly id = 'codebuff' as const

  /** `client` is null while signed out with no dev-key fallback; runTurn is
   *  normally unreachable then (the engine's freebuff.ensure() rejects the turn
   *  first). The guard throws the same FreebuffSessionError the admission path
   *  does, so if it ever fires (e.g. a token written by another instance lets
   *  ensure() pass while this process's client is still null) the user gets
   *  the sign-in recovery card, not a raw turn-failure line. */
  constructor(private readonly client: CodebuffClient | null) {}

  async runTurn(turn: HarnessTurn, cb: HarnessCallbacks): Promise<HarnessResult> {
    if (!this.client) throw unauthenticatedError()
    const tools = buildThreadTools(turn.toolDeps)
    const toolNames = [...THREAD_AGENT_TOOLS, ...tools.map((t) => t.toolName)]

    // The SDK emits prose both as per-token stream chunks (handleStreamChunk) and
    // as consolidated whole-segment `text` events (handleEvent). Stream when we can
    // and fall back to the consolidated copy only when nothing streamed, so the
    // transcript never double-renders. Tracked for the root agent only; subagent
    // prose always streams via `subagent_chunk`.
    let streamedText = false
    // Subagent ids we've seen start, so a consolidated `text` event for a subagent
    // (already streamed) is dropped rather than double-rendered.
    const subagentIds = new Set<string>()

    const model = turn.model ?? DEFAULT_FREEBUFF_MODEL

    // Attached images go as multimodal message content so the model can actually
    // see them. Only forward them when the chosen model accepts images; for a
    // text-only freebuff model, dropping them avoids a provider error. The SDK
    // combines `prompt` (text) with these image parts (see buildUserMessageContent).
    const content =
      turn.images?.length && isFreebuffMultimodalModelId(model)
        ? turn.images.map((im) => ({ type: 'image' as const, image: im.image, mediaType: im.mediaType }))
        : undefined

    const run = await this.client.run({
      agent: threadAgentDefinition(toolNames, model),
      agentDefinitions: THREAD_SUBAGENT_DEFINITIONS,
      prompt: turn.prompt,
      content,
      cwd: turn.cwd,
      signal: turn.abort.signal,
      previousRun: turn.previousState as RunState | undefined,
      customToolDefinitions: tools,
      // Free-mode binding: when the engine admitted a session for this thread,
      // run with cost_mode='free' + the session's instance id (the server gates
      // and meters the request against the desktop multi-session row).
      ...(turn.freeMode
        ? {
            costMode: 'free',
            extraCodebuffMetadata: {
              freebuff_instance_id: turn.freeMode.instanceId,
              freebuff_multi_session: '1',
            },
          }
        : {}),
      drainSteeringMessages: cb.drainSteering,
      handleStreamChunk: (chunk: unknown) => {
        if (typeof chunk === 'string') {
          if (!chunk) return
          streamedText = true
          cb.onText(chunk)
          return
        }
        const c = chunk as {
          type?: string
          chunk?: string
          agentId?: string
          ancestorRunIds?: string[]
        }
        if (c?.type === 'subagent_chunk' && c.chunk) {
          // A subagent's prose delta → fold into that subagent's box.
          cb.onEvent({ type: 'text', text: c.chunk, agentId: c.agentId })
        } else if (c?.type === 'reasoning_chunk' && c.chunk) {
          // Empty ancestor chain = the root agent is thinking; otherwise it's a
          // subagent's reasoning, attributed by agentId.
          if (c.ancestorRunIds && c.ancestorRunIds.length > 0 && c.agentId) {
            cb.onEvent({ type: 'reasoning_delta', text: c.chunk, agentId: c.agentId })
          } else {
            cb.onReasoning(c.chunk)
          }
        }
      },
      handleEvent: (event: any) => {
        switch (event.type) {
          case 'text': {
            // Root consolidated fallback only (subagent text already streamed).
            const isSubagent = event.agentId && subagentIds.has(event.agentId)
            if (!streamedText && !isSubagent) cb.onText(event.text)
            return
          }
          case 'subagent_start':
            subagentIds.add(event.agentId)
            cb.onEvent(event)
            return
          case 'tool_call':
          case 'tool_result':
            // Drop spawn / flow-control tool noise; the boxes convey the spawns.
            if (HIDDEN_TOOL_NAMES.has(event.toolName)) return
            cb.onEvent(event)
            return
          default:
            // subagent_finish, finish, etc.
            cb.onEvent(event)
        }
      },
    })

    // The SDK RESOLVES (rather than rejects) on a run-level failure — a free-mode
    // admission/gate rejection, a network error, a server error, or "no response
    // from agent" — surfacing it as an `error` AgentOutput. The top-level failure
    // path emits no `error` *event* either, so without this check the engine would
    // treat the turn as a successful empty completion: the user sees the three-dot
    // pulse, then nothing (no reply, no error). A normal turn returns a
    // lastMessage/allMessages/structuredOutput output, never `error`, so this is a
    // reliable failure signal. Re-throw so the engine finalizes the turn with the
    // message (⚠️ Turn failed: …). User aborts also resolve as an error output —
    // let the engine's own abort handling own those rather than reporting a failure.
    if (run.output?.type === 'error' && !turn.abort.signal.aborted) {
      throw new Error(run.output.message || 'The agent did not return a response.')
    }

    return { state: run }
  }
}
