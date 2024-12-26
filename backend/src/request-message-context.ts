import { Message } from 'common/actions'
import { claudeModels } from 'common/constants'
import db from 'common/db'
import { message } from 'common/db/schema'
import { desc, eq, sql, ilike, and, or } from 'drizzle-orm'
import { promptClaude, System } from './claude'
import { logger } from './util/logger'

export async function requestMessageContext(
  currentMessages: Message[],
  system: System,
  options: {
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
  }
) {
  // Get the last 100 messages from the database
  const lastMessages = await db
    .select({
      lastMessage: message.lastMessage,
      response: message.response,
      finishedAt: message.finished_at,
    })
    .from(message)
    .where(
      and(
        options.userId
          ? eq(message.user_id, options.userId)
          : eq(message.fingerprint_id, options.fingerprintId),
        or(
          ilike(message.lastMessage, '%<important_instruction>%'),
          ilike(message.lastMessage, '%<system_instruction>%')
        )
      )
    )
    .orderBy(desc(message.finished_at))
    .limit(100)

  if (lastMessages.length === 0) {
    return []
  }

  const lastUserMessage = currentMessages[currentMessages.length - 1]
  if (typeof lastUserMessage.content !== 'string') {
    return []
  }

  // Convert database messages to Message format
  const historicalMessages = lastMessages.flatMap((msg) => {
    const messages: Message[] = []
    const { lastMessage, response } = msg as {
      lastMessage: Message
      response: Message
    }
    if (
      typeof lastMessage.content === 'string' &&
      typeof response.content === 'string'
    ) {
      messages.push({
        role: 'user',
        content: lastMessage.content,
      })
      messages.push({
        role: 'assistant',
        content: response.content,
      })
    }

    return messages
  })

  const prompt = `Given the user's current request and their message history, determine which past messages are relevant to the current conversation. Only include messages that would help provide context or examples for addressing the current request.

Current request: "${lastUserMessage.content}"

Message history:
${historicalMessages
  .map(
    (m, i) =>
      `[${i + 1}] ${m.role.toUpperCase()}: ${
        typeof m.content === 'string' ? m.content : '[Complex message content]'
      }`
  )
  .join('\n')}

Return only the numbers of the relevant messages in a comma-separated list, or "none" if no messages are relevant. Do not include any other text in your response.`

  const response = await promptClaude([{ role: 'user', content: prompt }], {
    model: claudeModels.haiku,
    system,
    ...options,
  })

  if (response.toLowerCase().includes('none')) {
    return []
  }

  const relevantIndices = response
    .split(',')
    .map((n) => parseInt(n.trim()) - 1)
    .filter((n) => !isNaN(n) && n >= 0 && n < historicalMessages.length)

  const relevantMessages = relevantIndices.map((i) => historicalMessages[i])

  logger.debug(
    {
      relevantMessages: relevantMessages.length,
      totalMessages: historicalMessages.length,
      response,
    },
    'Found relevant historical messages'
  )

  return relevantMessages
}
