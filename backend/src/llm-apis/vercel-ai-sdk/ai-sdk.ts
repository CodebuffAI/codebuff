import { openai } from '@ai-sdk/openai'
import {
  finetunedVertexModels,
  openaiModels,
} from '@codebuff/common/old-constants'
import { buildArray } from '@codebuff/common/util/array'
import { getErrorObject } from '@codebuff/common/util/error'
import { convertCbToModelMessages } from '@codebuff/common/util/messages'
import { withTimeout } from '@codebuff/common/util/promise'
import { StopSequenceHandler } from '@codebuff/common/util/stop-sequence'
import { generateCompactId } from '@codebuff/common/util/string'
import { APICallError, generateObject, generateText, streamText } from 'ai'

import { checkLiveUserInput, getLiveUserInputIds } from '../../live-user-inputs'
import { saveMessage } from '../message-cost-tracker'
import { openRouterLanguageModel } from '../openrouter'
import { vertexFinetuned } from './vertex-finetuned'

import type { Model, OpenAIModel } from '@codebuff/common/old-constants'
import type {
  PromptAiSdkFn,
  PromptAiSdkStreamFn,
  PromptAiSdkStructuredInput,
  PromptAiSdkStructuredOutput,
} from '@codebuff/common/types/contracts/llm'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type {
  OpenRouterProviderOptions,
  OpenRouterUsageAccounting,
} from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'
import type { z } from 'zod/v4'

// TODO: We'll want to add all our models here!
const modelToAiSDKModel = (model: Model): LanguageModel => {
  if (
    Object.values(finetunedVertexModels as Record<string, string>).includes(
      model,
    )
  ) {
    return vertexFinetuned(model)
  }
  if (model === openaiModels.o3pro || model === openaiModels.o3) {
    return openai.responses(model)
  }
  if (Object.values(openaiModels).includes(model as OpenAIModel)) {
    return openai.languageModel(model)
  }
  // All other models go through OpenRouter
  return openRouterLanguageModel(model)
}

// TODO: Add retries & fallbacks: likely by allowing this to instead of "model"
// also take an array of form [{model: Model, retries: number}, {model: Model, retries: number}...]
// eg: [{model: "gemini-2.0-flash-001"}, {model: "vertex/gemini-2.0-flash-001"}, {model: "claude-3-5-haiku", retries: 3}]
export async function* promptAiSdkStream(
  params: ParamsOf<PromptAiSdkStreamFn>,
): ReturnType<PromptAiSdkStreamFn> {
  const { logger } = params
  if (
    !checkLiveUserInput({ ...params, clientSessionId: params.clientSessionId })
  ) {
    logger.info(
      {
        userId: params.userId,
        userInputId: params.userInputId,
        liveUserInputId: getLiveUserInputIds(params.userId),
      },
      'Skipping stream due to canceled user input',
    )
    return null
  }
  const startTime = Date.now()

  let aiSDKModel = modelToAiSDKModel(params.model)

  const response = streamText({
    ...params,
    model: aiSDKModel,
    messages: convertCbToModelMessages(params),
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
      if (
        (
          params.providerOptions?.openrouter as
            | OpenRouterProviderOptions
            | undefined
        )?.reasoning?.exclude
      ) {
        continue
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
    }
  }

  const providerMetadata = (await response.providerMetadata) ?? {}
  const usage = await response.usage
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

  const messageId = (await response.response).id
  const creditsUsedPromise = saveMessage({
    messageId,
    userId: params.userId,
    clientSessionId: params.clientSessionId,
    fingerprintId: params.fingerprintId,
    userInputId: params.userInputId,
    model: params.model,
    request: params.messages,
    response: content,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    finishedAt: new Date(),
    latencyMs: Date.now() - startTime,
    chargeUser: params.chargeUser ?? true,
    costOverrideDollars,
    agentId: params.agentId,
    logger,
  })

  // Call the cost callback if provided
  if (params.onCostCalculated) {
    const creditsUsed = await creditsUsedPromise
    await params.onCostCalculated(creditsUsed)
  }

  return messageId
}

// TODO: figure out a nice way to unify stream & non-stream versions maybe?
export async function promptAiSdk(
  params: ParamsOf<PromptAiSdkFn>,
): ReturnType<PromptAiSdkFn> {
  const { logger } = params

  if (!checkLiveUserInput(params)) {
    logger.info(
      {
        userId: params.userId,
        userInputId: params.userInputId,
        liveUserInputId: getLiveUserInputIds(params.userId),
      },
      'Skipping prompt due to canceled user input',
    )
    return ''
  }

  const startTime = Date.now()
  let aiSDKModel = modelToAiSDKModel(params.model)

  const response = await generateText({
    ...params,
    model: aiSDKModel,
    messages: convertCbToModelMessages(params),
  })
  const content = response.text
  const inputTokens = response.usage.inputTokens || 0
  const outputTokens = response.usage.inputTokens || 0

  const creditsUsedPromise = saveMessage({
    messageId: generateCompactId(),
    userId: params.userId,
    clientSessionId: params.clientSessionId,
    fingerprintId: params.fingerprintId,
    userInputId: params.userInputId,
    model: params.model,
    request: params.messages,
    response: content,
    inputTokens,
    outputTokens,
    finishedAt: new Date(),
    latencyMs: Date.now() - startTime,
    chargeUser: params.chargeUser ?? true,
    agentId: params.agentId,
    logger,
  })

  // Call the cost callback if provided
  if (params.onCostCalculated) {
    const creditsUsed = await creditsUsedPromise
    await params.onCostCalculated(creditsUsed)
  }

  return content
}

// Copied over exactly from promptAiSdk but with a schema
export async function promptAiSdkStructured<T>(
  params: PromptAiSdkStructuredInput<T>,
): PromptAiSdkStructuredOutput<T> {
  const { logger } = params

  if (!checkLiveUserInput(params)) {
    logger.info(
      {
        userId: params.userId,
        userInputId: params.userInputId,
        liveUserInputId: getLiveUserInputIds(params.userId),
      },
      'Skipping structured prompt due to canceled user input',
    )
    return {} as T
  }
  const startTime = Date.now()
  let aiSDKModel = modelToAiSDKModel(params.model)

  const responsePromise = generateObject<z.ZodType<T>, 'object'>({
    ...params,
    model: aiSDKModel,
    output: 'object',
    messages: convertCbToModelMessages(params),
  })

  const response = await (params.timeout === undefined
    ? responsePromise
    : withTimeout(responsePromise, params.timeout))
  const content = response.object
  const inputTokens = response.usage.inputTokens || 0
  const outputTokens = response.usage.inputTokens || 0

  const creditsUsedPromise = saveMessage({
    messageId: generateCompactId(),
    userId: params.userId,
    clientSessionId: params.clientSessionId,
    fingerprintId: params.fingerprintId,
    userInputId: params.userInputId,
    model: params.model,
    request: params.messages,
    response: JSON.stringify(content),
    inputTokens,
    outputTokens,
    finishedAt: new Date(),
    latencyMs: Date.now() - startTime,
    chargeUser: params.chargeUser ?? true,
    agentId: params.agentId,
    logger,
  })

  // Call the cost callback if provided
  if (params.onCostCalculated) {
    const creditsUsed = await creditsUsedPromise
    await params.onCostCalculated(creditsUsed)
  }

  return content
}
