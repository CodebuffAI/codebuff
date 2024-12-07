import OpenAI from 'openai'
import { TEST_USER_ID } from 'common/constants'
import { env } from './env.mjs'
import { saveMessage } from './billing/message-cost-tracker'
import { logger } from './util/logger'

export type GroqMessage = OpenAI.Chat.ChatCompletionMessageParam

let groqClient: OpenAI | null = null

const getGroqClient = (fingerprintId: string) => {
  if (!groqClient) {
    groqClient = new OpenAI({
      apiKey: env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      defaultHeaders: {
        'Helicone-Auth': `Bearer ${env.HELICONE_API_KEY}`,
        'Helicone-User-Id': fingerprintId,
        // 'Helicone-RateLimit-Policy': RATE_LIMIT_POLICY,
        // 'Helicone-LLM-Security-Enabled': 'true',
      },
    })
  }

  return groqClient
}

const timeoutPromise = (ms: number) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Groq API request timed out')), ms)
  )

export async function promptGroq(
  messages: GroqMessage[],
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
  const groq = getGroqClient(fingerprintId)
  try {
    const response = await Promise.race([
      groq.chat.completions.create({
        model,
        messages,
        temperature: temperature ?? 0,
        max_tokens: maxTokens,
      }),
      timeoutPromise(200_000) as Promise<OpenAI.Chat.ChatCompletion>,
    ])

    if (
      response.choices &&
      response.choices.length > 0 &&
      response.choices[0].message
    ) {
      const messageId = response.id
      const content = response.choices[0].message.content || ''
      if (messages.length > 0 && userId !== TEST_USER_ID) {
        saveMessage({
          messageId,
          userId,
          clientSessionId,
          fingerprintId,
          userInputId,
          model,
          request: messages,
          response: content,
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
          finishedAt: new Date(),
        })
      }
      return content
    } else {
      throw new Error('No response from Groq')
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
      'Error calling Groq API'
    )

    throw error
  }
}
