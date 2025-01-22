import OpenAI from 'openai'
import { TEST_USER_ID } from 'common/constants'
import { env } from './env.mjs'
import { saveMessage } from './billing/message-cost-tracker'
import { logger } from './util/logger'

export type OpenAIMessage = OpenAI.Chat.ChatCompletionMessageParam

let relaceAI: OpenAI | null = null

const getRelaceAI = () => {
  if (!relaceAI) {
    relaceAI = new OpenAI({
      apiKey: env.RELACE_API_KEY,
      baseURL: 'https://fastapply.endpoint.relace.run/v1',
    })
  }

  return relaceAI
}

const timeoutPromise = (ms: number) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Relace API request timed out')), ms)
  )

export async function promptRelaceAI(
  messages: OpenAIMessage[],
  options: {
    model: string
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
  }
) {
  const { model, clientSessionId, fingerprintId, userInputId, userId } = options
  const relaceAI = getRelaceAI()
  const startTime = Date.now()
  try {
    const response = await Promise.race([
      relaceAI.chat.completions.create({
        model,
        messages,
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
          latencyMs: Date.now() - startTime,
        })
      }
      return content
    } else {
      throw new Error('No response from Relace AI')
    }
  } catch (error) {
    logger.error(
      {
        error:
          error && typeof error === 'object' && 'message' in error
            ? error.message
            : 'Unknown error',
      },
      'Error calling Relace AI'
    )

    throw error
  }
}
