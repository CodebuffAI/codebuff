import type { AgentDefinition, RunState } from '@codebuff/sdk'

import baseChatAgent from '../../../../../agents/base-chat'
import { CHAT_MODELS } from '@/app/chat/models'
import { logger } from '@/util/logger'

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

/**
 * Runs one turn of the base-chat agent through the codebuff agent framework.
 * LLM calls flow through the shared /api/v1/chat/completions endpoint under
 * the freebuff web service account (metered, not deducted). The agent has no
 * filesystem and no tools yet; subagents come in a follow-up.
 */
export async function runChatAgent(params: {
  prompt: string
  /** Chat-product model id, already tier-pinned by the caller. */
  model: string
  previousRunState: unknown
  userId: string
  threadId: string
  signal: AbortSignal
  onTextDelta: (text: string) => void
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

  const { run } = await loadSdk()
  const runState = await run({
    apiKey,
    fingerprintId: `freebuff-chat-${params.userId}`,
    // run() registers an inline agent definition itself; no need to also
    // pass it via agentDefinitions.
    agent,
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
        params.onTextDelta(chunk)
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
