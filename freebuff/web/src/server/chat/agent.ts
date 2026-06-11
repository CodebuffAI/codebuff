import type { AgentDefinition, RunState } from '@codebuff/sdk'

import baseChatAgent from '../../../../../agents/base-chat'
import researcherWebAgent from '../../../../../agents/researcher/researcher-web'
import { CHAT_MODELS } from '@/app/chat/models'
import { logger } from '@/util/logger'

import { toolCallLabel } from '@/app/chat/blocks'

import type { ChatStreamEvent } from '@/app/chat/blocks'

type SdkModule = typeof import('@codebuff/sdk')

let sdkPromise: Promise<SdkModule> | null = null

/** The SDK ships WASM modules bundlers can't process, and Next refuses to
 *  externalize symlinked workspace packages — so load it at runtime from
 *  node_modules, hidden from both bundlers. */
function loadSdk(): Promise<SdkModule> {
  sdkPromise ??= import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ '@codebuff/sdk'
  )
  return sdkPromise
}

export interface ChatAgentResult {
  /** Serialized run state to persist for the next turn; null if the run
   *  aborted before producing a new state worth keeping. */
  runState: RunState | null
  errorMessage: string | null
}

/** Spawn/flow-control tool calls that would be noise in the chat UI. */
const HIDDEN_TOOL_NAMES = new Set([
  'spawn_agents',
  'spawn_agent_inline',
  'end_turn',
  'set_output',
  'set_messages',
  'add_message',
])

/**
 * Runs one turn of the base-chat agent through the codebuff agent framework.
 * LLM calls flow through the shared /api/v1/chat/completions endpoint under
 * the freebuff web service account (metered, not deducted). The agent has no
 * filesystem and no direct tools, but can spawn researcher-web; subagent
 * lifecycle/tool events are forwarded through `onEvent`.
 */
export async function runChatAgent(params: {
  prompt: string
  /** Chat-product model id, already tier-pinned by the caller. */
  model: string
  previousRunState: unknown
  userId: string
  threadId: string
  signal: AbortSignal
  /** Normalized stream of root text deltas and subagent activity. */
  onEvent: (event: ChatStreamEvent) => void
}): Promise<ChatAgentResult> {
  const apiKey = process.env.CODEBUFF_API_KEY
  if (!apiKey) {
    throw new Error('CODEBUFF_API_KEY is not configured')
  }

  const backendModel = CHAT_MODELS.find((m) => m.id === params.model)?.backendId
  if (!backendModel) {
    throw new Error(`Unknown chat model: ${params.model}`)
  }

  const agent = {
    ...baseChatAgent,
    model: backendModel,
  } as AgentDefinition

  const previousRun =
    params.previousRunState &&
    typeof params.previousRunState === 'object' &&
    'sessionState' in params.previousRunState
      ? (params.previousRunState as RunState)
      : undefined

  // Track what we've forwarded so tool events from the root agent (or for
  // hidden tools) never reach the client.
  const subagentIds = new Set<string>()
  const forwardedToolCallIds = new Set<string>()

  const { run } = await loadSdk()
  const runState = await run({
    apiKey,
    fingerprintId: `freebuff-chat-${params.userId}`,
    // run() registers an inline agent definition itself; no need to also
    // pass it via agentDefinitions.
    agent,
    agentDefinitions: [researcherWebAgent as AgentDefinition],
    // No filesystem: skip project discovery entirely.
    projectFiles: {},
    knowledgeFiles: {},
    maxAgentSteps: 10,
    prompt: params.prompt,
    previousRun,
    costMode: 'normal',
    signal: params.signal,
    extraCodebuffMetadata: {
      freebuff_chat_user_id: params.userId,
      freebuff_chat_thread_id: params.threadId,
    },
    handleStreamChunk: (chunk) => {
      if (typeof chunk === 'string') {
        params.onEvent({ type: 'delta', text: chunk })
      } else if (chunk.type === 'subagent_chunk') {
        params.onEvent({
          type: 'agent_delta',
          agentId: chunk.agentId,
          text: chunk.chunk,
        })
      }
    },
    handleEvent: (event) => {
      if (event.type === 'subagent_start') {
        subagentIds.add(event.agentId)
        params.onEvent({
          type: 'agent_start',
          agentId: event.agentId,
          parentAgentId: event.parentAgentId,
          name: event.displayName,
          agentType: event.agentType,
          prompt: event.prompt,
        })
      } else if (event.type === 'subagent_finish') {
        params.onEvent({ type: 'agent_finish', agentId: event.agentId })
      } else if (event.type === 'tool_call') {
        // Only tool calls made by a subagent reach the UI; the root agent's
        // own calls (spawning) are covered by agent_start instead.
        if (
          !event.agentId ||
          !subagentIds.has(event.agentId) ||
          HIDDEN_TOOL_NAMES.has(event.toolName)
        ) {
          return
        }
        forwardedToolCallIds.add(event.toolCallId)
        params.onEvent({
          type: 'agent_tool',
          agentId: event.agentId,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          label: toolCallLabel(event.toolName, event.input),
        })
      } else if (event.type === 'tool_result') {
        if (!forwardedToolCallIds.has(event.toolCallId)) return
        params.onEvent({
          type: 'agent_tool_done',
          toolCallId: event.toolCallId,
        })
      }
    },
  })

  if (runState.output.type === 'error') {
    const aborted = params.signal.aborted
    if (!aborted) {
      logger.error(
        {
          userId: params.userId,
          threadId: params.threadId,
          message: runState.output.message,
        },
        'Chat agent run failed',
      )
    }
    return {
      // An errored/aborted run's session state doesn't include this turn;
      // keep the previous state so history stays consistent.
      runState: null,
      errorMessage: aborted ? null : runState.output.message,
    }
  }

  return { runState, errorMessage: null }
}
