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
    const response = await deepseek.chat.completions.create({
      model,
      messages,
      temperature: temperature ?? 0,
      max_tokens: maxTokens,
    })

    const content = response.choices[0].message.content ?? ''
    const usage = response.usage as CompletionUsage & {
      prompt_cache_miss_tokens: number
      prompt_cache_hit_tokens: number
    }
    if (usage) {
      saveMessage({
        messageId: `deepseek-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        userId,
        clientSessionId,
        fingerprintId,
        userInputId,
        model,
        request: messages,
        response: content,
        inputTokens: usage.prompt_cache_miss_tokens,
        cacheReadInputTokens: usage.prompt_cache_hit_tokens,
        outputTokens: usage.completion_tokens,
        finishedAt: new Date(),
        latencyMs: Date.now() - startTime,
      })
    }

    return content
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
