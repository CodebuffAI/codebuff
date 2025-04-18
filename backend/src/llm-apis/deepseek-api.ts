import OpenAI from 'openai'
import { env } from '../env.mjs'
import { saveMessage } from './message-cost-tracker'
import { logger } from '../util/logger'
import { OpenAIMessage } from './openai-api'
import { CompletionUsage } from 'openai/resources/completions'
import { withRetry } from 'common/util/promise'
import { models } from 'common/constants'
import { DeepseekModel } from 'common/constants'
import { removeUndefinedProps } from 'common/util/object'

function transformMessages(
  messages: OpenAIMessage[],
  model: DeepseekModel
): OpenAIMessage[] {
  return messages.map((msg) => {
    // When Deepseek properly adds image support to their models, we can update this to handle images
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
  }) as OpenAIMessage[]
}

export type DeepseekMessage = OpenAI.Chat.ChatCompletionMessageParam

let deepseekClient: OpenAI | null = null

const DEEPSEEK_TIMEOUT_MS = 90_000
const DEEPSEEK_MAX_RETRIES = 3

const timeoutErrorMessage = 'Deepseek API request timed out'
const timeoutPromise = (ms: number) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(timeoutErrorMessage)), ms)
  )

const getDeepseekClient = (fingerprintId: string) => {
  if (!deepseekClient) {
    deepseekClient = new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      // Use beta endpoint to enable prefix prompts
      // baseURL: 'https://api.deepseek.com',
      baseURL: 'https://api.deepseek.com/beta',
      timeout: DEEPSEEK_TIMEOUT_MS,
      maxRetries: DEEPSEEK_MAX_RETRIES,
      defaultHeaders: {
        'Helicone-Auth': `Bearer ${env.HELICONE_API_KEY}`,
        'Helicone-User-Id': fingerprintId,
      },
    })
  }

  return deepseekClient
}

async function* innerPromptDeepseekStream(
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: DeepseekModel
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
  const deepseek = getDeepseekClient(fingerprintId)
  const startTime = Date.now()
  let modifiedMessages = transformMessages(messages, model) as OpenAIMessage[]

  const lastMessage = modifiedMessages[modifiedMessages.length - 1]
  if (model === models.deepseekReasoner && lastMessage.role === 'assistant') {
    modifiedMessages = [
      ...modifiedMessages.slice(0, -1),
      { ...lastMessage, role: 'assistant', prefix: true } as any,
    ]
  }

  try {
    const stream = await withRetry(
      async () => {
        const streamPromise = deepseek.chat.completions.create(
          removeUndefinedProps({
            model: model,
            messages: modifiedMessages,
            max_tokens: maxTokens,
            stream: true,
            temperature:
              model === models.deepseekReasoner ? undefined : temperature ?? 0,
          })
        )

        return Promise.race([
          streamPromise,
          timeoutPromise(DEEPSEEK_TIMEOUT_MS),
        ]) as Promise<
          AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>
        >
      },
      {
        maxRetries: DEEPSEEK_MAX_RETRIES,
        retryIf: (error) => {
          // Only retry on timeout errors - Deepseek API rarely errors, just gets very slow
          return error instanceof Error && error.message === timeoutErrorMessage
        },
        onRetry: (error, attempt) => {
          logger.error(
            { error, attempt },
            `Deepseek API request timed out after ${DEEPSEEK_TIMEOUT_MS}ms, retrying...`
          )
        },
      }
    )

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

export const promptDeepseekStream = (
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: DeepseekModel
    userId: string | undefined
    maxTokens?: number
    temperature?: number
  }
): ReadableStream<string> => {
  // Use a readable stream to prevent base stream from being closed prematurely.
  return new ReadableStream({
    async start(controller) {
      try {
        const baseStream = innerPromptDeepseekStream(messages, options)

        // Stream all chunks from the generator to the controller
        for await (const chunk of baseStream) {
          controller.enqueue(chunk)
        }
        controller.close()
      } catch (error) {
        // For errors, send error message to client
        controller.error(
          new Error(
            `Deepseek API error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again later or reach out to ${env.NEXT_PUBLIC_SUPPORT_EMAIL} for help.`
          )
        )
      }
    },
  })
}

export async function promptDeepseek(
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: DeepseekModel
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
