import { google, GoogleGenerativeAIProviderOptions } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import {
  deepseekModels,
  finetunedVertexModels,
  geminiModels,
  Model,
  OpenAIModel,
  openaiModels,
  openrouterModels,
  type DeepseekModel,
  type GeminiModel,
  type openrouterModel,
} from '@codebuff/common/constants'
import { Message } from '@codebuff/common/types/message'
import { errorToObject } from '@codebuff/common/util/object'
import { withTimeout } from '@codebuff/common/util/promise'
import { generateCompactId } from '@codebuff/common/util/string'
import { closeXml } from '@codebuff/common/util/xml'
import { OpenRouterUsageAccounting } from '@codebuff/internal/openrouter-ai-sdk'
import {
  CoreAssistantMessage,
  CoreMessage,
  CoreUserMessage,
  generateObject,
  generateText,
  LanguageModelV1,
  streamText,
} from 'ai'
import { z } from 'zod'
import {
  checkLiveUserInput,
  getLiveUserInputIds,
} from '../../../../live-user-inputs'

// Configuration for model with retry/fallback support
export interface ModelConfig {
  model: Model
  retries?: number
}

export type ModelOrConfig = Model | ModelConfig | ModelConfig[]

import { logger } from '../../../../util/logger'
import { System } from '../../../../llm-apis/claude'
import { saveMessage } from '../message-cost-tracker'
import { openRouterLanguageModel } from '../openrouter'
import { vertexFinetuned } from './vertex-finetuned'

const modelToAiSDKModel = (model: Model): LanguageModelV1 => {
  // Finetuned Vertex AI models
  if (
    Object.values(finetunedVertexModels as Record<string, string>).includes(
      model
    )
  ) {
    return vertexFinetuned(model)
  }

  // Google Gemini models
  if (Object.values(geminiModels).includes(model as GeminiModel)) {
    return google.languageModel(model)
  }

  // OpenAI reasoning models (o3-pro, o3) use responses API
  if (model === openaiModels.o3pro || model === openaiModels.o3) {
    return openai.responses(model)
  }

  // Other OpenAI models
  if (Object.values(openaiModels).includes(model as OpenAIModel)) {
    return openai.languageModel(model)
  }

  // DeepSeek models (through OpenRouter for now)
  if (Object.values(deepseekModels).includes(model as DeepseekModel)) {
    return openRouterLanguageModel(model)
  }

  // OpenRouter models (includes Claude, some OpenAI, Gemini, and others)
  if (Object.values(openrouterModels).includes(model as openrouterModel)) {
    return openRouterLanguageModel(model)
  }

  throw new Error('Unknown model: ' + model)
}

// Unified options interface for all LLM calls
interface BaseLLMOptions {
  messages: CoreMessage[]
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  model: ModelOrConfig
  userId: string | undefined
  chargeUser?: boolean
  maxRetries?: number
  maxTokens?: number
  temperature?: number
  timeout?: number
}

// Unified execution function that handles retries and fallbacks
async function executeWithRetryAndFallback<T>(
  options: BaseLLMOptions,
  executor: (
    model: Model,
    aiSDKModel: LanguageModelV1,
    attempt: number
  ) => Promise<T>
): Promise<T> {
  if (!checkLiveUserInput(options.userId, options.userInputId)) {
    logger.info(
      {
        userId: options.userId,
        userInputId: options.userInputId,
        liveUserInputId: getLiveUserInputIds(options.userId),
      },
      'Skipping execution due to canceled user input'
    )
    throw new Error('User input canceled')
  }

  const modelConfigs = normalizeModelConfig(options.model)

  // Try each model configuration with retries
  for (const config of modelConfigs) {
    const maxRetries = config.retries ?? options.maxRetries ?? 0

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const aiSDKModel = modelToAiSDKModel(config.model)
        return await executor(config.model, aiSDKModel, attempt)
      } catch (error) {
        const isLastAttempt = attempt === maxRetries
        const isLastModel = config === modelConfigs[modelConfigs.length - 1]

        logger.warn(
          {
            model: config.model,
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
            error: error instanceof Error ? error.message : error,
          },
          `Model ${config.model} failed (attempt ${attempt + 1}/${maxRetries + 1})`
        )

        if (isLastAttempt && isLastModel) {
          throw error // Re-throw if all models and retries exhausted
        }

        if (isLastAttempt) {
          break // Try next model
        }

        // Wait before retry (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 10000))
        )
      }
    }
  }

  throw new Error('All model configurations failed')
}

export const promptAiSdkStream = async function* (
  options: BaseLLMOptions & {
    thinkingBudget?: number
  } & Omit<Parameters<typeof streamText>[0], 'model'>
) {
  const startTime = Date.now()

  yield* await executeWithRetryAndFallback(
    options,
    async function* (model, aiSDKModel, attempt) {
      yield* await executeStreamWithModel({
        ...options,
        model,
        aiSDKModel,
        startTime,
        attempt,
        maxRetries: 0, // Handled by outer retry logic
      })
    }
  )
}

export const promptAiSdk = async function (
  options: BaseLLMOptions & Omit<Parameters<typeof generateText>[0], 'model'>
): Promise<string> {
  const startTime = Date.now()

  return await executeWithRetryAndFallback(
    options,
    async (model, aiSDKModel, attempt) => {
      const response = await generateText({
        ...options,
        model: aiSDKModel,
        maxRetries: 0, // We handle retries at a higher level
      })

      const content = response.text
      const inputTokens = response.usage.promptTokens
      const outputTokens = response.usage.completionTokens

      saveMessage({
        messageId: generateCompactId(),
        userId: options.userId,
        clientSessionId: options.clientSessionId,
        fingerprintId: options.fingerprintId,
        userInputId: options.userInputId,
        model,
        request: options.messages,
        response: content,
        inputTokens,
        outputTokens,
        finishedAt: new Date(),
        latencyMs: Date.now() - startTime,
        chargeUser: options.chargeUser ?? true,
      })

      return content
    }
  )
}

export const promptAiSdkStructured = async function <T>(
  options: BaseLLMOptions & {
    schema: z.ZodType<T, z.ZodTypeDef, any>
  }
): Promise<T> {
  const startTime = Date.now()

  return await executeWithRetryAndFallback(
    options,
    async (model, aiSDKModel, attempt) => {
      const responsePromise = generateObject<T>({
        ...options,
        model: aiSDKModel,
        output: 'object',
      })

      const response = await (options.timeout === undefined
        ? responsePromise
        : withTimeout(responsePromise, options.timeout))

      const content = response.object
      const inputTokens = response.usage.promptTokens
      const outputTokens = response.usage.completionTokens

      saveMessage({
        messageId: generateCompactId(),
        userId: options.userId,
        clientSessionId: options.clientSessionId,
        fingerprintId: options.fingerprintId,
        userInputId: options.userInputId,
        model,
        request: options.messages,
        response: JSON.stringify(content),
        inputTokens,
        outputTokens,
        finishedAt: new Date(),
        latencyMs: Date.now() - startTime,
        chargeUser: options.chargeUser ?? true,
      })

      return content
    }
  )
}

// Helper function to normalize model configuration
function normalizeModelConfig(model: ModelOrConfig): ModelConfig[] {
  if (typeof model === 'string') {
    return [{ model }]
  }
  if (Array.isArray(model)) {
    return model
  }
  return [model]
}

// Helper function to execute streaming with a specific model
async function* executeStreamWithModel(
  options: {
    messages: CoreMessage[]
    clientSessionId: string
    fingerprintId: string
    model: Model
    aiSDKModel: LanguageModelV1
    userId: string | undefined
    chargeUser?: boolean
    thinkingBudget?: number
    userInputId: string
    startTime: number
    attempt: number
    maxRetries: number
  } & Omit<Parameters<typeof streamText>[0], 'model'>
): AsyncGenerator<string, void, unknown> {
  const {
    aiSDKModel,
    model,
    startTime,
    attempt,
    maxRetries,
    ...streamOptions
  } = options

  const response = streamText({
    ...streamOptions,
    model: aiSDKModel,
    maxRetries: 0, // We handle retries at a higher level
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: false,
          thinkingBudget: streamOptions.thinkingBudget ?? 128,
        },
      } satisfies GoogleGenerativeAIProviderOptions,
    },
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
        'Error from AI SDK'
      )
      if (process.env.ENVIRONMENT !== 'prod') {
        throw chunk.error instanceof Error
          ? new Error(
              `Error from AI SDK (${options.model}): ${chunk.error.message}`,
              {
                cause: chunk.error,
              }
            )
          : new Error(
              `Error from AI SDK (${options.model}): ${
                typeof chunk.error === 'string'
                  ? chunk.error
                  : JSON.stringify(chunk.error)
              }`
            )
      }
    }
    if (chunk.type === 'reasoning') {
      if (!reasoning) {
        reasoning = true
        yield '<think_deeply>\n<thought>'
      }
      yield chunk.textDelta
    }
    if (chunk.type === 'text-delta') {
      if (reasoning) {
        reasoning = false
        yield `${closeXml('thought')}\n${closeXml('think_deeply')}\n\n`
      }
      content += chunk.textDelta
      yield chunk.textDelta
    }
  }

  const messageId = (await response.response).id
  const providerMetadata = (await response.providerMetadata) ?? {}
  const usage = await response.usage
  let inputTokens = usage.promptTokens
  const outputTokens = usage.completionTokens
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

  saveMessage({
    messageId,
    userId: streamOptions.userId,
    clientSessionId: streamOptions.clientSessionId,
    fingerprintId: streamOptions.fingerprintId,
    userInputId: streamOptions.userInputId,
    model,
    request: streamOptions.messages,
    response: content,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens,
    cacheReadInputTokens,
    finishedAt: new Date(),
    latencyMs: Date.now() - startTime,
    chargeUser: streamOptions.chargeUser ?? true,
    costOverrideDollars,
  })
}

// TODO: temporary - ideally we move to using CoreMessage[] directly
// and don't need this transform!!
export function transformMessages(
  messages: (Message | CoreMessage)[],
  system?: System
): CoreMessage[] {
  const coreMessages: CoreMessage[] = []

  if (system) {
    coreMessages.push({
      role: 'system',
      content:
        typeof system === 'string'
          ? system
          : system.map((block) => block.text).join('\n\n'),
    })
  }

  for (const message of messages) {
    if (message.role === 'system') {
      if (typeof message.content === 'string') {
        coreMessages.push({ role: 'system', content: message.content })
        continue
      } else {
        // Handle multi-part system messages
        const parts: string[] = []
        for (const part of message.content) {
          if (part.type === 'text') {
            parts.push(part.text)
          } else {
            // For non-text parts in system messages, convert to text representation
            parts.push(`[${part.type.toUpperCase()}]`)
          }
        }
        coreMessages.push({ role: 'system', content: parts.join('\n\n') })
        continue
      }
    }

    if (message.role === 'user') {
      if (typeof message.content === 'string') {
        coreMessages.push({
          ...message,
          role: 'user',
          content: message.content,
        })
        continue
      } else {
        const parts: CoreUserMessage['content'] = []
        const coreMessage: CoreUserMessage = { role: 'user', content: parts }
        for (const part of message.content) {
          // Add ephemeral if present
          if ('cache_control' in part) {
            coreMessage.providerOptions = {
              anthropic: { cacheControl: { type: 'ephemeral' } },
              openrouter: { cacheControl: { type: 'ephemeral' } },
            }
          }
          // Handle Message type image format
          if (part.type === 'image' && 'source' in part) {
            parts.push({
              type: 'image' as const,
              image: `data:${part.source.media_type};base64,${part.source.data}`,
            })
            continue
          }
          if (part.type === 'file') {
            throw new Error('File messages not supported')
          }
          if (part.type === 'text') {
            parts.push({
              type: 'text' as const,
              text: part.text,
            })
            continue
          }
          if (part.type === 'tool_use' || part.type === 'tool_result') {
            // Skip tool parts in user messages - they should be in assistant/tool messages
            continue
          }
        }
        coreMessages.push(coreMessage)
        continue
      }
    }

    if (message.role === 'assistant') {
      if (message.content === undefined || message.content === null) {
        continue
      }
      if (typeof message.content === 'string') {
        coreMessages.push({
          ...message,
          role: 'assistant',
          content: message.content,
        })
        continue
      } else {
        let messageContent: CoreAssistantMessage['content'] = []
        const coreMessage: CoreAssistantMessage = {
          ...message,
          role: 'assistant',
          content: messageContent,
        }
        for (const part of message.content) {
          // Add ephemeral if present
          if ('cache_control' in part) {
            coreMessage.providerOptions = {
              anthropic: { cacheControl: { type: 'ephemeral' } },
              openrouter: { cacheControl: { type: 'ephemeral' } },
            }
          }
          if (part.type === 'text') {
            messageContent.push({ type: 'text', text: part.text })
          }
          if (part.type === 'tool_use') {
            messageContent.push({
              type: 'tool-call',
              toolCallId: part.id,
              toolName: part.name,
              args: part.input,
            })
          }
        }
        coreMessages.push(coreMessage)
        continue
      }
    }

    if (message.role === 'tool') {
      coreMessages.push(message)
      continue
    }

    throw new Error('Unknown message role received: ' + message)
  }

  return coreMessages
}
