import path from 'path'

import {
  checkLiveUserInput,
  getLiveUserInputIds,
} from '@codebuff/agent-runtime/live-user-inputs'
import {
  BYOK_OPENROUTER_ENV_VAR,
  BYOK_OPENROUTER_HEADER,
} from '@codebuff/common/constants/byok'
import { models, PROFIT_MARGIN } from '@codebuff/common/old-constants'
import { buildArray } from '@codebuff/common/util/array'
import { getErrorObject } from '@codebuff/common/util/error'
import { convertCbToModelMessages } from '@codebuff/common/util/messages'
import { isExplicitlyDefinedModel } from '@codebuff/common/util/model-utils'
import { StopSequenceHandler } from '@codebuff/common/util/stop-sequence'
import {
  OpenAICompatibleChatLanguageModel,
  VERSION,
} from '@codebuff/internal/openai-compatible/index'
import {
  streamText,
  APICallError,
  generateText,
  generateObject,
  NoSuchToolError,
  InvalidToolInputError,
} from 'ai'

import { WEBSITE_URL } from '../constants'
import { NetworkError, PaymentRequiredError, ErrorCodes } from '../errors'

import type { ErrorCode } from '../errors'
import type { LanguageModelV2 } from '@ai-sdk/provider'
import type { OpenRouterProviderRoutingOptions } from '@codebuff/common/types/agent-template'
import type {
  PromptAiSdkFn,
  PromptAiSdkStreamFn,
  PromptAiSdkStructuredInput,
  PromptAiSdkStructuredOutput,
} from '@codebuff/common/types/contracts/llm'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type { JSONObject } from '@codebuff/common/types/json'
import type { OpenRouterProviderOptions } from '@openrouter/ai-sdk-provider'
import type z from 'zod/v4'

// Forked from https://github.com/OpenRouterTeam/ai-sdk-provider/
type OpenRouterUsageAccounting = {
  cost: number | null
  costDetails: {
    upstreamInferenceCost: number | null
  }
}

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

function calculateUsedCredits(params: { costDollars: number }): number {
  const { costDollars } = params

  return Math.round(costDollars * (1 + PROFIT_MARGIN) * 100)
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
      transforms: ['middle-out'],
      provider: providerConfig,
    },
  }
}

function getAiSdkModel(params: {
  apiKey: string
  model: string
}): LanguageModelV2 {
  const { apiKey, model } = params

  const openrouterUsage: OpenRouterUsageAccounting = {
    cost: null,
    costDetails: {
      upstreamInferenceCost: null,
    },
  }

  const openrouterApiKey = process.env[BYOK_OPENROUTER_ENV_VAR]
  const codebuffBackendModel = new OpenAICompatibleChatLanguageModel(model, {
    provider: 'codebuff',
    url: ({ path: endpoint }) =>
      new URL(path.join('/api/v1', endpoint), WEBSITE_URL).toString(),
    headers: () => ({
      Authorization: `Bearer ${apiKey}`,
      'user-agent': `ai-sdk/openai-compatible/${VERSION}/codebuff`,
      ...(openrouterApiKey && { [BYOK_OPENROUTER_HEADER]: openrouterApiKey }),
    }),
    metadataExtractor: {
      extractMetadata: async ({ parsedBody }: { parsedBody: any }) => {
        if (openrouterApiKey !== undefined) {
          return { codebuff: { usage: openrouterUsage } }
        }

        if (typeof parsedBody?.usage?.cost === 'number') {
          openrouterUsage.cost = parsedBody.usage.cost
        }
        if (
          typeof parsedBody?.usage?.cost_details?.upstream_inference_cost ===
          'number'
        ) {
          openrouterUsage.cost =
            parsedBody.usage.cost_details.upstream_inference_cost
        }
        return { codebuff: { usage: openrouterUsage } }
      },
      createStreamExtractor: () => ({
        processChunk: (parsedChunk: any) => {
          if (openrouterApiKey !== undefined) {
            return
          }

          if (typeof parsedChunk?.usage?.cost === 'number') {
            openrouterUsage.cost = parsedChunk.usage.cost
          }
          if (
            typeof parsedChunk?.usage?.cost_details?.upstream_inference_cost ===
            'number'
          ) {
            openrouterUsage.costDetails.upstreamInferenceCost =
              parsedChunk.usage.cost_details.upstream_inference_cost
          }
        },
        buildMetadata: () => {
          return { codebuff: { usage: openrouterUsage } }
        },
      }),
    },
    fetch: undefined,
    includeUsage: undefined,
    supportsStructuredOutputs: true,
  })
  return codebuffBackendModel
}

export async function* promptAiSdkStream(
  params: ParamsOf<PromptAiSdkStreamFn>,
): ReturnType<PromptAiSdkStreamFn> {
  const { logger } = params
  const agentChunkMetadata =
    params.agentId != null ? { agentId: params.agentId } : undefined

  if (
    !checkLiveUserInput({ ...params, clientSessionId: params.clientSessionId })
  ) {
    logger.info(
      {
        userId: params.userId,
        userInputId: params.userInputId,
        liveUserInputId: getLiveUserInputIds(params),
      },
      'Skipping stream due to canceled user input',
    )
    return null
  }

  let aiSDKModel = getAiSdkModel(params)

  const response = streamText({
    ...params,
    prompt: undefined,
    model: aiSDKModel,
    messages: convertCbToModelMessages(params),
    providerOptions: getProviderOptions({
      ...params,
      agentProviderOptions: params.agentProviderOptions,
    }),
    // Handle tool call errors gracefully by passing them through to our validation layer
    // instead of throwing (which would halt the agent). The only special case is when
    // the tool name matches a spawnable agent - transform those to spawn_agents calls.
    experimental_repairToolCall: async ({ toolCall, tools, error }) => {
      const { spawnableAgents = [], localAgentTemplates = {} } = params
      const toolName = toolCall.toolName

      // Check if this is a NoSuchToolError for a spawnable agent
      // If so, transform to spawn_agents call
      if (NoSuchToolError.isInstance(error) && 'spawn_agents' in tools) {
        const isSpawnableAgent = spawnableAgents.some((agentId) => {
          const withoutVersion = agentId.split('@')[0]
          const parts = withoutVersion.split('/')
          const agentName = parts[parts.length - 1]
          return agentName === toolName || agentId === toolName
        })
        const isLocalAgent = toolName in localAgentTemplates

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

          const spawnAgentsInput = {
            agents: [
              {
                agent_type: toolName,
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
      // the original tool call. Our tool-executor.ts will validate it and return
      // a friendly error message as a tool result instead of crashing.
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

  let content = ''
  const stopSequenceHandler = new StopSequenceHandler(params.stopSequences)

  for await (const chunkValue of response.fullStream) {
    if (chunkValue.type !== 'text-delta') {
      const flushed = stopSequenceHandler.flush()
      if (flushed) {
        content += flushed
        yield {
          type: 'text',
          text: flushed,
          ...(agentChunkMetadata ?? {}),
        }
      }
    }
    if (chunkValue.type === 'error') {
      logger.error(
        {
          chunk: { ...chunkValue, error: undefined },
          error: getErrorObject(chunkValue.error),
          model: params.model,
        },
        'Error from AI SDK',
      )

      const errorBody = APICallError.isInstance(chunkValue.error)
        ? chunkValue.error.responseBody
        : undefined
      const mainErrorMessage =
        chunkValue.error instanceof Error
          ? chunkValue.error.message
          : typeof chunkValue.error === 'string'
            ? chunkValue.error
            : JSON.stringify(chunkValue.error)
      const errorMessage = `Error from AI SDK (model ${params.model}): ${buildArray([mainErrorMessage, errorBody]).join('\n')}`

      // Determine error code from the error
      let errorCode: ErrorCode = ErrorCodes.UNKNOWN_ERROR
      let statusCode: number | undefined

      if (APICallError.isInstance(chunkValue.error)) {
        statusCode = chunkValue.error.statusCode
        if (statusCode) {
          if (statusCode === 402) {
            // Payment required - extract message from JSON response body
            let paymentErrorMessage = mainErrorMessage
            if (errorBody) {
              try {
                const parsed = JSON.parse(errorBody)
                paymentErrorMessage = parsed.message || errorBody
              } catch {
                paymentErrorMessage = errorBody
              }
            }
            throw new PaymentRequiredError(paymentErrorMessage)
          } else if (statusCode === 503) {
            errorCode = ErrorCodes.SERVICE_UNAVAILABLE
          } else if (statusCode >= 500) {
            errorCode = ErrorCodes.SERVER_ERROR
          } else if (statusCode === 408 || statusCode === 429) {
            errorCode = ErrorCodes.TIMEOUT
          }
        }
      } else if (chunkValue.error instanceof Error) {
        // Check error message for error type indicators (case-insensitive)
        const msg = chunkValue.error.message.toLowerCase()
        if (msg.includes('service unavailable') || msg.includes('503')) {
          errorCode = ErrorCodes.SERVICE_UNAVAILABLE
        } else if (
          msg.includes('econnrefused') ||
          msg.includes('connection refused')
        ) {
          errorCode = ErrorCodes.CONNECTION_REFUSED
        } else if (msg.includes('enotfound') || msg.includes('dns')) {
          errorCode = ErrorCodes.DNS_FAILURE
        } else if (msg.includes('timeout')) {
          errorCode = ErrorCodes.TIMEOUT
        } else if (
          msg.includes('server error') ||
          msg.includes('500') ||
          msg.includes('502') ||
          msg.includes('504')
        ) {
          errorCode = ErrorCodes.SERVER_ERROR
        } else if (msg.includes('network') || msg.includes('fetch failed')) {
          errorCode = ErrorCodes.NETWORK_ERROR
        }
      }

      // Throw NetworkError so retry logic can handle it
      throw new NetworkError(
        errorMessage,
        errorCode,
        statusCode,
        chunkValue.error,
      )
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

  const providerMetadata = (await response.providerMetadata) ?? {}

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

  const messageId = (await response.response).id

  // Call the cost callback if provided
  if (params.onCostCalculated && costOverrideDollars) {
    await params.onCostCalculated(
      calculateUsedCredits({ costDollars: costOverrideDollars }),
    )
  }

  return messageId
}

export async function promptAiSdk(
  params: ParamsOf<PromptAiSdkFn>,
): ReturnType<PromptAiSdkFn> {
  const { logger } = params

  if (!checkLiveUserInput(params)) {
    logger.info(
      {
        userId: params.userId,
        userInputId: params.userInputId,
        liveUserInputId: getLiveUserInputIds(params),
      },
      'Skipping prompt due to canceled user input',
    )
    return ''
  }

  let aiSDKModel = getAiSdkModel(params)

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

  return content
}

export async function promptAiSdkStructured<T>(
  params: PromptAiSdkStructuredInput<T>,
): PromptAiSdkStructuredOutput<T> {
  const { logger } = params

  if (!checkLiveUserInput(params)) {
    logger.info(
      {
        userId: params.userId,
        userInputId: params.userInputId,
        liveUserInputId: getLiveUserInputIds(params),
      },
      'Skipping structured prompt due to canceled user input',
    )
    return {} as T
  }
  let aiSDKModel = getAiSdkModel(params)

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

  return content
}
