import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { models, PROFIT_MARGIN } from '@codebuff/common/old-constants'
import { buildArray } from '@codebuff/common/util/array'
import { normalizeProviderRequestBodyForCacheDebug } from '@codebuff/common/util/cache-debug'
import { getErrorObject, promptAborted, promptSuccess } from '@codebuff/common/util/error'
import { convertCbToModelMessages } from '@codebuff/common/util/messages'
import { isExplicitlyDefinedModel } from '@codebuff/common/util/model-utils'
import { StopSequenceHandler } from '@codebuff/common/util/stop-sequence'
import {
  streamText,
  generateText,
  generateObject,
  NoSuchToolError,
  APICallError,
  ToolCallRepairError,
  InvalidToolInputError,
  TypeValidationError,
} from 'ai'

import {
  getModelForRequest,
  markChatGptOAuthRateLimited,
} from './model-provider'
import { refreshChatGptOAuthToken } from '../credentials'
import { getErrorStatusCode } from '../error-utils'

import type { ModelRequestParams } from './model-provider'
import type { OpenRouterProviderRoutingOptions } from '@codebuff/common/types/agent-template'
import type {
  PromptAiSdkFn,
  PromptAiSdkStreamFn,
  PromptAiSdkStructuredInput,
  PromptAiSdkStructuredOutput,
} from '@codebuff/common/types/contracts/llm'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type { JSONObject } from '@codebuff/common/types/json'
import type { OpenRouterProviderOptions } from '@codebuff/internal/openrouter-ai-sdk'
import type { LanguageModel } from 'ai'
import type z from 'zod/v4'

// Provider routing documentation: https://openrouter.ai/docs/features/provider-routing
const providerOrder = {
  [models.openrouter_claude_sonnet_4]: [
    'Google',
    'Anthropic',
    'Amazon Bedrock',
  ],
  [models.openrouter_claude_sonnet_4_5]: [
    'Google',
    'Anthropic',
    'Amazon Bedrock',
  ],
  [models.openrouter_claude_opus_4]: ['Google', 'Anthropic'],
}

function isImageMediaType(mediaType: unknown): boolean {
  return typeof mediaType === 'string' && mediaType.toLowerCase().startsWith('image/')
}

function valueContainsImageInput(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(valueContainsImageInput)
  }
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>
  if (record.type === 'image') {
    return true
  }
  if (
    (record.type === 'file' || record.type === 'media') &&
    isImageMediaType(record.mediaType)
  ) {
    return true
  }
  return valueContainsImageInput(record.content)
}

function calculateUsedCredits(params: { costDollars: number }): number {
  const { costDollars } = params

  return Math.round(costDollars * (1 + PROFIT_MARGIN) * 100)
}

export function getProviderOptions(params: {
  model?: string
  runId: string
  clientSessionId: string
  providerOptions?: Record<string, JSONObject>
  agentProviderOptions?: OpenRouterProviderRoutingOptions
  n?: number
  costMode?: string
  cacheDebugCorrelation?: string
  extraCodebuffMetadata?: Record<string, string>
}): { openbuff: JSONObject } {
  const {
    model = '',
    runId,
    clientSessionId,
    providerOptions,
    agentProviderOptions,
    n,
    costMode,
    cacheDebugCorrelation,
    extraCodebuffMetadata,
  } = params

  let providerConfig: Record<string, any>

  // Use agent's provider options if provided, otherwise use defaults
  if (agentProviderOptions) {
    providerConfig = agentProviderOptions
  } else {
    // Set allow_fallbacks based on whether model is explicitly defined
    const isExplicitlyDefined = isExplicitlyDefinedModel(model)

    providerConfig = {
      order: providerOrder[model as keyof typeof providerOrder],
      allow_fallbacks: !isExplicitlyDefined,
    }
  }

  return {
    ...providerOptions,
    // Use openbuff key for provider metadata (formerly "codebuff").
    // Provider metadata is stripped by BYOK compatibility layers that don't
    // support it, so this is harmless for third-party providers.
    openbuff: {
      ...(providerOptions as any)?.codebuff,
      ...(providerOptions as any)?.openbuff,
      codebuff_metadata: {
        // Caller-supplied keys go first so they can't override reserved
        // identifiers like run_id/client_id/cost_mode that the server trusts.
        ...(extraCodebuffMetadata ?? {}),
        run_id: runId,
        client_id: clientSessionId,
        ...(n && { n }),
        ...(costMode && { cost_mode: costMode }),
        ...(cacheDebugCorrelation && {
          cache_debug_correlation: cacheDebugCorrelation,
        }),
      },
      provider: providerConfig,
    },
  }
}

// Usage accounting type for OpenRouter/Codebuff backend responses
// Forked from https://github.com/OpenRouterTeam/ai-sdk-provider/
type OpenRouterUsageAccounting = {
  cost: number | null
  costDetails: {
    upstreamInferenceCost: number | null
  }
}

/**
 * Check if an error is an OAuth rate limit error that should trigger fallback.
 */
function isOAuthRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  // Check status code (handles both 'status' from AI SDK and 'statusCode' from our errors)
  const statusCode = getErrorStatusCode(error)
  if (statusCode === 429) return true

  // Check error message for rate limit indicators
  const err = error as {
    message?: string
    responseBody?: string
  }
  const message = (err.message || '').toLowerCase()
  const responseBody = (err.responseBody || '').toLowerCase()

  if (message.includes('rate_limit') || message.includes('rate limit'))
    return true
  if (
    responseBody.includes('rate_limit') ||
    responseBody.includes('rate limit')
  )
    return true

  return false
}

/**
 * Check if an error is an OAuth authentication error (expired/invalid token).
 * This indicates we should try refreshing the token.
 */
function isOAuthAuthError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  // Check status code (handles both 'status' from AI SDK and 'statusCode' from our errors)
  const statusCode = getErrorStatusCode(error)
  if (statusCode === 401 || statusCode === 403) return true

  // Check error message for auth indicators
  const err = error as {
    message?: string
    responseBody?: string
  }
  const message = (err.message || '').toLowerCase()
  const responseBody = (err.responseBody || '').toLowerCase()

  if (message.includes('unauthorized') || message.includes('invalid_token'))
    return true
  if (message.includes('authentication') || message.includes('expired'))
    return true
  if (
    responseBody.includes('unauthorized') ||
    responseBody.includes('invalid_token')
  )
    return true
  if (
    responseBody.includes('authentication') ||
    responseBody.includes('expired')
  )
    return true

  return false
}

function getModelProvider(model: LanguageModel): string {
  if (typeof model === 'string') return model
  return model.provider
}

function emitCacheDebugProviderRequest(params: {
  callback?: (params: {
    provider: string
    rawBody: unknown
    normalizedBody?: unknown
  }) => void
  provider: string
  rawBody: unknown
}) {
  if (!params.callback) return

  const normalized = normalizeProviderRequestBodyForCacheDebug({
    provider: params.provider,
    body: params.rawBody,
  })

  params.callback({
    provider: params.provider,
    rawBody: params.rawBody,
    normalizedBody: normalized,
  })
}

function emitCacheDebugUsage(params: {
  callback?: (usage: {
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    totalTokens: number
  }) => void
  usage: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    cachedInputTokens?: number
  }
}) {
  if (!params.callback) return

  params.callback({
    inputTokens: params.usage.inputTokens ?? 0,
    outputTokens: params.usage.outputTokens ?? 0,
    cachedInputTokens: params.usage.cachedInputTokens ?? 0,
    totalTokens: params.usage.totalTokens ?? 0,
  })
}

const POST_STREAM_METADATA_TIMEOUT_MS = 500
const MAX_STREAM_RETRIES = 2
const STREAM_RETRY_BASE_DELAY_MS = 1000

async function awaitOptionalPostStreamMetadata<T>(params: {
  promise: PromiseLike<T>
  label: string
  logger: ParamsOf<PromptAiSdkStreamFn>['logger']
  timeoutMs?: number
}): Promise<T | undefined> {
  const { promise, label, logger, timeoutMs = POST_STREAM_METADATA_TIMEOUT_MS } =
    params

  let timeout: number | undefined
  const guardedPromise = Promise.resolve(promise).catch((error) => {
    logger.warn(
      { error: getErrorObject(error) },
      `Ignoring ${label} error after stream completed`,
    )
    return undefined
  })
  const timeoutPromise = new Promise<undefined>((resolve) => {
    timeout = globalThis.setTimeout(resolve, timeoutMs)
  })

  const value = await Promise.race([guardedPromise, timeoutPromise])
  if (timeout) globalThis.clearTimeout(timeout)
  if (value === undefined) {
    logger.debug(
      { timeoutMs },
      `Skipping ${label}; provider did not settle it after stream completion`,
    )
  }
  return value
}

export type ChatGptOAuthStreamErrorPolicy =
  | 'fallback-rate-limit'
  | 'fail-auth-reconnect'
  | 'fail-fast'
  | 'ignore'

function withConfiguredReasoningEffort(
  providerOptions: Record<string, JSONObject> | undefined,
  reasoningEffort: string | undefined,
): Record<string, JSONObject> | undefined {
  if (!reasoningEffort) return providerOptions

  return {
    ...(providerOptions ?? {}),
    openaiCompatible: {
      ...((providerOptions?.openaiCompatible as JSONObject | undefined) ?? {}),
      reasoningEffort,
    },
    openai: {
      ...((providerOptions?.openai as JSONObject | undefined) ?? {}),
      reasoningEffort,
    },
  }
}

function hasProviderOptions(
  providerOptions: Record<string, JSONObject> | undefined,
): providerOptions is Record<string, JSONObject> {
  return Object.keys(providerOptions ?? {}).length > 0
}

export function classifyChatGptOAuthStreamError(params: {
  isChatGptOAuth: boolean
  skipChatGptOAuth?: boolean
  hasYieldedContent: boolean
  error: unknown
}): ChatGptOAuthStreamErrorPolicy {
  const { isChatGptOAuth, skipChatGptOAuth, hasYieldedContent, error } = params

  if (!isChatGptOAuth || skipChatGptOAuth || hasYieldedContent) {
    return 'ignore'
  }

  if (isOAuthRateLimitError(error)) {
    return 'fallback-rate-limit'
  }

  if (isOAuthAuthError(error)) {
    return 'fail-auth-reconnect'
  }

  return 'fail-fast'
}

/**
 * Check if an error is a transient network error that should be retried.
 * Handles socket disconnections, connection resets, timeouts, and other
 * temporary network failures that can occur during LLM streaming.
 */
function isTransientNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const err = error as {
    name?: string
    message?: string
    cause?: unknown
  }
  const message = (err.message ?? '').toLowerCase()

  // Check error names that indicate transient network issues.
  // TypeError is only treated as transient when the message also
  // indicates a network/fetch failure, to avoid retrying programming errors.
  const transientErrorNames = ['TimeoutError', 'FetchError']
  if (
    err.name &&
    transientErrorNames.some((n) => err.name === n)
  ) {
    return true
  }

  // AbortError from the underlying fetch (not our user cancellation)
  if (
    err.name === 'AbortError' &&
    !message.includes('user cancelled')
  ) {
    return true
  }

  // TypeError from Node fetch for network failures
  if (
    err.name === 'TypeError' &&
    message.includes('fetch')
  ) {
    return true
  }

  // Check common transient network error patterns in message
  const transientPatterns = [
    'socket',
    'connection was closed',
    'connection reset',
    'econnreset',
    'etimedout',
    'fetch failed',
    'network error',
    'unexpectedly closed',
    'broken pipe',
    'timeout',
    'econnrefused',
    'econnaborted',
    'enetunreach',
    'eai_again',
  ]

  for (const pattern of transientPatterns) {
    if (message.includes(pattern)) return true
  }

  // Check if AbortError by message (but not from our own signal.aborted)
  if (
    message.includes('abort') &&
    !message.includes('user cancelled')
  ) {
    return true
  }

  // Check cause chain for error codes and messages (walk recursively through causes)
  const seen = new Set<unknown>()
  let currentCause: unknown = err.cause
  while (currentCause && typeof currentCause === 'object') {
    if (seen.has(currentCause)) break // Guard against cyclic cause chains
    seen.add(currentCause)

    const causeObj = currentCause as {
      code?: string
      message?: string
      name?: string
      cause?: unknown
    }

    // Check nested cause codes (normalized to uppercase)
    if (causeObj.code) {
      const codeUpper = causeObj.code.toUpperCase()
      const transientCodes = [
        'ECONNRESET',
        'ETIMEDOUT',
        'ECONNREFUSED',
        'ECONNABORTED',
        'ENETUNREACH',
        'EAI_AGAIN',
        'UND_ERR_SOCKET',
        'UND_ERR_CONNECT_TIMEOUT',
        'UND_ERR_HEADERS_TIMEOUT',
        'UND_ERR_BODY_TIMEOUT',
        'UND_ERR_ABORTED',
        'EPIPE',
        'ENOTFOUND',
        'ENETDOWN',
      ]
      if (transientCodes.some((c) => codeUpper === c)) return true
    }

    // Check nested cause messages for transient patterns
    if (causeObj.message) {
      const causeMessage = causeObj.message.toLowerCase()
      for (const pattern of transientPatterns) {
        if (causeMessage.includes(pattern)) return true
      }
      if (
        causeMessage.includes('abort') &&
        !causeMessage.includes('user cancelled')
      ) {
        return true
      }
    }

    // Check nested cause names
    if (causeObj.name) {
      if (
        causeObj.name === 'TimeoutError' ||
        causeObj.name === 'FetchError' ||
        (causeObj.name === 'AbortError' &&
          !(causeObj.message ?? '').toLowerCase().includes('user cancelled'))
      ) {
        return true
      }
    }

    currentCause = causeObj.cause
  }

  return false
}

export async function* promptAiSdkStream(
  params: ParamsOf<PromptAiSdkStreamFn> & {
    skipChatGptOAuth?: boolean
    chatGptOAuthRetried?: boolean
  },
): ReturnType<PromptAiSdkStreamFn> {
  const {
    providerOptions: originalProviderOptions,
    ...streamParams
  } = params

  const { logger, trackEvent, userId, userInputId, model: requestedModel } = params
  const agentChunkMetadata =
    params.agentId != null ? { agentId: params.agentId } : undefined

  if (params.signal.aborted) {
    logger.info(
      {
        userId: params.userId,
        userInputId: params.userInputId,
      },
      'Skipping stream due to canceled user input',
    )
    return promptAborted('User cancelled input')
  }

  // Track if we've yielded ANY content to the caller across ALL retry attempts.
  // If content was yielded, we cannot safely retry without duplicating output.
  let anyContentYielded = false
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_STREAM_RETRIES; attempt++) {
    // Track if we've yielded content in THIS attempt (for ChatGPT OAuth fallback)
    let hasYieldedContent = false
    let response: ReturnType<typeof streamText>
    let aiSDKModel: LanguageModel
    let isChatGptOAuth: boolean
    let compatibility: { supportsTools: boolean; stripProviderMetadata: boolean; stripCacheControl: boolean }

    try {
      const modelParams: ModelRequestParams = {
        apiKey: params.apiKey,
        model: params.model,
        agentId: params.agentId,
        skipChatGptOAuth: params.skipChatGptOAuth,
        costMode: params.costMode,
        localMode: params.localMode,
        requiresVision: valueContainsImageInput(params.messages),
      }
      const modelResult = await getModelForRequest(modelParams)
      aiSDKModel = modelResult.model
      isChatGptOAuth = modelResult.isChatGptOAuth
      compatibility = modelResult.compatibility
      const { reasoningEffort, effectiveModel } = modelResult

      if (isChatGptOAuth && attempt === 0) {
        trackEvent({
          event: AnalyticsEvent.CHATGPT_OAUTH_REQUEST,
          userId: userId ?? '',
          properties: {
            model: requestedModel,
            userInputId,
          },
          logger,
        })
      }

      const providerOptionsWithReasoning = withConfiguredReasoningEffort(
        originalProviderOptions as Record<string, JSONObject> | undefined,
        reasoningEffort,
      )
      const requestProviderOptions =
        isChatGptOAuth || compatibility.stripProviderMetadata
          ? providerOptionsWithReasoning
          : getProviderOptions({
            ...params,
            // Use the resolved effective model (post-openbuff.json routing) so
            // provider ordering and allow_fallbacks are based on the actual
            // model being used, not the optional requested template field.
            model: effectiveModel,
            providerOptions: providerOptionsWithReasoning,
            agentProviderOptions: params.agentProviderOptions,
          })

      response = streamText({
        ...streamParams,
        ...(compatibility.supportsTools === false
          ? { tools: undefined, toolChoice: undefined }
          : {}),
        prompt: undefined,
        model: aiSDKModel,
        messages: convertCbToModelMessages({
          ...params,
          includeCacheControl:
            isChatGptOAuth && compatibility.stripCacheControl === false,
        }),
        ...(isChatGptOAuth && { maxRetries: 0 }),
        ...(hasProviderOptions(requestProviderOptions)
          ? { providerOptions: requestProviderOptions }
          : {}),
        // Handle tool call errors gracefully by passing them through to our validation layer
        // instead of throwing (which would halt the agent). The only special case is when
        // the tool name matches a spawnable agent - transform those to spawn_agents calls.
        experimental_repairToolCall: async ({ toolCall, tools, error }) => {
          const { spawnableAgents = [], localAgentTemplates = {} } = params
          const toolName = toolCall.toolName

          // Check if this is a NoSuchToolError for a spawnable agent
          // If so, transform to spawn_agents call
          if (NoSuchToolError.isInstance(error) && 'spawn_agents' in tools) {
            // Also check for underscore variant (e.g., "file_picker" -> "file-picker")
            const toolNameWithHyphens = toolName.replace(/_/g, '-')

            const matchingAgentId = spawnableAgents.find((agentId) => {
              const withoutVersion = agentId.split('@')[0]
              const parts = withoutVersion.split('/')
              const agentName = parts[parts.length - 1]
              return (
                agentName === toolName ||
                agentName === toolNameWithHyphens ||
                agentId === toolName
              )
            })
            const isSpawnableAgent = matchingAgentId !== undefined
            const isLocalAgent =
              toolName in localAgentTemplates ||
              toolNameWithHyphens in localAgentTemplates

            if (isSpawnableAgent || isLocalAgent) {
              // Transform agent tool call to spawn_agents
              const deepParseJson = (value: unknown): unknown => {
                if (typeof value === 'string') {
                  try {
                    return deepParseJson(JSON.parse(value))
                  } catch {
                    return value
                  }
                }
                if (Array.isArray(value)) return value.map(deepParseJson)
                if (value !== null && typeof value === 'object') {
                  return Object.fromEntries(
                    Object.entries(value).map(([k, v]) => [k, deepParseJson(v)]),
                  )
                }
                return value
              }

              let input: Record<string, unknown> = {}
              try {
                const rawInput =
                  typeof toolCall.input === 'string'
                    ? JSON.parse(toolCall.input)
                    : (toolCall.input as Record<string, unknown>)
                input = deepParseJson(rawInput) as Record<string, unknown>
              } catch {
                // If parsing fails, use empty object
              }

              const prompt =
                typeof input.prompt === 'string' ? input.prompt : undefined
              const agentParams = Object.fromEntries(
                Object.entries(input).filter(
                  ([key, value]) =>
                    !(key === 'prompt' && typeof value === 'string'),
                ),
              )

              // Use the matching agent ID or corrected name with hyphens
              const correctedAgentType =
                matchingAgentId ??
                (toolNameWithHyphens in localAgentTemplates
                  ? toolNameWithHyphens
                  : toolName)

              const spawnAgentsInput = {
                agents: [
                  {
                    agent_type: correctedAgentType,
                    ...(prompt !== undefined && { prompt }),
                    ...(Object.keys(agentParams).length > 0 && {
                      params: agentParams,
                    }),
                  },
                ],
              }

              logger.info(
                { originalToolName: toolName, transformedInput: spawnAgentsInput },
                'Transformed agent tool call to spawn_agents',
              )

              return {
                ...toolCall,
                toolName: 'spawn_agents',
                input: JSON.stringify(spawnAgentsInput),
              }
            }
          }

          // For all other cases (invalid args, unknown tools, etc.), pass through
          // the original tool call.
          logger.info(
            {
              toolName,
              errorType: error.name,
              error: error.message,
            },
            'Tool error - passing through for graceful error handling',
          )
          return toolCall
        },
      })

      const stopSequenceHandler = new StopSequenceHandler(params.stopSequences)

      for await (const chunkValue of response.fullStream) {
        if (chunkValue.type !== 'text-delta') {
          const flushed = stopSequenceHandler.flush()
          if (flushed) {
            hasYieldedContent = true
            anyContentYielded = true
            yield {
              type: 'text',
              text: flushed,
              ...(agentChunkMetadata ?? {}),
            }
          }
        }
        if (chunkValue.type === 'error') {
          // Error chunks from fullStream are non-network errors (tool failures, model issues, rate limits, etc.)
          // Network errors which cannot be recovered from are thrown, not yielded as chunks.

          const errorBody = APICallError.isInstance(chunkValue.error)
            ? chunkValue.error.responseBody
            : undefined
          const mainErrorMessage =
            chunkValue.error instanceof Error
              ? chunkValue.error.message
              : typeof chunkValue.error === 'string'
                ? chunkValue.error
                : JSON.stringify(chunkValue.error)
          const errorMessage = buildArray([mainErrorMessage, errorBody]).join('\n')

          // Pass these errors back to the agent so it can see what went wrong and retry.
          // Note: If you find any other error types that should be passed through to the agent, add them here!
          if (
            NoSuchToolError.isInstance(chunkValue.error) ||
            InvalidToolInputError.isInstance(chunkValue.error) ||
            ToolCallRepairError.isInstance(chunkValue.error) ||
            TypeValidationError.isInstance(chunkValue.error)
          ) {
            logger.warn(
              {
                chunk: { ...chunkValue, error: undefined },
                error: getErrorObject(chunkValue.error),
                model: params.model,
              },
              'Tool call error in AI SDK stream - passing through to agent to retry',
            )
            hasYieldedContent = true
            anyContentYielded = true
            yield {
              type: 'error',
              message: errorMessage,
            }
            continue
          }

          const chatGptErrorPolicy = classifyChatGptOAuthStreamError({
            isChatGptOAuth,
            skipChatGptOAuth: params.skipChatGptOAuth,
            hasYieldedContent,
            error: chunkValue.error,
          })

          if (chatGptErrorPolicy === 'fallback-rate-limit') {
            const rateLimitErrorDetails = chunkValue.error instanceof Error ? chunkValue.error.message : String(chunkValue.error)
            logger.warn(
              { error: getErrorObject(chunkValue.error) },
              'ChatGPT OAuth rate limited during stream',
            )

            trackEvent({
              event: AnalyticsEvent.CHATGPT_OAUTH_RATE_LIMITED,
              userId: userId ?? '',
              properties: {
                model: requestedModel,
                userInputId,
              },
              logger,
            })

            markChatGptOAuthRateLimited()

            // ChatGPT OAuth is rate-limited: re-resolve the model through the
            // configured openbuff.json providers instead.
            // Prevent parent retry while delegating to child stream
            anyContentYielded = true
            const fallbackResult = yield* promptAiSdkStream({
              ...params,
              skipChatGptOAuth: true,
            })
            return fallbackResult
          }

          if (chatGptErrorPolicy === 'fail-auth-reconnect') {
            logger.info(
              { error: getErrorObject(chunkValue.error) },
              'ChatGPT OAuth auth error during stream, attempting token refresh',
            )

            trackEvent({
              event: AnalyticsEvent.CHATGPT_OAUTH_AUTH_ERROR,
              userId: userId ?? '',
              properties: {
                model: requestedModel,
                userInputId,
              },
              logger,
            })

            // Try refreshing the token and retrying once before failing/falling back
            if (!params.chatGptOAuthRetried) {
              const refreshed = await refreshChatGptOAuthToken()
              if (refreshed) {
                logger.info({ model: requestedModel }, 'ChatGPT OAuth token refreshed, retrying request')
                // Prevent parent retry while delegating to child stream
                anyContentYielded = true
                const retryResult = yield* promptAiSdkStream({
                  ...params,
                  chatGptOAuthRetried: true,
                })
                return retryResult
              }
              logger.warn({ model: requestedModel }, 'ChatGPT OAuth token refresh failed, unable to recover')
            }

            // Refresh failed or already retried: re-resolve the model through
            // the configured openbuff.json providers instead.
            // Prevent parent retry while delegating to child stream
            anyContentYielded = true
            const fallbackResult = yield* promptAiSdkStream({
              ...params,
              skipChatGptOAuth: true,
            })
            return fallbackResult
          }

          logger.error(
            {
              chunk: { ...chunkValue, error: undefined },
              error: getErrorObject(chunkValue.error),
              model: params.model,
            },
            'Error in AI SDK stream',
          )

          // For all other errors, throw them -- they are fatal.
          throw chunkValue.error
        }
        if (chunkValue.type === 'reasoning-delta') {
          const reasoningExcluded = (['openrouter', 'codebuff'] as const).some(
            (p) =>
              (
                params.providerOptions?.[p] as
                | OpenRouterProviderOptions
                | undefined
              )?.reasoning?.exclude,
          )
          if (!reasoningExcluded) {
            hasYieldedContent = true
            anyContentYielded = true
            yield {
              type: 'reasoning',
              text: chunkValue.text,
            }
          }
        }
        if (chunkValue.type === 'text-delta') {
          if (!params.stopSequences) {
            if (chunkValue.text) {
              hasYieldedContent = true
              anyContentYielded = true
              yield {
                type: 'text',
                text: chunkValue.text,
                ...(agentChunkMetadata ?? {}),
              }
            }
            continue
          }

          const stopSequenceResult = stopSequenceHandler.process(chunkValue.text)
          if (stopSequenceResult.text) {
            hasYieldedContent = true
            anyContentYielded = true
            yield {
              type: 'text',
              text: stopSequenceResult.text,
              ...(agentChunkMetadata ?? {}),
            }
          }
          if (stopSequenceResult.endOfStream) {
            break
          }
        }
        if (chunkValue.type === 'tool-call') {
          hasYieldedContent = true
          anyContentYielded = true
          const { providerMetadata, ...toolCall } = chunkValue
          yield {
            ...toolCall,
            ...(providerMetadata
              ? { providerOptions: providerMetadata }
              : {}),
          }
        }
      }
      const flushed = stopSequenceHandler.flush()
      if (flushed) {
        anyContentYielded = true
        yield {
          type: 'text',
          text: flushed,
          ...(agentChunkMetadata ?? {}),
        }
      }

      // Stream completed successfully — collect post-stream metadata
      const responseValue = await awaitOptionalPostStreamMetadata({
        promise: response.response,
        label: 'provider response metadata',
        logger,
      })
      const messageId =
        responseValue && typeof responseValue.id === 'string'
          ? responseValue.id
          : null

      if (params.onCacheDebugProviderRequestBuilt) {
        const requestMetadata = await awaitOptionalPostStreamMetadata({
          promise: response.request,
          label: 'provider request metadata',
          logger,
        })
        if (requestMetadata) {
          emitCacheDebugProviderRequest({
            callback: params.onCacheDebugProviderRequestBuilt,
            provider: getModelProvider(aiSDKModel),
            rawBody: requestMetadata.body,
          })
        }
      }

      if (params.onCacheDebugUsageReceived) {
        const usageResult = await awaitOptionalPostStreamMetadata({
          promise: response.usage,
          label: 'provider usage metadata',
          logger,
        })
        if (usageResult) {
          emitCacheDebugUsage({
            callback: params.onCacheDebugUsageReceived,
            usage: usageResult,
          })
        }
      }

      // Skip cost tracking for ChatGPT OAuth (user is on their own subscription)
      if (!isChatGptOAuth && !compatibility.stripProviderMetadata) {
        const providerMetadataResult = await awaitOptionalPostStreamMetadata({
          promise: response.providerMetadata,
          label: 'provider billing metadata',
          logger,
        })
        const providerMetadata = providerMetadataResult ?? {}

        let costOverrideDollars: number | undefined
        if (providerMetadata.codebuff) {
          if (providerMetadata.codebuff.usage) {
            const openrouterUsage = providerMetadata.codebuff
              .usage as OpenRouterUsageAccounting

            costOverrideDollars =
              (openrouterUsage.cost ?? 0) +
              (openrouterUsage.costDetails?.upstreamInferenceCost ?? 0)
          }
        }

        // Call the cost callback if provided
        if (params.onCostCalculated && costOverrideDollars) {
          await params.onCostCalculated(
            calculateUsedCredits({ costDollars: costOverrideDollars }),
          )
        }
      }

      return promptSuccess(messageId)
    } catch (error) {
      lastError = error

      // Don't retry user-cancelled requests
      if (params.signal.aborted) {
        throw error
      }

      if (anyContentYielded) {
        // Content was already yielded to the caller — cannot safely retry
        logger.warn(
          { error: getErrorObject(error), attempt: attempt + 1 },
          'Stream error after content was yielded, cannot retry',
        )
        throw error
      }

      if (!isTransientNetworkError(error)) {
        throw error
      }

      if (attempt >= MAX_STREAM_RETRIES) {
        logger.error(
          { error: getErrorObject(error), attempts: attempt + 1 },
          'Stream failed after all retry attempts',
        )
        throw error
      }

      const delayMs =
        STREAM_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
      logger.warn(
        {
          error: getErrorObject(error),
          attempt: attempt + 1,
          maxRetries: MAX_STREAM_RETRIES,
          delayMs,
        },
        'Transient network error during stream, retrying with delay',
      )
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  // Should be unreachable, but if the loop exits without returning or throwing,
  // rethrow the last error
  throw lastError
}

export async function promptAiSdk(
  params: ParamsOf<PromptAiSdkFn>,
): ReturnType<PromptAiSdkFn> {
  const { logger } = params

  if (params.signal.aborted) {
    logger.info(
      {
        userId: params.userId,
        userInputId: params.userInputId,
      },
      'Skipping prompt due to canceled user input',
    )
    return promptAborted('User cancelled input')
  }

  const modelParams: ModelRequestParams = {
    apiKey: params.apiKey,
    model: params.model,
    agentId: params.agentId,
    skipChatGptOAuth: true, // Non-streaming skips ChatGPT OAuth; local/provider config may still route BYOK.
    localMode: params.localMode,
    requiresVision: valueContainsImageInput(params.messages),
  }
  const { model: aiSDKModel, compatibility, reasoningEffort, effectiveModel: effectiveModelSdk } = await getModelForRequest(modelParams)

  const providerOptionsWithReasoning = withConfiguredReasoningEffort(
    (params as { providerOptions?: Record<string, JSONObject> }).providerOptions,
    reasoningEffort,
  )
  const requestProviderOptions = compatibility.stripProviderMetadata
    ? providerOptionsWithReasoning
    : getProviderOptions({
      ...params,
      model: effectiveModelSdk,
      providerOptions: providerOptionsWithReasoning,
      agentProviderOptions: params.agentProviderOptions,
      cacheDebugCorrelation: params.cacheDebugCorrelation,
    })

  const response = await generateText({
    ...params,
    ...(compatibility.supportsTools === false
      ? { tools: undefined, toolChoice: undefined }
      : {}),
    prompt: undefined,
    model: aiSDKModel,
    messages: convertCbToModelMessages({
      ...params,
      includeCacheControl: compatibility.stripCacheControl === false,
    }),
    ...(hasProviderOptions(requestProviderOptions)
      ? { providerOptions: requestProviderOptions }
      : {}),
  })
  emitCacheDebugProviderRequest({
    callback: params.onCacheDebugProviderRequestBuilt,
    provider: getModelProvider(aiSDKModel),
    rawBody: response.request?.body,
  })
  emitCacheDebugUsage({
    callback: params.onCacheDebugUsageReceived,
    usage: response.usage,
  })
  const content = response.text

  const providerMetadata = response.providerMetadata ?? {}
  let costOverrideDollars: number | undefined
  if (providerMetadata.codebuff) {
    if (providerMetadata.codebuff.usage) {
      const openrouterUsage = providerMetadata.codebuff
        .usage as OpenRouterUsageAccounting

      costOverrideDollars =
        (openrouterUsage.cost ?? 0) +
        (openrouterUsage.costDetails?.upstreamInferenceCost ?? 0)
    }
  }

  // Call the cost callback if provided
  if (params.onCostCalculated && costOverrideDollars) {
    await params.onCostCalculated(
      calculateUsedCredits({ costDollars: costOverrideDollars }),
    )
  }

  return promptSuccess(content)
}

export async function promptAiSdkStructured<T>(
  params: PromptAiSdkStructuredInput<T>,
): PromptAiSdkStructuredOutput<T> {
  const { logger } = params

  if (params.signal.aborted) {
    logger.info(
      {
        userId: params.userId,
        userInputId: params.userInputId,
      },
      'Skipping structured prompt due to canceled user input',
    )
    return promptAborted('User cancelled input')
  }
  const modelParams: ModelRequestParams = {
    apiKey: params.apiKey,
    model: params.model,
    agentId: params.agentId,
    skipChatGptOAuth: true, // Non-streaming skips ChatGPT OAuth; local/provider config may still route BYOK.
    localMode: params.localMode,
    requiresVision: valueContainsImageInput(params.messages),
  }
  const { model: aiSDKModel, compatibility, reasoningEffort, effectiveModel: effectiveModelStructured } = await getModelForRequest(modelParams)

  const providerOptionsWithReasoning = withConfiguredReasoningEffort(
    (params as { providerOptions?: Record<string, JSONObject> }).providerOptions,
    reasoningEffort,
  )
  const requestProviderOptions = compatibility.stripProviderMetadata
    ? providerOptionsWithReasoning
    : getProviderOptions({
      ...params,
      model: effectiveModelStructured,
      providerOptions: providerOptionsWithReasoning,
      agentProviderOptions: params.agentProviderOptions,
      cacheDebugCorrelation: params.cacheDebugCorrelation,
    })

  const response = await generateObject<z.ZodType<T>, 'object'>({
    ...params,
    ...(compatibility.supportsTools === false
      ? { tools: undefined, toolChoice: undefined }
      : {}),
    prompt: undefined,
    model: aiSDKModel,
    output: 'object',
    messages: convertCbToModelMessages({
      ...params,
      includeCacheControl: compatibility.stripCacheControl === false,
    }),
    ...(hasProviderOptions(requestProviderOptions)
      ? { providerOptions: requestProviderOptions }
      : {}),
  })

  emitCacheDebugProviderRequest({
    callback: params.onCacheDebugProviderRequestBuilt,
    provider: getModelProvider(aiSDKModel),
    rawBody: response.request?.body,
  })
  emitCacheDebugUsage({
    callback: params.onCacheDebugUsageReceived,
    usage: response.usage,
  })

  const content = response.object

  const providerMetadata = response.providerMetadata ?? {}
  let costOverrideDollars: number | undefined
  if (providerMetadata.codebuff) {
    if (providerMetadata.codebuff.usage) {
      const openrouterUsage = providerMetadata.codebuff
        .usage as OpenRouterUsageAccounting

      costOverrideDollars =
        (openrouterUsage.cost ?? 0) +
        (openrouterUsage.costDetails?.upstreamInferenceCost ?? 0)
    }
  }

  // Call the cost callback if provided
  if (params.onCostCalculated && costOverrideDollars) {
    await params.onCostCalculated(
      calculateUsedCredits({ costDollars: costOverrideDollars }),
    )
  }

  return promptSuccess(content)
}
