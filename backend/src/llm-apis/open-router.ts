import { TEST_USER_ID } from 'common/constants'
import { removeCache } from 'common/util/messages'
import OpenAI from 'openai'

import { env } from '../env.mjs'
import { saveMessage } from '../llm-apis/message-cost-tracker'
import { logger } from '../util/logger'

export type OpenAIMessage = OpenAI.Chat.ChatCompletionMessageParam

let openai: OpenAI | null = null

const getOpenAI = (fingerprintId: string) => {
  if (!openai) {
    openai = new OpenAI({
      apiKey: env.OPEN_ROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://codebuff.com',
        'X-Title': 'Codebuff',
        'Helicone-Auth': `Bearer ${env.HELICONE_API_KEY}`,
        'Helicone-User-Id': fingerprintId,
      },
    })
  }

  return openai
}

export async function* promptOpenRouterStream(
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: string
    userId: string | undefined
    repositoryUrl?: string
    predictedContent?: string
    temperature?: number
  }
): AsyncGenerator<string, void, unknown> {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    model,
    userId,
    repositoryUrl,
    predictedContent,
  } = options
  const openai = getOpenAI(fingerprintId)
  const startTime = Date.now()

  try {
    const stream = await openai.chat.completions.create({
      model,
      messages: removeCache(messages as any) as OpenAIMessage[],
      temperature: options.temperature ?? 0,
      stream: true,
      ...(predictedContent
        ? { prediction: { type: 'content', content: predictedContent } }
        : {}),
      stream_options: {
        include_usage: true,
      },
    })

    let content = ''
    let messageId: string | undefined
    let inputTokens = 0
    let outputTokens = 0
    let cacheReadInputTokens = 0

    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        const delta = chunk.choices[0].delta.content
        content += delta
        yield delta
      }

      if (chunk.usage) {
        const totalInputTokens = chunk.usage.prompt_tokens
        cacheReadInputTokens =
          chunk.usage.prompt_tokens_details?.cached_tokens ?? 0
        inputTokens = totalInputTokens - cacheReadInputTokens
        outputTokens = chunk.usage.completion_tokens

        messageId = chunk.id
      }
    }

    if (messageId && messages.length > 0 && userId !== TEST_USER_ID) {
      saveMessage({
        messageId,
        userId,
        clientSessionId,
        fingerprintId,
        userInputId,
        model,
        request: messages,
        response: content,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        cacheReadInputTokens: cacheReadInputTokens || 0,
        finishedAt: new Date(),
        latencyMs: Date.now() - startTime,
        repositoryUrl,
      })
    }
  } catch (error) {
    logger.error(error, 'Error calling OpenRouter API Stream')
    throw error
  }
}

const timeoutPromise = (ms: number) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('OpenAI API request timed out')), ms)
  )

export async function promptOpenRouter(
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: string
    userId: string | undefined
    repositoryUrl?: string
    predictedContent?: string
    temperature?: number
  }
) {
  try {
    const timeout = options.model.startsWith('o1') ? 800_000 : 200_000
    const stream = promptOpenRouterStream(messages, options)

    let content = ''
    await Promise.race([
      (async () => {
        for await (const chunk of stream) {
          content += chunk
        }
      })(),
      timeoutPromise(timeout),
    ])
    const result = content

    if (!result) {
      throw new Error('No response from OpenRouter')
    }
    return result
  } catch (error) {
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
      },
      'Error calling OpenRouter API'
    )
    throw error
  }
}

/**
 * Get the account info for the OpenRouter API key.
 * @returns The account info for the OpenRouter API key
 */
export async function getOpenRouterAccountInfo() {
  const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.OPEN_ROUTER_API_KEY}`,
    },
  })

  const data = await response.json()
  console.log('data', data)
  return data
}
