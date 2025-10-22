import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import {
  checkLiveUserInput,
  getLiveUserInputIds,
} from '@codebuff/agent-runtime/live-user-inputs'
import { PROFIT_MARGIN } from '@codebuff/common/old-constants'
import { buildArray } from '@codebuff/common/util/array'
import { getErrorObject } from '@codebuff/common/util/error'
import { convertCbToModelMessages } from '@codebuff/common/util/messages'
import { StopSequenceHandler } from '@codebuff/common/util/stop-sequence'
import { streamText, APICallError } from 'ai'

import { WEBSITE_URL } from '../constants'

import type { LanguageModelV2 } from '@ai-sdk/provider'
import type { PromptAiSdkStreamFn } from '@codebuff/common/types/contracts/llm'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type {
  OpenRouterProviderOptions,
  OpenRouterUsageAccounting,
} from '@openrouter/ai-sdk-provider'

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

for await (const chunk of promptAiSdkStream({
  apiKey: '12345',
  messages: [{ role: 'user', content: 'Hello' }],
  clientSessionId: 'test-session',
  fingerprintId: 'test-fingerprint',
  model: 'openai/gpt-5',
  userId: 'test-user-id',
  userInputId: '64a2e61f-1fab-4701-8651-7ff7a473e97a',
  sendAction: () => {},
  logger: console,
  trackEvent: () => {},
  liveUserInputRecord: {
    'test-user-id': ['64a2e61f-1fab-4701-8651-7ff7a473e97a'],
  },
  sessionConnections: { 'test-session': true },
})) {
  console.dir({ asdf: chunk }, { depth: null })
}
