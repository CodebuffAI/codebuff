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
import { errorToObject } from '@codebuff/common/util/object'
import { withTimeout } from '@codebuff/common/util/promise'
import { generateCompactId } from '@codebuff/common/util/string'
import { APICallError, generateObject, generateText, streamText } from 'ai'
import { env } from '@codebuff/internal'

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
import type { CodebuffMessage, Message } from '@codebuff/common/types/message'
import type { OpenRouterUsageAccounting } from '@openrouter/ai-sdk-provider'
import type { AssistantModelMessage, UserModelMessage, LanguageModel } from 'ai'
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

// Add provider helper to improve logging context (no behavior change)
function getProviderForModel(model: Model): string {
  if (
    Object.values(finetunedVertexModels as Record<string, string>).includes(
      model,
    )
  ) {
    return 'vertex-finetuned'
  }
  if (Object.values(geminiModels).includes(model as GeminiModel)) {
    return 'google'
  }
  if (model === openaiModels.o3pro || model === openaiModels.o3) {
    return 'openai-responses'
  }
  if (Object.values(openaiModels).includes(model as OpenAIModel)) {
    return 'openai'
  }
  return 'openrouter'
}

// Provider preflight: return actionable error before attempting the call
function valueForEnv(key: string): string | undefined {
  // Prefer typed env if available, fall back to process.env
  return ((env as any)?.[key] ?? process.env[key]) as string | undefined
}

function getMissingProviderEnvKeys(provider: string): string[] {
  switch (provider) {
    case 'openrouter':
      return ['OPEN_ROUTER_API_KEY'].filter((k) => !valueForEnv(k))
    case 'openai':
    case 'openai-responses':
      return ['OPENAI_API_KEY'].filter((k) => !valueForEnv(k))
    case 'google':
      return ['GOOGLE_GENERATIVE_AI_API_KEY'].filter((k) => !valueForEnv(k))
    default:
      return [] // Skip strict checks for vertex/others to avoid false negatives
  }
}

function assertProviderConfigured(provider: string, model: Model) {
  const missing = getMissingProviderEnvKeys(provider)
  if (missing.length > 0) {
    const providerName = provider === 'google' ? 'Gemini' : provider
    const plural = missing.length > 1 ? 's' : ''
    throw new Error(
      `Provider not configured (${providerName}) for model "${model}": missing ${missing.join(', ')} environment variable${plural}.`,
    )
  }
}

// Build a concise, user-facing error message with provider/model context
function buildProviderErrorMessage(
  err: unknown,
  provider: string,
  model: Model,
) {
  const main =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : JSON.stringify(err)
  const status =
    (APICallError.isInstance(err) &&
      ((err as any).statusCode ?? (err as any).status)) ||
    (typeof err === 'object' && err && (err as any).status) ||
    (typeof err === 'object' && err && (err as any).statusCode)
  const statusPart = status ? `, status=${status}` : ''
  return `LLM request failed (provider=${provider}, model=${model}${statusPart}): ${main}`
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
    maxRetries?: number
  } & Omit<Parameters<typeof streamText>[0], 'model'>,
) {
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
  const provider = getProviderForModel(options.model)
  logger.debug(
    {
      provider,
      model: options.model,
      streaming: true,
      userId: options.userId,
      clientSessionId: options.clientSessionId,
      userInputId: options.userInputId,
      messages: options.messages.length,
      maxRetries: options.maxRetries,
    },
    'LLM request start',
  )

  // Preflight provider configuration
  assertProviderConfigured(provider, options.model)

  let aiSDKModel = modelToAiSDKModel(options.model)
  let response: any
  try {
    response = streamText({
      ...options,
      model: aiSDKModel,
      maxRetries: options.maxRetries,
    })
  } catch (err) {
    logger.error(
      {
        provider,
        model: options.model,
        userId: options.userId,
        clientSessionId: options.clientSessionId,
        userInputId: options.userInputId,
        error: errorToObject(err),
      },
      'LLM streamText init failed',
    )
    throw new Error(buildProviderErrorMessage(err, provider, options.model))
  }

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

      const errorMessage = buildProviderErrorMessage(
        chunk.error,
        provider,
        options.model,
      )
      throw new Error(errorMessage, {
        cause: chunk.error,
      })
    }
    if (chunk.type === 'reasoning-delta') {
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

  logger.debug(
    {
      provider,
      model: options.model,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startTime,
    },
    'LLM stream finished',
  )
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
  const provider = getProviderForModel(options.model)
  logger.debug(
    {
      provider,
      model: options.model,
      streaming: false,
      userId: options.userId,
      clientSessionId: options.clientSessionId,
      userInputId: options.userInputId,
      messages: options.messages.length,
    },
    'LLM request start',
  )

  // Preflight provider configuration
  assertProviderConfigured(provider, options.model)

  let response: any
  try {
    response = await generateText({
      ...options,
      model: aiSDKModel,
    })
  } catch (error) {
    logger.error(
      {
        provider,
        model: options.model,
        userId: options.userId,
        clientSessionId: options.clientSessionId,
        userInputId: options.userInputId,
        error: errorToObject(error),
      },
      'LLM generateText failed',
    )
    throw new Error(buildProviderErrorMessage(error, provider, options.model))
  }

  const content = response.text
  const inputTokens = response.usage.inputTokens || 0
  const outputTokens = response.usage.inputTokens || 0

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

  logger.debug(
    {
      provider,
      model: options.model,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startTime,
    },
    'LLM request finished',
  )

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
  const provider = getProviderForModel(options.model)
  logger.debug(
    {
      provider,
      model: options.model,
      structured: true,
      userId: options.userId,
      clientSessionId: options.clientSessionId,
      userInputId: options.userInputId,
      messages: options.messages.length,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      timeout: options.timeout,
    },
    'LLM request start',
  )

  // Preflight provider configuration
  assertProviderConfigured(provider, options.model)

  const responsePromise = generateObject<z.ZodType<T>, 'object'>({
    ...options,
    model: aiSDKModel,
    output: 'object',
  })

  let response: any
  try {
    response = await (options.timeout === undefined
      ? responsePromise
      : withTimeout(responsePromise, options.timeout))
  } catch (error) {
    logger.error(
      {
        provider,
        model: options.model,
        userId: options.userId,
        clientSessionId: options.clientSessionId,
        userInputId: options.userInputId,
        error: errorToObject(error),
      },
      'LLM generateObject failed',
    )
    throw new Error(buildProviderErrorMessage(error, provider, options.model))
  }

  const content = response.object
  const inputTokens = response.usage.inputTokens || 0
  const outputTokens = response.usage.inputTokens || 0

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

  logger.debug(
    {
      provider,
      model: options.model,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startTime,
    },
    'LLM structured request finished',
  )

  return content
}

// TODO: temporary - ideally we move to using CodebuffMessage[] directly
// and don't need this transform!!
export function transformMessages(
  messages: (Message | CodebuffMessage)[],
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

  for (const message of messages) {
    if (message.role === 'system') {
      if (typeof message.content === 'string') {
        codebuffMessages.push({ role: 'system', content: message.content })
        continue
      } else {
        throw new Error(
          'Multiple part system message - unsupported (TODO: fix if we hit this.)',
        )
      }
    }

    if (message.role === 'user') {
      if (typeof message.content === 'string') {
        codebuffMessages.push({
          ...message,
          role: 'user',
          content: message.content,
        })
        continue
      } else {
        const parts: UserModelMessage['content'] = []
        const modelMessage: UserModelMessage = { role: 'user', content: parts }
        for (const part of message.content) {
          // Add ephemeral if present
          if ('cache_control' in part) {
            modelMessage.providerOptions = {
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
        codebuffMessages.push(modelMessage)
        continue
      }
    }

    if (message.role === 'assistant') {
      if (message.content === undefined || message.content === null) {
        continue
      }
      if (typeof message.content === 'string') {
        codebuffMessages.push({
          ...message,
          role: 'assistant',
          content: message.content,
        })
        continue
      } else {
        let messageContent: AssistantModelMessage['content'] = []
        const modelMessage: AssistantModelMessage = {
          ...message,
          role: 'assistant',
          content: messageContent,
        }
        for (const part of message.content) {
          // Add ephemeral if present
          if ('cache_control' in part) {
            modelMessage.providerOptions = {
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
              input: part.input,
            })
          }
        }
        codebuffMessages.push(modelMessage)
        continue
      }
    }

    if (message.role === 'tool') {
      codebuffMessages.push(message)
      continue
    }

    throw new Error('Unknown message role received: ' + message)
  }

  return codebuffMessages
}
