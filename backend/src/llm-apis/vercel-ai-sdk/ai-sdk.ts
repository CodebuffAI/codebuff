import { anthropic } from '@ai-sdk/anthropic'
import { google, GoogleGenerativeAIProviderOptions } from '@ai-sdk/google'
import { openai } from '@ai-sdk/openai'
import {
  CoreAssistantMessage,
  CoreMessage,
  CoreUserMessage,
  generateObject,
  generateText,
  LanguageModelV1,
  streamText,
} from 'ai'
import {
  AnthropicModel,
  claudeModels,
  finetunedVertexModels,
  geminiModels,
  Model,
  OpenAIModel,
  openaiModels,
  type GeminiModel,
} from '@codebuff/common/constants'

import { generateCompactId } from '@codebuff/common/util/string'

import { Message } from '@codebuff/common/types/message'
import { withTimeout } from '@codebuff/common/util/promise'
import { z } from 'zod'
import { System } from '../claude'
import { saveMessage } from '../message-cost-tracker'
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
  if (Object.values(openaiModels).includes(model as OpenAIModel)) {
    return openai.languageModel(model)
  }
  if (Object.values(claudeModels).includes(model as AnthropicModel)) {
    return anthropic.languageModel(model)
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
    userInputId: string
    model: Model
    userId: string | undefined
    chargeUser?: boolean
  } & Omit<Parameters<typeof streamText>[0], 'model'>
) {
  const startTime = Date.now()
  let aiSDKModel = modelToAiSDKModel(options.model)

  const response = streamText({
    ...options,
    model: aiSDKModel,
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
        },
      } satisfies GoogleGenerativeAIProviderOptions,
    },
  })

  let content = ''
  let hasReasoning = false
  let finishedReasoning = false

  for await (const chunk of response.fullStream) {
    if (chunk.type === 'reasoning') {
      if (!hasReasoning) {
        hasReasoning = true
        yield '<think_deeply>\n<thought>'
      }
      yield chunk.textDelta
    }
    if (chunk.type === 'text-delta') {
      if (hasReasoning && !finishedReasoning) {
        finishedReasoning = true
        yield '</thought>\n</think_deeply>'
      }
      content += chunk.textDelta
      yield chunk.textDelta
    }
  }

  const usage = await response.usage
  const inputTokens = usage.promptTokens
  const outputTokens = usage.completionTokens
  const anthropicMetadata = (await response.providerMetadata)?.anthropic
  const cacheReadInputTokens =
    typeof anthropicMetadata?.cacheReadInputTokens === 'number'
      ? anthropicMetadata.cacheReadInputTokens
      : 0
  const cacheCreationInputTokens =
    typeof anthropicMetadata?.cacheCreationInputTokens === 'number'
      ? anthropicMetadata.cacheCreationInputTokens
      : 0

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
    cacheCreationInputTokens,
    cacheReadInputTokens,
    finishedAt: new Date(),
    latencyMs: Date.now() - startTime,
    chargeUser: options.chargeUser ?? true,
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
}): Promise<T> {
  const startTime = Date.now()
  let aiSDKModel = modelToAiSDKModel(options.model)

  const responsePromise = generateObject({
    ...options,
    model: aiSDKModel,
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
