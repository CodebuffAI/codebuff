import { google, GoogleGenerativeAIProviderOptions } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import {
  finetunedVertexModels,
  geminiModels,
  Model,
  OpenAIModel,
  openaiModels,
  openrouterModels,
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
import { checkLiveUserInput, getLiveUserInputIds } from '../../../../live-user-inputs'
import { logger } from '../../../../util/logger'
import { System } from '../../../../llm-apis/claude'
import { saveMessage } from '../message-cost-tracker'
import { openRouterLanguageModel } from '../openrouter'
import { vertexFinetuned } from './vertex-finetuned'

// TODO: We'll want to add all our models here!
const modelToAiSDKModel = (model: Model): LanguageModelV1 => {
  if (
    Object.values(finetunedVertexModels as Record<string, string>).includes(
      model
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
  // All Claude models go through OpenRouter
  if (Object.values(openrouterModels).includes(model as openrouterModel)) {
    return openRouterLanguageModel(model)
  }
  throw new Error('Unknown model: ' + model)
}

// TODO: Add retries & fallbacks: likely by allowing this to instead of "model"
// also take an array of form [{model: Model, retries: number}, {model: Model, retries: number}...]
// eg: [{model: "gemini-2.0-flash-001"}, {model: "vertex/gemini-2.0-flash-001"}, {model: "claude-3-5-haiku", retries: 3}]
export const promptAiSdkStream = async function* (
  options: {
    messages: CoreMessage[]
    clientSessionId: string
    fingerprintId: string
    model: Model
    userId: string | undefined
    chargeUser?: boolean
    thinkingBudget?: number
    userInputId: string
    maxRetries?: number
  } & Omit<Parameters<typeof streamText>[0], 'model'>
) {
  if (!checkLiveUserInput(options.userId, options.userInputId)) {
    logger.info(
      {
        userId: options.userId,
        userInputId: options.userInputId,
        liveUserInputId: getLiveUserInputIds(options.userId),
      },
      'Skipping stream due to canceled user input'
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
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: false,
          thinkingBudget: options.thinkingBudget ?? 128,
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
  })
}

// TODO: figure out a nice way to unify stream & non-stream versions maybe?
export const promptAiSdk = async function (
  options: {
    messages: CoreMessage[]
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: Model
    userId: string | undefined
    chargeUser?: boolean
  } & Omit<Parameters<typeof generateText>[0], 'model'>
): Promise<string> {
  if (!checkLiveUserInput(options.userId, options.userInputId)) {
    logger.info(
      {
        userId: options.userId,
        userInputId: options.userInputId,
        liveUserInputId: getLiveUserInputIds(options.userId),
      },
      'Skipping prompt due to canceled user input'
    )
    return ''
  }

  const startTime = Date.now()
  let aiSDKModel = modelToAiSDKModel(options.model)

  const response = await generateText({
    ...options,
    model: aiSDKModel,
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
    model: options.model,
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

// Copied over exactly from promptAiSdk but with a schema
export const promptAiSdkStructured = async function <T>(options: {
  messages: CoreMessage[]
  schema: z.ZodType<T, z.ZodTypeDef, any>
  clientSessionId: string
  fingerprintId: string
  userInputId: string
  model: Model
  userId: string | undefined
  maxTokens?: number
  temperature?: number
  timeout?: number
  chargeUser?: boolean
}): Promise<T> {
  if (!checkLiveUserInput(options.userId, options.userInputId)) {
    logger.info(
      {
        userId: options.userId,
        userInputId: options.userInputId,
        liveUserInputId: getLiveUserInputIds(options.userId),
      },
      'Skipping structured prompt due to canceled user input'
    )
    return {} as T
  }
  const startTime = Date.now()
  let aiSDKModel = modelToAiSDKModel(options.model)

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
    model: options.model,
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
        throw new Error(
          'Multiple part system message - unsupported (TODO: fix if we hit this.)'
        )
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
