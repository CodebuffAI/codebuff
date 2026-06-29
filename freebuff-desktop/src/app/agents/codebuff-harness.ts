/**
 * Codebuff harness: runs a thread turn through the hosted Codebuff agent framework
 * (DeepSeek v4 Flash) via the SDK client. This is the original code path, lifted
 * out of ThreadEngine.runTurn behind the {@link AgentHarness} interface so the
 * engine can swap in other agents (e.g. Claude Code) without changing its turn
 * bookkeeping.
 */

import type { CodebuffClient, RunState } from '@codebuff/sdk'

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

  constructor(private readonly client: CodebuffClient) {}

  async runTurn(turn: HarnessTurn, cb: HarnessCallbacks): Promise<HarnessResult> {
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

    // Attached images go as multimodal message content so the model (MiniMax M3)
    // can actually see them. The SDK combines `prompt` (text) with these image parts
    // (see buildUserMessageContent). No images → omit `content` (prompt-only).
    const content = turn.images?.length
      ? turn.images.map((im) => ({ type: 'image' as const, image: im.image, mediaType: im.mediaType }))
      : undefined

    const run = await this.client.run({
      agent: threadAgentDefinition(toolNames),
      agentDefinitions: THREAD_SUBAGENT_DEFINITIONS,
      prompt: turn.prompt,
      content,
      cwd: turn.cwd,
      signal: turn.abort.signal,
      previousRun: turn.previousState as RunState | undefined,
      customToolDefinitions: tools,
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

    return { state: run }
  }
}
