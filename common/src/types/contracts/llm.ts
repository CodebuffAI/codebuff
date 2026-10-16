import type { TrackEventFn } from './analytics'
import type { SendActionFn } from './client'
import type {
  OpenRouterProviderRoutingOptions,
  AgentTemplate,
} from '../agent-template'
import type { ParamsExcluding } from '../function-params'
import type { Logger } from './logger'
import type { Model } from '../../old-constants'
import type { Message } from '../messages/codebuff-message'
import type { ProviderMetadata } from '../messages/provider-metadata'
import type { PromptResult } from '../../util/error'
import type { generateText, streamText, ToolCallPart } from 'ai'
import type z from 'zod/v4'

/** Auto-recovered stream endings (see sdk/src/impl/stream-interruption.ts):
 *  - 'stream-interrupted': the stream ended without a finish marker
 *    (connection cut mid-response — a server deploy or network drop).
 *  - 'output-limit': the stream produced only reasoning and no usable answer,
 *    either by reaching its output limit or by reporting a normal stop.
 *  - 'provider-error': the provider reported a retryable failure (5xx, 429)
 *    in band, mid-stream. */
export type StreamRecoverySource =
  | 'stream-interrupted'
  | 'output-limit'
  | 'provider-error'

export type StreamChunk =
  | {
      type: 'text'
      text: string
      agentId?: string
    }
  | {
      type: 'reasoning'
      text: string
      /** Provider metadata for the whole reasoning segment (e.g. OpenRouter
       *  reasoning_details with thinking signatures), delivered on a final
       *  empty-text chunk once the segment ends. Stored on the history's
       *  reasoning part so the next request can replay it. */
      providerOptions?: ProviderMetadata
    }
  | Pick<
      ToolCallPart,
      'type' | 'toolCallId' | 'toolName' | 'input' | 'providerOptions'
    >
  | {
      type: 'error'
      message: string
      /** When set, this is an auto-recovered stream ending rather than a
       *  failure: consumers force another agent step so the model can
       *  continue, instead of wrapping the message as a tool-call failure and
       *  instead of the turn silently ending. */
      source?: StreamRecoverySource
      /** For a recovery: a user-facing summary of what failed, carried into
       *  the error raised if the retries run out. */
      detail?: string
    }

export type CacheDebugUsageData = {
  inputTokens: number
  outputTokens: number
  reasoningOutputTokens?: number
  cachedInputTokens: number
  totalTokens: number
}

/** Provider-reported usage for one model request. */
export type ModelUsageData = CacheDebugUsageData

/** Provider usage attributed by the runtime to the agent that made the request. */
export type AgentUsageData = ModelUsageData & {
  isRoot: boolean
  agentId?: string
}

export type ContextCompactionData = {
  trigger: 'manual' | 'context_limit' | 'cache_expiry' | 'context_limit_and_cache_expiry'
  thresholdTokens: number
  summary?: string
  preTokens?: number
  postTokens?: number
  durationMs?: number
}

/**
 * A request whose provider-reported prompt exceeded the agent's context
 * budget, with what the runtime believed when it sent it. Diagnostics only:
 * the runtime compacts (or fails the run) on the next step regardless.
 */
export type ContextOverBudgetData = {
  promptTokens: number
  outputTokens: number
  maxContextLength: number
  thresholdTokens: number
  /** The runtime's own count when it decided whether to compact. */
  contextTokenCount: number
  decision: 'compacted' | 'deferred' | 'abandoned' | 'none' | 'disabled'
  /** Whether the previous response's usage anchored that count. */
  baselineTokens?: number
  baselineEstimatedTokens?: number
  baselineScale?: number
  baselineModelMatches: boolean
  /** Whether this response's usage became the next anchor. */
  receiptRecorded: boolean
  messageCount: number
  stepNumber: number
  isRoot: boolean
}

export type PromptAiSdkStreamFn = (
  params: {
    apiKey: string
    runId: string
    messages: Message[]
    clientSessionId: string
    fingerprintId: string
    model: Model
    userId: string | undefined
    chargeUser?: boolean
    thinkingBudget?: number
    userInputId: string
    agentId?: string
    maxRetries?: number
    onCostCalculated?: (credits: number) => Promise<void>
    onCacheDebugProviderRequestBuilt?: (params: {
      provider: string
      rawBody: unknown
      normalizedBody?: unknown
    }) => void
    onCacheDebugUsageReceived?: (usage: CacheDebugUsageData) => void
    onUsageReceived?: (usage: ModelUsageData) => void
    /** The request ended without an exact final provider usage receipt. */
    onUsageIncomplete?: () => void
    /** The finish reason the stream's final part reported ('stop', 'length',
     *  'tool-calls', ...). Not called when the stream ends without one. */
    onFinishReason?: (finishReason: string) => void
    includeCacheControl?: boolean
    cacheDebugCorrelation?: string
    agentProviderOptions?: OpenRouterProviderRoutingOptions
    /** List of agents that can be spawned - used to transform agent tool calls */
    spawnableAgents?: string[]
    /** Map of locally available agent templates - used to transform agent tool calls */
    localAgentTemplates?: Record<string, AgentTemplate>
    /** Cost mode - 'free' mode means 0 credits charged for all agents */
    costMode?: string
    /** Extra key/values merged into the request's `codebuff_metadata` field.
     *  Used to forward client-scoped identifiers (e.g. `freebuff_instance_id`)
     *  that server-side gates read from the chat-completions body. */
    extraCodebuffMetadata?: Record<string, string>
    sendAction: SendActionFn
    logger: Logger
    trackEvent: TrackEventFn
    signal: AbortSignal
  } & ParamsExcluding<typeof streamText, 'model' | 'messages'>,
) => AsyncGenerator<StreamChunk, PromptResult<string | null>>

export type PromptAiSdkFn = (
  params: {
    apiKey: string
    runId: string
    messages: Message[]
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: Model
    userId: string | undefined
    chargeUser?: boolean
    agentId?: string
    onCostCalculated?: (credits: number) => Promise<void>
    onCacheDebugProviderRequestBuilt?: (params: {
      provider: string
      rawBody: unknown
      normalizedBody?: unknown
    }) => void
    onCacheDebugUsageReceived?: (usage: CacheDebugUsageData) => void
    includeCacheControl?: boolean
    cacheDebugCorrelation?: string
    agentProviderOptions?: OpenRouterProviderRoutingOptions
    maxRetries?: number
    /** Cost mode - 'free' mode means 0 credits charged for all agents */
    costMode?: string
    sendAction: SendActionFn
    logger: Logger
    trackEvent: TrackEventFn
    n?: number
    signal: AbortSignal
  } & ParamsExcluding<typeof generateText, 'model' | 'messages'>,
) => Promise<PromptResult<string>>

export type PromptAiSdkStructuredInput<T> = {
  apiKey: string
  /** Freebuff's 'free' mode uses platform provider credentials. */
  costMode?: string
  runId: string
  messages: Message[]
  schema: z.ZodType<T>
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  model: Model
  userId: string | undefined
  maxTokens?: number
  temperature?: number
  timeout?: number
  chargeUser?: boolean
  agentId?: string
  onCostCalculated?: (credits: number) => Promise<void>
  onCacheDebugProviderRequestBuilt?: (params: {
    provider: string
    rawBody: unknown
    normalizedBody?: unknown
  }) => void
  onCacheDebugUsageReceived?: (usage: CacheDebugUsageData) => void
  includeCacheControl?: boolean
  cacheDebugCorrelation?: string
  agentProviderOptions?: OpenRouterProviderRoutingOptions
  maxRetries?: number
  sendAction: SendActionFn
  logger: Logger
  trackEvent: TrackEventFn
  signal: AbortSignal
}
export type PromptAiSdkStructuredOutput<T> = Promise<PromptResult<T>>
export type PromptAiSdkStructuredFn = <T>(
  params: PromptAiSdkStructuredInput<T>,
) => PromptAiSdkStructuredOutput<T>
