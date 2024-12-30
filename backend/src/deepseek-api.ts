import OpenAI from 'openai'
import { env } from './env.mjs'
import { saveMessage } from './billing/message-cost-tracker'
import { logger } from './util/logger'
import { OpenAIMessage } from './openai-api'
import { CompletionUsage } from 'openai/resources/completions'

export type DeepseekMessage = OpenAI.Chat.ChatCompletionMessageParam

let deepseekClient: OpenAI | null = null

const getDeepseekClient = (fingerprintId: string) => {
  if (!deepseekClient) {
    deepseekClient = new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com',
      defaultHeaders: {
        'Helicone-Auth': `Bearer ${env.HELICONE_API_KEY}`,
        'Helicone-User-Id': fingerprintId,
      },
    })
  }

  return deepseekClient
}

export async function* promptDeepseekStream(
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: string
    userId: string | undefined
    maxTokens?: number
    temperature?: number
  }
): AsyncGenerator<string, void, unknown> {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    model,
    userId,
    maxTokens,
    temperature,
  } = options
  const deepseek = getDeepseekClient(fingerprintId)
  const startTime = Date.now()

  try {
    const stream = await deepseek.chat.completions.create({
      model,
      messages,
      temperature: temperature ?? 0,
      max_tokens: maxTokens,
      stream: true,
    })

    let content = ''
    let messageId: string | undefined
    let inputTokens = 0
    let cacheReadInputTokens = 0
    let outputTokens = 0

    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        const delta = chunk.choices[0].delta.content
        content += delta
        yield delta
      }

      if (chunk.usage) {
        const usage = chunk.usage as CompletionUsage & {
          prompt_cache_miss_tokens: number
          prompt_cache_hit_tokens: number
        }
        messageId = chunk.id
        inputTokens = usage.prompt_cache_miss_tokens
        cacheReadInputTokens = usage.prompt_cache_hit_tokens
        outputTokens = usage.completion_tokens
      }
    }

    if (messageId && messages.length > 0) {
      saveMessage({
        messageId: `deepseek-${messageId}`,
        userId,
        clientSessionId,
        fingerprintId,
        userInputId,
        model,
        request: messages,
        response: content,
        inputTokens,
        cacheReadInputTokens,
        outputTokens,
        finishedAt: new Date(),
        latencyMs: Date.now() - startTime,
      })
    }
  } catch (error) {
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
        messages,
      },
      'Error calling Deepseek API'
    )

    throw error
  }
}

export async function promptDeepseek(
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: string
    userId: string | undefined
    maxTokens?: number
    temperature?: number
  }
) {
  const stream = promptDeepseekStream(messages, options)

  try {
    let content = ''
    for await (const chunk of stream) {
      content += chunk
    }
    return content
  } catch (error) {
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
      },
      'Error calling Deepseek API'
    )
    throw error
  }
}
