import { google } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import {
  finetunedVertexModels,
  geminiModels,
  openaiModels,
} from '@codebuff/common/constants'
import {
  endToolTag,
  startToolTag,
  toolNameParam,
} from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import { convertCbToModelMessages } from '@codebuff/common/util/messages'
import { errorToObject } from '@codebuff/common/util/object'
import { withTimeout } from '@codebuff/common/util/promise'
import { generateCompactId } from '@codebuff/common/util/string'
import { APICallError, generateObject, generateText, streamText } from 'ai'

import { checkLiveUserInput, getLiveUserInputIds } from '../../live-user-inputs'
import { logger } from '../../util/logger'
import { saveMessage } from '../message-cost-tracker'
import { openRouterLanguageModel } from '../openrouter'
import { vertexFinetuned } from './vertex-finetuned'

import type { System } from '../claude'
import type {
  GeminiModel,
  Model,
  OpenAIModel,
} from '@codebuff/common/constants'
import type { CodebuffMessage } from '@codebuff/common/types/messages/codebuff-message'
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
  if (Object.values(geminiModels).includes(model as GeminiModel)) {
    return google.languageModel(model)
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
export const promptAiSdkStream = async function* (
  options: {
    messages: CodebuffMessage[]
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
  } & Omit<Parameters<typeof streamText>[0], 'model'>,
) {
  // Log LLM context size for storage debugging
  try {
    const messagesSize = JSON.stringify(options.messages).length / 1024 / 1024
    const messageCount = options.messages.length
    console.log(`[STORAGE-DEBUG] LLM call - ${messageCount} messages, ${messagesSize.toFixed(2)}MB context, model: ${options.model}`)
    
    if (messagesSize > 10) { // Log large contexts > 10MB
      console.log(`[STORAGE-DEBUG] LARGE LLM CONTEXT: ${messagesSize.toFixed(2)}MB for user ${options.userId}`)
    }
  } catch (err) {
    console.log(`[STORAGE-DEBUG] Error measuring LLM context: ${err}`)
  }
  
  if (
    !checkLiveUserInput(
      options.userId,
      options.userInputId,
      options.clientSessionId,
    )
  ) {
    logger.info(
      {
        userId: options.userId,
        userInputId: options.userInputId,
        liveUserInputId: getLiveUserInputIds(options.userId),
      },
      'Skipping stream due to canceled user input',
    )
    yield ''
    return
  }
  const startTime = Date.now()

  let aiSDKModel = modelToAiSDKModel(options.model)

  const response = streamText({
    ...options,
    model: aiSDKModel,
    maxRetries: options.maxRetries,
    messages: convertCbToModelMessages(options),
  })

  let content = ''
  let reasoning = false

  for await (const chunk of response.fullStream) {
    if (chunk.type === 'error') {
      logger.error(
        {
          chunk: { ...chunk, error: undefined },
          error: errorToObject(chunk.error),
          model: options.model,
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
      const errorMessage = `Error from AI SDK (model ${options.model}): ${buildArray([mainErrorMessage, errorBody]).join('\n')}`
      throw new Error(errorMessage, {
        cause: chunk.error,
      })
    }
    if (chunk.type === 'reasoning-delta') {
      if (
        (
          options.providerOptions?.openrouter as
            | OpenRouterProviderOptions
            | undefined
        )?.reasoning?.exclude
      ) {
        continue
      }
      if (!reasoning) {
        reasoning = true
        yield `${startToolTag}{
  ${JSON.stringify(toolNameParam)}: "think_deeply",
  "thought": "`
      }
      yield JSON.stringify(chunk.text).slice(1, -1)
    }
    if (chunk.type === 'text-delta') {
      if (reasoning) {
        reasoning = false
        yield `"\n}${endToolTag}\n\n`
      }
      content += chunk.text
      yield chunk.text
    }
  }

  const messageId = (await response.response).id
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

  const creditsUsedPromise = saveMessage({
    messageId,
    userId: options.userId,
    clientSessionId: options.clientSessionId,
    fingerprintId: options.fingerprintId,
    userInputId: options.userInputId,
    model: options.model,
    request: options.messages,
    response: content,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    finishedAt: new Date(),
    latencyMs: Date.now() - startTime,
    chargeUser: options.chargeUser ?? true,
    costOverrideDollars,
    agentId: options.agentId,
  })

  // Call the cost callback if provided
  if (options.onCostCalculated) {
    const creditsUsed = await creditsUsedPromise
    await options.onCostCalculated(creditsUsed)
  }
}

// TODO: figure out a nice way to unify stream & non-stream versions maybe?
export const promptAiSdk = async function (
  options: {
    messages: CodebuffMessage[]
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: Model
    userId: string | undefined
    chargeUser?: boolean
    agentId?: string
    onCostCalculated?: (credits: number) => Promise<void>
  } & Omit<Parameters<typeof generateText>[0], 'model'>,
): Promise<string> {
  if (
    !checkLiveUserInput(
      options.userId,
      options.userInputId,
      options.clientSessionId,
    )
  ) {
    logger.info(
      {
        userId: options.userId,
        userInputId: options.userInputId,
        liveUserInputId: getLiveUserInputIds(options.userId),
      },
      'Skipping prompt due to canceled user input',
    )
    return ''
  }

  const startTime = Date.now()
  let aiSDKModel = modelToAiSDKModel(options.model)

  const response = await generateText({
    ...options,
    model: aiSDKModel,
    messages: convertCbToModelMessages(options),
  })
  const content = response.text
  const inputTokens = response.usage.inputTokens || 0
  const outputTokens = response.usage.inputTokens || 0

  const creditsUsedPromise = saveMessage({
    messageId: generateCompactId(),
    userId: options.userId,
    clientSessionId: options.clientSessionId,
    fingerprintId: options.fingerprintId,
    userInputId: options.userInputId,
    model: options.model,
    request: options.messages,
    response: content,
    inputTokens,
    outputTokens,
    finishedAt: new Date(),
    latencyMs: Date.now() - startTime,
    chargeUser: options.chargeUser ?? true,
    agentId: options.agentId,
  })

  // Call the cost callback if provided
  if (options.onCostCalculated) {
    const creditsUsed = await creditsUsedPromise
    await options.onCostCalculated(creditsUsed)
  }

  return content
}

// Copied over exactly from promptAiSdk but with a schema
export const promptAiSdkStructured = async function <T>(options: {
  messages: CodebuffMessage[]
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
}): Promise<T> {
  if (
    !checkLiveUserInput(
      options.userId,
      options.userInputId,
      options.clientSessionId,
    )
  ) {
    logger.info(
      {
        userId: options.userId,
        userInputId: options.userInputId,
        liveUserInputId: getLiveUserInputIds(options.userId),
      },
      'Skipping structured prompt due to canceled user input',
    )
    return {} as T
  }
  const startTime = Date.now()
  let aiSDKModel = modelToAiSDKModel(options.model)

  const responsePromise = generateObject<z.ZodType<T>, 'object'>({
    ...options,
    model: aiSDKModel,
    output: 'object',
    messages: convertCbToModelMessages(options),
  })

  const response = await (options.timeout === undefined
    ? responsePromise
    : withTimeout(responsePromise, options.timeout))
  const content = response.object
  const inputTokens = response.usage.inputTokens || 0
  const outputTokens = response.usage.inputTokens || 0

  const creditsUsedPromise = saveMessage({
    messageId: generateCompactId(),
    userId: options.userId,
    clientSessionId: options.clientSessionId,
    fingerprintId: options.fingerprintId,
    userInputId: options.userInputId,
    model: options.model,
    request: options.messages,
    response: JSON.stringify(content),
    inputTokens,
    outputTokens,
    finishedAt: new Date(),
    latencyMs: Date.now() - startTime,
    chargeUser: options.chargeUser ?? true,
    agentId: options.agentId,
  })

  // Call the cost callback if provided
  if (options.onCostCalculated) {
    const creditsUsed = await creditsUsedPromise
    await options.onCostCalculated(creditsUsed)
  }

  return content
}

// TODO: temporary - ideally we move to using CodebuffMessage[] directly
// and don't need this transform!!
export function transformMessages(
  messages: CodebuffMessage[],
  system?: System,
): CodebuffMessage[] {
  const codebuffMessages: CodebuffMessage[] = []

  if (system) {
    codebuffMessages.push({
      role: 'system',
      content:
        typeof system === 'string'
          ? system
          : system.map((block) => block.text).join('\n\n'),
    })
  }

  return buildArray<CodebuffMessage>([
    system && {
      role: 'system',
      content:
        typeof system === 'string'
          ? system
          : system.map((block) => block.text).join('\n\n'),
    },
    messages,
  ])
}
