import OpenAI from 'openai'
import { TEST_USER_ID } from 'common/constants'
import { env } from './env.mjs'
import { saveMessage } from './billing/message-cost-tracker'
import { logger } from './util/logger'
import { OpenAIMessage } from './openai-api'
import { GeminiModel } from 'common/constants'
import { match, P } from 'ts-pattern'

/**
 * Transform messages between our internal format and Gemini's format.
 * All Gemini models support images in their specific format.
 */
function transformMessages(messages: OpenAIMessage[], model: GeminiModel): OpenAIMessage[] {
  return messages.map(msg => 
    match(msg as any)
      .with(
        {
          content: {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: P.string,
            },
          },
        },
        (m) => ({
          ...msg,
          content: {
            inlineData: m.content.source.data,
            mimeType: 'image/jpeg',
          },
        })
      )
      .otherwise(() => msg)
  ) as OpenAIMessage[]
}

export type GeminiMessage = OpenAI.Chat.ChatCompletionMessageParam

let geminiClient: OpenAI | null = null

const getGeminiClient = (fingerprintId: string) => {
  if (!geminiClient) {
    geminiClient = new OpenAI({
      apiKey: env.GEMINI_API_KEY,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      defaultHeaders: {
        'Helicone-Auth': `Bearer ${env.HELICONE_API_KEY}`,
        'Helicone-User-Id': fingerprintId,
      },
    })
  }

  return geminiClient
}

export function promptGeminiStream(
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: GeminiModel
    userId: string | undefined
    maxTokens?: number
    temperature?: number
  }
): ReadableStream<string> {
  return new ReadableStream({
    async start(controller) {
      const gemini = getGeminiClient(options.fingerprintId)
      const startTime = Date.now()
      try {
        const transformedMessages = transformMessages(messages, options.model)

        const stream = await gemini.chat.completions.create({
          model: options.model,
          messages: transformedMessages,
          temperature: options.temperature ?? 0,
          max_tokens: options.maxTokens,
          stream: true,
        })

        let content = ''
        let messageId: string | undefined
        let inputTokens = 0
        let outputTokens = 0

        for await (const chunk of stream) {
          if (chunk.choices[0]?.delta?.content) {
            const delta = chunk.choices[0].delta.content
            content += delta
            controller.enqueue(delta)
          }

          if (chunk.usage) {
            messageId = chunk.id
            inputTokens = chunk.usage.prompt_tokens
            outputTokens = chunk.usage.completion_tokens
          }
        }

        if (messageId && messages.length > 0 && options.userId !== TEST_USER_ID) {
          saveMessage({
            messageId: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            userId: options.userId,
            clientSessionId: options.clientSessionId,
            fingerprintId: options.fingerprintId,
            userInputId: options.userInputId,
            model: options.model,
            request: messages,
            response: content,
            inputTokens: inputTokens || 0,
            outputTokens: outputTokens || 0,
            finishedAt: new Date(),
            latencyMs: Date.now() - startTime,
          })
        }

        controller.close()
      } catch (error) {
        logger.error(
          {
            error:
              error && typeof error === 'object' && 'message' in error
                ? error.message
                : 'Unknown error',
            messages,
          },
          'Error calling Gemini API'
        )
        controller.error(error)
      }
    },
  })
}

export async function promptGemini(
  messages: OpenAIMessage[],
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    model: GeminiModel
    userId: string | undefined
    maxTokens?: number
    temperature?: number
  }
): Promise<string> {
  const stream = promptGeminiStream(messages, options)
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
      'Error calling Gemini API'
    )
    throw error
  }
}
