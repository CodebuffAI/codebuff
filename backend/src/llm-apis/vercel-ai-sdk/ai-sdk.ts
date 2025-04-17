import {
  CoreAssistantMessage,
  CoreMessage,
  CoreToolMessage,
  CoreUserMessage,
  generateText,
  LanguageModelV1,
  streamText,
} from 'ai'
import {
  FinetunedVertexModel,
  finetunedVertexModels,
  Model,
} from 'common/constants'
import { generateCompactId } from 'common/util/string'

import { System } from '../claude'
import { GeminiMessage } from '../gemini-vertex-api'
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
  throw new Error('Unknown model: ' + model)
}

// TODO: Add retries & fallbacks: likely by allowing this to instead of "model"
// also take an array of form [{model: Model, retries: number}, {model: Model, retries: number}...]
// eg: [{model: "gemini-2.0-flash-001"}, {model: "vertex/gemini-2.0-flash-001"}, {model: "claude-3-5-haiku", retries: 3}]
export const promptAiSdkStream = async function* (
  messages: CoreMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: Model
    userId: string | undefined
    maxTokens?: number
    temperature?: number
  }
) {
  const startTime = Date.now()
  let aiSDKModel = modelToAiSDKModel(options.model)

  const response = streamText({
    model: aiSDKModel,
    messages,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
  })

  let content = ''

  for await (const chunk of response.textStream) {
    content += chunk
    yield chunk
  }

  const inputTokens = (await response.usage).promptTokens
  const outputTokens = (await response.usage).completionTokens

  saveMessage({
    messageId: generateCompactId(),
    userId: options.userId,
    clientSessionId: options.clientSessionId,
    fingerprintId: options.fingerprintId,
    userInputId: options.userInputId,
    model: options.model,
    request: messages,
    response: content,
    inputTokens,
    outputTokens,
    finishedAt: new Date(),
    latencyMs: Date.now() - startTime,
  })
}

// TODO: figure out a nice way to unify stream & non-stream versions maybe?
export const promptAiSdk = async function (
  messages: CoreMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: Model
    userId: string | undefined
    maxTokens?: number
    temperature?: number
  }
): Promise<string> {
  const startTime = Date.now()
  let aiSDKModel = modelToAiSDKModel(options.model)

  const response = await generateText({
    model: aiSDKModel,
    messages,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
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
    request: messages,
    response: content,
    inputTokens,
    outputTokens,
    finishedAt: new Date(),
    latencyMs: Date.now() - startTime,
  })

  return content
}

// TODO: temporary - ideally we move to using CoreMessage[] directly
// and don't need this transform!!
function transformMessages(
  messages: GeminiMessage[],
  system: System | undefined
): CoreMessage[] {
  const coreMessages: CoreMessage[] = []

  if (system) {
    if (typeof system === 'string') {
      coreMessages.push({ role: 'system', content: system })
    } else {
      for (const block of system) {
        coreMessages.push({ role: 'system', content: block.text })
      }
    }
  }

  for (const message of messages) {
    if (message.role === 'developer') {
      coreMessages.push({ role: 'user', content: message.content })
      continue
    }

    if (message.role === 'function') {
      // Skipping old-style function message - not supported anymore, use tools instead
      throw new Error(
        'Skipping function message - unsupported: use tools instead'
      )
    }

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
        for (const part of message.content) {
          if (part.type === 'image_url') {
            parts.push({
              type: 'image' as const,
              image: part.image_url.url,
            })
            continue
          }
          if (part.type === 'input_audio') {
            throw new Error('Audio messages not supported')
          }
          if (part.type === 'file') {
            throw new Error('File messages not supported')
          }
          parts.push(part)
        }
        coreMessages.push({ role: 'user', content: parts })
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
        for (const part of message.content) {
          if (part.type === 'text') {
            messageContent.push({ type: 'text', text: part.text })
          }
          if (part.type === 'refusal') {
            messageContent.push({ type: 'text', text: part.refusal })
          }
        }
        coreMessages.push({
          ...message,
          role: 'assistant',
          content: messageContent,
        })
        continue
      }
    }

    if (message.role === 'tool') {
      if (typeof message.content === 'string') {
        coreMessages.push({
          ...message,
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: message.tool_call_id,
              result: message.content,
              // NOTE: OpenAI does not provide toolName in their message format
              toolName: 'unknown',
            },
          ],
        })
      } else {
        const parts: CoreToolMessage['content'] = []
        for (const part of message.content) {
          if (part.type === 'text') {
            parts.push({
              type: 'tool-result',
              toolCallId: message.tool_call_id,
              result: part.text,
              // NOTE: OpenAI does not provide toolName in their message format
              toolName: 'unknown',
            })
          }
        }
        coreMessages.push({ ...message, role: 'tool', content: parts })
      }
      continue
    }

    throw new Error('Unknown message role received: ' + message)
  }

  return coreMessages
}

// TODO: temporary - ideally we'd call promptAiSdkStream directly
export async function* promptAiSdkStream_GeminiFormat(
  messages: GeminiMessage[],
  system: System | undefined,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: FinetunedVertexModel
    userId: string | undefined
    maxTokens?: number
    temperature?: number
  }
): AsyncGenerator<string, void, unknown> {
  const coreMessages = transformMessages(messages, system)
  yield* promptAiSdkStream(coreMessages, options)
}

export async function promptAiSdk_GeminiFormat(
  messages: GeminiMessage[],
  system: System | undefined,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: FinetunedVertexModel
    userId: string | undefined
    maxTokens?: number
    temperature?: number
  }
) {
  const coreMessages = transformMessages(messages, system)
  return promptAiSdk(coreMessages, options)
}
