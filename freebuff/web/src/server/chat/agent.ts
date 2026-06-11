import { getCachedFreebuffWebServiceAccountApiKey } from '@codebuff/internal/freebuff/web-service-account'

import type { AgentDefinition, RunState } from '@codebuff/sdk'

import baseChatAgent from '../../../../../agents/base-chat'
import researcherWebAgent from '../../../../../agents/researcher/researcher-web'
import { CHAT_MODELS } from '@/app/chat/models'
import { logger } from '@/util/logger'

import { toolCallDisplay } from '@/app/chat/blocks'

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

/** The service-account PAT is read from the shared DB (cached in
 *  @codebuff/internal) so it never has to be distributed through this
 *  server's environment. An explicit CODEBUFF_API_KEY (local dev,
 *  emergencies) overrides the lookup. */
async function getChatApiKey(): Promise<string> {
  const envKey = process.env.CODEBUFF_API_KEY
  if (envKey) {
    return envKey
  }
  const key = await getCachedFreebuffWebServiceAccountApiKey()
  if (!key) {
    throw new Error(
      'No Freebuff Web service account credential found. Provision one with scripts/create-freebuff-web-service-account.ts or set CODEBUFF_API_KEY.',
    )
  }
  return key
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
  const [apiKey, { run }] = await Promise.all([getChatApiKey(), loadSdk()])

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
        if (HIDDEN_TOOL_NAMES.has(event.toolName)) {
          return
        }
        // Tool calls carry the calling agent's id; anything not tracked as a
        // subagent is the root agent, whose calls (e.g. gravity_index) render
        // as top-level rows — agent_tool without an agentId.
        const subagentId =
          event.agentId && subagentIds.has(event.agentId)
            ? event.agentId
            : undefined
        forwardedToolCallIds.add(event.toolCallId)
        const { label, verbs } = toolCallDisplay(event.toolName, event.input)
        params.onEvent({
          type: 'agent_tool',
          ...(subagentId ? { agentId: subagentId } : {}),
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          label,
          ...(verbs ? { verbs } : {}),
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
