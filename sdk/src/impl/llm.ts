import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { streamText, APICallError, generateText, generateObject } from 'ai'

import { PROFIT_MARGIN } from '../../../common/src/old-constants'
import { buildArray } from '../../../common/src/util/array'
import { getErrorObject } from '../../../common/src/util/error'
import { convertCbToModelMessages } from '../../../common/src/util/messages'
import { StopSequenceHandler } from '../../../common/src/util/stop-sequence'
import {
  checkLiveUserInput,
  getLiveUserInputIds,
} from '../../../packages/agent-runtime/src/live-user-inputs'
import { WEBSITE_URL } from '../constants'

import type {
  PromptAiSdkFn,
  PromptAiSdkStreamFn,
  PromptAiSdkStructuredInput,
  PromptAiSdkStructuredOutput,
} from '../../../common/src/types/contracts/llm'
import type { ParamsOf } from '../../../common/src/types/function-params'
import type { LanguageModelV2 } from '@ai-sdk/provider'
import type {
  OpenRouterProviderOptions,
  OpenRouterUsageAccounting,
} from '@openrouter/ai-sdk-provider'
import type z from 'zod/v4'

function getAiSdkModel(params: {
  apiKey: string
  model: string
}): LanguageModelV2 {
  const { apiKey, model } = params

  return createOpenAICompatible({
    name: 'codebuff',
    apiKey,
    baseURL: WEBSITE_URL + '/api/v1',
    supportsStructuredOutputs: true,
  })(model)
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
    providerOptions: {
      codebuff: {
        codebuff_metadata: {
          run_id: params.userInputId,
          client_id: params.clientSessionId,
        },
      },
    },
  })

  let content = ''
  const stopSequenceHandler = new StopSequenceHandler(params.stopSequences)

  for await (const chunk of response.fullStream) {
    if (chunk.type !== 'text-delta') {
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
    if (chunk.type === 'error') {
      logger.error(
        {
          chunk: { ...chunk, error: undefined },
          error: getErrorObject(chunk.error),
          model: params.model,
        },
        'Error from AI SDK',
      )

      const errorBody = APICallError.isInstance(chunk.error)
        ? chunk.error.responseBody
        : undefined
      const mainErrorMessage =
        chunk.error instanceof Error
          ? chunk.error.message
          : typeof chunk.error === 'string'
            ? chunk.error
            : JSON.stringify(chunk.error)
      const errorMessage = `Error from AI SDK (model ${params.model}): ${buildArray([mainErrorMessage, errorBody]).join('\n')}`
      yield {
        type: 'error',
        message: errorMessage,
      }

      return null
    }
    if (chunk.type === 'reasoning-delta') {
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
        text: chunk.text,
      }
    }
    if (chunk.type === 'text-delta') {
      if (!params.stopSequences) {
        content += chunk.text
        if (chunk.text) {
          yield {
            type: 'text',
            text: chunk.text,
            ...(agentChunkMetadata ?? {}),
          }
        }
        continue
      }

      const stopSequenceResult = stopSequenceHandler.process(chunk.text)
      if (stopSequenceResult.text) {
        content += stopSequenceResult.text
        yield {
          type: 'text',
          text: stopSequenceResult.text,
          ...(agentChunkMetadata ?? {}),
        }
      }
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
  const usage = await response.usage
  let inputTokens = usage.inputTokens || 0
  let cacheReadInputTokens: number = 0
  let cacheCreationInputTokens: number = 0
  let costOverrideDollars: number | undefined
  if (providerMetadata.anthropic) {
    cacheReadInputTokens =
      typeof providerMetadata.anthropic.cacheReadInputTokens === 'number'
        ? providerMetadata.anthropic.cacheReadInputTokens
        : 0
    cacheCreationInputTokens =
      typeof providerMetadata.anthropic.cacheCreationInputTokens === 'number'
        ? providerMetadata.anthropic.cacheCreationInputTokens
        : 0
  }
  if (providerMetadata.openrouter) {
    if (providerMetadata.openrouter.usage) {
      const openrouterUsage = providerMetadata.openrouter
        .usage as OpenRouterUsageAccounting
      cacheReadInputTokens =
        openrouterUsage.promptTokensDetails?.cachedTokens ?? 0
      inputTokens = openrouterUsage.promptTokens - cacheReadInputTokens

      costOverrideDollars =
        (openrouterUsage.cost ?? 0) +
        (openrouterUsage.costDetails?.upstreamInferenceCost ?? 0)
    }
  }

  const messageId = (await response.response).id

  // Call the cost callback if provided
  if (params.onCostCalculated && costOverrideDollars) {
    const creditsUsed = costOverrideDollars * (1 + PROFIT_MARGIN)
    await params.onCostCalculated(creditsUsed)
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

  const startTime = Date.now()
  let aiSDKModel = getAiSdkModel(params)

  const response = await generateText({
    ...params,
    prompt: undefined,
    model: aiSDKModel,
    messages: convertCbToModelMessages(params),
    providerOptions: {
      codebuff: {
        codebuff_metadata: {
          run_id: params.userInputId,
          client_id: params.clientSessionId,
        },
      },
    },
  })
  const content = response.text

  const messageId = response.response.id
  const providerMetadata = response.providerMetadata ?? {}
  const usage = response.usage
  let inputTokens = usage.inputTokens || 0
  const outputTokens = usage.outputTokens || 0
  let cacheReadInputTokens: number = 0
  let cacheCreationInputTokens: number = 0
  let costOverrideDollars: number | undefined
  if (providerMetadata.anthropic) {
    cacheReadInputTokens =
      typeof providerMetadata.anthropic.cacheReadInputTokens === 'number'
        ? providerMetadata.anthropic.cacheReadInputTokens
        : 0
    cacheCreationInputTokens =
      typeof providerMetadata.anthropic.cacheCreationInputTokens === 'number'
        ? providerMetadata.anthropic.cacheCreationInputTokens
        : 0
  }
  if (providerMetadata.openrouter) {
    if (providerMetadata.openrouter.usage) {
      const openrouterUsage = providerMetadata.openrouter
        .usage as OpenRouterUsageAccounting
      cacheReadInputTokens =
        openrouterUsage.promptTokensDetails?.cachedTokens ?? 0
      inputTokens = openrouterUsage.promptTokens - cacheReadInputTokens

      costOverrideDollars =
        (openrouterUsage.cost ?? 0) +
        (openrouterUsage.costDetails?.upstreamInferenceCost ?? 0)
    }
  }

  // Call the cost callback if provided
  if (params.onCostCalculated && costOverrideDollars) {
    const creditsUsed = costOverrideDollars * (1 + PROFIT_MARGIN)
    await params.onCostCalculated(creditsUsed)
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
    providerOptions: {
      codebuff: {
        codebuff_metadata: {
          run_id: params.userInputId,
          client_id: params.clientSessionId,
        },
      },
    },
  })

  const content = response.object

  const messageId = response.response.id
  const providerMetadata = response.providerMetadata ?? {}
  const usage = response.usage
  let inputTokens = usage.inputTokens || 0
  const outputTokens = usage.outputTokens || 0
  let cacheReadInputTokens: number = 0
  let cacheCreationInputTokens: number = 0
  let costOverrideDollars: number | undefined
  if (providerMetadata.anthropic) {
    cacheReadInputTokens =
      typeof providerMetadata.anthropic.cacheReadInputTokens === 'number'
        ? providerMetadata.anthropic.cacheReadInputTokens
        : 0
    cacheCreationInputTokens =
      typeof providerMetadata.anthropic.cacheCreationInputTokens === 'number'
        ? providerMetadata.anthropic.cacheCreationInputTokens
        : 0
  }
  if (providerMetadata.openrouter) {
    if (providerMetadata.openrouter.usage) {
      const openrouterUsage = providerMetadata.openrouter
        .usage as OpenRouterUsageAccounting
      cacheReadInputTokens =
        openrouterUsage.promptTokensDetails?.cachedTokens ?? 0
      inputTokens = openrouterUsage.promptTokens - cacheReadInputTokens

      costOverrideDollars =
        (openrouterUsage.cost ?? 0) +
        (openrouterUsage.costDetails?.upstreamInferenceCost ?? 0)
    }
  }

  // Call the cost callback if provided
  if (params.onCostCalculated && costOverrideDollars) {
    const creditsUsed = costOverrideDollars * (1 + PROFIT_MARGIN)
    await params.onCostCalculated(creditsUsed)
  }

  return content
}
