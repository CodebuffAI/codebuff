import { models } from '@codebuff/common/old-constants'
import { buildArray } from '@codebuff/common/util/array'
import { getErrorObject } from '@codebuff/common/util/error'
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

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { getModelForRequest, markClaudeOAuthRateLimited, fetchClaudeOAuthResetTime } from './model-provider'
import { getValidClaudeOAuthCredentials } from '../credentials'
import { isClaudeOAuthRateLimitError, isClaudeOAuthAuthError } from './claude-oauth-errors'
import { createToolCallRepairHandler } from './tool-call-repair'
import { extractAndTrackCost } from './stream-cost-tracker'

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

function getProviderOptions(params: {
  model: string
  runId: string
  clientSessionId: string
  providerOptions?: Record<string, JSONObject>
  agentProviderOptions?: OpenRouterProviderRoutingOptions
  n?: number
}): { codebuff: JSONObject } {
  const {
    model,
    runId,
    clientSessionId,
    providerOptions,
    agentProviderOptions,
    n,
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
    // Could either be "codebuff" or "openaiCompatible"
    codebuff: {
      ...providerOptions?.codebuff,
      // All values here get appended to the request body
      codebuff_metadata: {
        run_id: runId,
        client_id: clientSessionId,
        ...(n && { n }),
      },
      provider: providerConfig,
    },
  }
}

export async function* promptAiSdkStream(
  params: ParamsOf<PromptAiSdkStreamFn> & {
    skipClaudeOAuth?: boolean
    onClaudeOAuthStatusChange?: (isActive: boolean) => void
  },
): ReturnType<PromptAiSdkStreamFn> {
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
    return null
  }

  const modelParams: ModelRequestParams = {
    apiKey: params.apiKey,
    model: params.model,
    skipClaudeOAuth: params.skipClaudeOAuth,
  }
  const { model: aiSDKModel, isClaudeOAuth } = await getModelForRequest(modelParams)

  // Track and notify about Claude OAuth usage
  if (isClaudeOAuth) {
    trackEvent({
      event: AnalyticsEvent.CLAUDE_OAUTH_REQUEST,
      userId: userId ?? '',
      properties: {
        model: requestedModel,
        userInputId,
      },
      logger,
    })
    if (params.onClaudeOAuthStatusChange) {
      params.onClaudeOAuthStatusChange(true)
    }
  }

  const { spawnableAgents = [], localAgentTemplates = {} } = params
  const toolCallRepairHandler = createToolCallRepairHandler({
    spawnableAgents,
    localAgentTemplates,
    logger,
  })

  const response = streamText({
    ...params,
    prompt: undefined,
    model: aiSDKModel,
    messages: convertCbToModelMessages(params),
    // When using Claude OAuth, disable retries so we can immediately fall back to Codebuff
    // backend on rate limit errors instead of retrying 4 times first
    ...(isClaudeOAuth && { maxRetries: 0 }),
    providerOptions: getProviderOptions({
      ...params,
      agentProviderOptions: params.agentProviderOptions,
    }),
    // Handle tool call errors gracefully by passing them through to our validation layer
    // instead of throwing (which would halt the agent). The only special case is when
    // the tool name matches a spawnable agent - transform those to spawn_agents calls.
    experimental_repairToolCall: toolCallRepairHandler,
  })

  let content = ''
  const stopSequenceHandler = new StopSequenceHandler(params.stopSequences)

  // Track if we've yielded any content - if so, we can't safely fall back
  let hasYieldedContent = false

  for await (const chunkValue of response.fullStream) {
    if (chunkValue.type !== 'text-delta') {
      const flushed = stopSequenceHandler.flush()
      if (flushed) {
        hasYieldedContent = true
        content += flushed
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
      // Add other error types that should be passed through to the agent here
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
        yield {
          type: 'error',
          message: errorMessage,
        }
        continue
      }

      // Check if this is a Claude OAuth rate limit error - only fall back if no content yielded yet
      if (
        isClaudeOAuth &&
        !params.skipClaudeOAuth &&
        !hasYieldedContent &&
        isClaudeOAuthRateLimitError(chunkValue.error)
      ) {
        logger.info(
          { error: getErrorObject(chunkValue.error) },
          'Claude OAuth rate limited during stream, falling back to Codebuff backend',
        )
        // Track the rate limit event
        trackEvent({
          event: AnalyticsEvent.CLAUDE_OAUTH_RATE_LIMITED,
          userId: userId ?? '',
          properties: {
            model: requestedModel,
            userInputId,
          },
          logger,
        })
        // Try to get the actual reset time from the quota API, fall back to default cooldown
        const credentials = await getValidClaudeOAuthCredentials()
        const resetTime = credentials?.accessToken 
          ? await fetchClaudeOAuthResetTime(credentials.accessToken)
          : null
        // Mark as rate-limited so subsequent requests skip Claude OAuth
        markClaudeOAuthRateLimited(resetTime ?? undefined)
        if (params.onClaudeOAuthStatusChange) {
          params.onClaudeOAuthStatusChange(false)
        }
        // Retry with Codebuff backend
        const fallbackResult = yield* promptAiSdkStream({
          ...params,
          skipClaudeOAuth: true,
        })
        return fallbackResult
      }

      // Check if this is a Claude OAuth authentication error (expired token) - only fall back if no content yielded yet
      if (
        isClaudeOAuth &&
        !params.skipClaudeOAuth &&
        !hasYieldedContent &&
        isClaudeOAuthAuthError(chunkValue.error)
      ) {
        logger.info(
          { error: getErrorObject(chunkValue.error) },
          'Claude OAuth auth error during stream, falling back to Codebuff backend',
        )
        // Track the auth error event
        trackEvent({
          event: AnalyticsEvent.CLAUDE_OAUTH_AUTH_ERROR,
          userId: userId ?? '',
          properties: {
            model: requestedModel,
            userInputId,
          },
          logger,
        })
        if (params.onClaudeOAuthStatusChange) {
          params.onClaudeOAuthStatusChange(false)
        }
        // Retry with Codebuff backend (skipClaudeOAuth will bypass the failed OAuth)
        const fallbackResult = yield* promptAiSdkStream({
          ...params,
          skipClaudeOAuth: true,
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
      for (const provider of ['openrouter', 'codebuff'] as const) {
        if (
          (
            params.providerOptions?.[provider] as
              | OpenRouterProviderOptions
              | undefined
          )?.reasoning?.exclude
        ) {
          continue
        }
      }
      yield {
        type: 'reasoning',
        text: chunkValue.text,
      }
    }
    if (chunkValue.type === 'text-delta') {
      if (!params.stopSequences) {
        content += chunkValue.text
        if (chunkValue.text) {
          hasYieldedContent = true
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
        content += stopSequenceResult.text
        yield {
          type: 'text',
          text: stopSequenceResult.text,
          ...(agentChunkMetadata ?? {}),
        }
      }
    }
    if (chunkValue.type === 'tool-call') {
      yield chunkValue
    }
  }
  const flushed = stopSequenceHandler.flush()
  if (flushed) {
    content += flushed
    yield {
      type: 'text',
      text: flushed,
      ...(agentChunkMetadata ?? {}),
    }
  }

  const responseValue = await response.response
  const messageId = responseValue.id

  // Skip cost tracking for Claude OAuth (user is on their own subscription)
  if (!isClaudeOAuth) {
    const providerMetadataResult = await response.providerMetadata
    await extractAndTrackCost({
      providerMetadata: providerMetadataResult as Record<string, unknown> | undefined,
      onCostCalculated: params.onCostCalculated,
    })
  }

  return messageId
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
    return ''
  }

  const modelParams: ModelRequestParams = {
    apiKey: params.apiKey,
    model: params.model,
    skipClaudeOAuth: true, // Always use Codebuff backend for non-streaming
  }
  const { model: aiSDKModel } = await getModelForRequest(modelParams)

  const response = await generateText({
    ...params,
    prompt: undefined,
    model: aiSDKModel,
    messages: convertCbToModelMessages(params),
    providerOptions: getProviderOptions({
      ...params,
      agentProviderOptions: params.agentProviderOptions,
    }),
  })
  const content = response.text

  await extractAndTrackCost({
    providerMetadata: response.providerMetadata as Record<string, unknown> | undefined,
    onCostCalculated: params.onCostCalculated,
  })

  return content
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
    return {} as T
  }
  const modelParams: ModelRequestParams = {
    apiKey: params.apiKey,
    model: params.model,
    skipClaudeOAuth: true, // Always use Codebuff backend for non-streaming
  }
  const { model: aiSDKModel } = await getModelForRequest(modelParams)

  const response = await generateObject<z.ZodType<T>, 'object'>({
    ...params,
    prompt: undefined,
    model: aiSDKModel,
    output: 'object',
    messages: convertCbToModelMessages(params),
    providerOptions: getProviderOptions({
      ...params,
      agentProviderOptions: params.agentProviderOptions,
    }),
  })

  const content = response.object

  await extractAndTrackCost({
    providerMetadata: response.providerMetadata as Record<string, unknown> | undefined,
    onCostCalculated: params.onCostCalculated,
  })

  return content
}
