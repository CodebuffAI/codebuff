import { env } from '../env.mjs'
import { saveMessage } from './message-cost-tracker'
import { logger } from '../util/logger'
import { OpenAIMessage } from './openai-api'
import { withRetry } from 'common/util/promise'

const FIREWORKS_TIMEOUT_MS = 90_000
const FIREWORKS_MAX_RETRIES = 3

const timeoutErrorMessage = 'Fireworks API request timed out'
const timeoutPromise = (ms: number) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(timeoutErrorMessage)), ms)
  )

/**
 * Transform messages between our internal format and Fireworks format.
 * Strip out images since Deepseek doesn't support them yet.
 */
function transformMessages(messages: OpenAIMessage[]): OpenAIMessage[] {
  return messages.map((msg) => {
    if (typeof msg.content === 'object' && Array.isArray(msg.content)) {
      const hasImages = msg.content.some(
        (obj: { type: string }) => obj.type === 'image'
      )
      if (hasImages) {
        logger.info(
          'Stripping images from message - Deepseek does not support images yet'
        )
        return {
          ...msg,
          content: msg.content
            .filter((obj: { type: string }) => obj.type !== 'image')
            .map((obj) => ({ type: 'text', text: String(obj) })),
        } as OpenAIMessage
      }
    }
    return msg
  })
}

async function* innerPromptFireworksDeepseekStream(
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: 'deepseek-v3-0324'
    userId: string | undefined
    maxTokens?: number
    temperature?: number
  }
): AsyncGenerator<string, void, unknown> {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    temperature,
    userId,
    model,
    maxTokens,
  } = options
  const startTime = Date.now()
  const modifiedMessages = transformMessages(messages)

  try {
    const response: any = await withRetry(
      async () => {
        const fetchPromise = fetch(
          'https://api.fireworks.ai/inference/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${env.FIREWORKS_API_KEY}`,
              // 'Helicone-Auth': `Bearer ${env.HELICONE_API_KEY}`,
              // 'Helicone-User-Id': fingerprintId,
            },
            body: JSON.stringify({
              model: `accounts/fireworks/models/${model}`,
              max_tokens: maxTokens ?? 20480,
              top_p: 1,
              top_k: 40,
              presence_penalty: 0,
              frequency_penalty: 0,
              temperature: temperature ?? 0.6,
              messages: modifiedMessages,
              stream: true,
            }),
          }
        )

        return Promise.race([
          fetchPromise,
          timeoutPromise(FIREWORKS_TIMEOUT_MS),
        ])
      },
      {
        maxRetries: FIREWORKS_MAX_RETRIES,
        shouldRetry: (error) => {
          return error instanceof Error && error.message === timeoutErrorMessage
        },
        onRetry: (error, attempt) => {
          logger.error(
            { error, attempt },
            `Fireworks API request timed out after ${FIREWORKS_TIMEOUT_MS}ms, retrying...`
          )
        },
      }
    )

    console.log('response', response)

    if (!response.ok) {
      throw new Error(
        `Fireworks API error: ${response.status} ${response.statusText}`
      )
    }

    if (!response.body) {
      throw new Error('No response body from Fireworks API')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let content = ''
    let messageId: string | undefined
    let inputTokens = 0
    let outputTokens = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue

        const data = line.slice(6) // Remove 'data: ' prefix
        if (data === '[DONE]') continue

        try {
          const json = JSON.parse(data)
          if (json.choices?.[0]?.delta?.content) {
            const delta = json.choices[0].delta.content
            content += delta
            yield delta
          }

          if (json.id && !messageId) {
            messageId = json.id
          }

          if (json.usage) {
            inputTokens = json.usage.prompt_tokens
            outputTokens = json.usage.completion_tokens
          }
        } catch (error) {
          logger.error(
            { error, line },
            'Error parsing Fireworks API response chunk'
          )
        }
      }
    }

    if (messageId && messages.length > 0) {
      saveMessage({
        messageId: `fireworks-${messageId}`,
        userId,
        clientSessionId,
        fingerprintId,
        userInputId,
        model,
        request: messages,
        response: content,
        inputTokens,
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
      'Error calling Fireworks API'
    )

    throw error
  }
}

export const promptFireworksDeepseekStream = (
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: 'deepseek-v3-0324'
    userId: string | undefined
    maxTokens?: number
    temperature?: number
  }
) => {
  return innerPromptFireworksDeepseekStream(messages, options)
}

export async function promptFireworksDeepseek(
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: 'deepseek-v3-0324'
    userId: string | undefined
    maxTokens?: number
    temperature?: number
  }
) {
  const stream = promptFireworksDeepseekStream(messages, options)

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
      'Error calling Fireworks API'
    )
    throw error
  }
}
