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
 *
 * @param message The message to transform
 * @param model The Gemini model being used
 * @returns The transformed message in Gemini's expected format
 */
function transformedMessage(message: any, model: GeminiModel): OpenAIMessage {
  return match(message)
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
        ...message,
        content: {
          inlineData: m.content.source.data,
          mimeType: 'image/jpeg',
        },
      })
    )
    .otherwise(() => message)
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
        // 'Helicone-RateLimit-Policy': RATE_LIMIT_POLICY,
        // 'Helicone-LLM-Security-Enabled': 'true',
      },
    })
  }

  return geminiClient
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
  const gemini = getGeminiClient(fingerprintId)
  const startTime = Date.now()
  try {
    // Transform messages to Gemini's format
    const transformedMessages = messages.map((msg) =>
      transformedMessage(msg, options.model)
    )

    const response = await gemini.chat.completions.create({
      model,
      messages: transformedMessages,
      temperature: temperature ?? 0,
      max_tokens: maxTokens,
    })

    const content = response.choices[0].message.content ?? ''
    const { usage } = response
    if (usage) {
      saveMessage({
        messageId: `gemini-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        userId,
        clientSessionId,
        fingerprintId,
        userInputId,
        model,
        request: messages,
        response: content,
        inputTokens: usage.prompt_tokens,
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
      'Error calling Gemini API'
    )

    throw error
  }
}
