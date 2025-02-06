import { TEST_USER_ID } from 'common/constants'
import { env } from './env.mjs'
import { saveMessage } from './billing/message-cost-tracker'
import { logger } from './util/logger'
import { countTokens } from './util/token-counter'
import { createHash } from 'crypto'

const timeoutPromise = (ms: number) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Relace API request timed out')), ms)
  )

export async function promptRelaceAI(
  initialCode: string,
  editSnippet: string,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    codebuffId: string
    userMessage?: string
  }
) {
  const {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    userMessage,
    codebuffId,
  } = options
  const startTime = Date.now()

  try {
    const response = (await Promise.race([
      fetch('https://instantapplysmart.endpoint.relace.run/v1/code/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RELACE_API_KEY}`,
        },
        body: JSON.stringify({
          initialCode,
          editSnippet,
          stream: false,
          'relace-metadata': {
            'codebuff-id': codebuffId,
            'codebuff-user-prompt': userMessage,
          },
        }),
      }),
      timeoutPromise(100_000),
    ])) as Response

    if (!response.ok) {
      throw new Error(
        `Relace API error: ${response.status} ${response.statusText}`
      )
    }

    const data = (await response.json()) as { mergedCode: string }
    const content = data.mergedCode

    if (userId !== TEST_USER_ID) {
      saveMessage({
        messageId: `msg-${Date.now()}`,
        userId,
        clientSessionId,
        fingerprintId,
        userInputId,
        model: 'relace-fast-apply',
        request: [],
        response: content,
        inputTokens: countTokens(initialCode + editSnippet),
        outputTokens: countTokens(content),
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
      },
      'Error calling Relace AI'
    )

    throw error
  }
}

export function createRelaceCodebuffId(
  userId: string,
  initialCode: string,
  editSnippet: string
) {
  const hash = createHash('sha256')
    .update(initialCode)
    .update(editSnippet)
    .digest('hex')
    .slice(0, 8) // Take first 8 characters for a shorter hash
  return `codebuff-${userId}-${hash}`
}
