import { Message } from 'common/actions'
import { System } from '../claude'
import { OpenAIMessage } from '../openai-api'
import { countTokensJson } from './token-counter'

export const messagesWithSystem = (messages: Message[], system: System) =>
  [{ role: 'system', content: system }, ...messages] as OpenAIMessage[]

export function getMessageText(message: Message): string | undefined {
  if (typeof message.content === 'string') {
    return message.content
  }
  return message.content.map((c) => ('text' in c ? c.text : '')).join('\n')
}

/**
 * Trims messages from the beginning to fit within token limits
 * @param messages Array of messages to trim
 * @param systemTokens Number of tokens in the system prompt
 * @param lastUserMessageIndex Index of the last user message
 * @returns Trimmed messages array
 */
export function trimMessagesToFitTokenLimit(
  messages: Message[],
  systemTokens: number,
  lastUserMessageIndex: number
) {
  const MAX_TOTAL_TOKENS = 200_000
  const MAX_MESSAGE_TOKENS = MAX_TOTAL_TOKENS - systemTokens

  const messagesTokens = countTokensJson(messages)

  // If messages are within limits, return the original array
  if (messagesTokens <= MAX_MESSAGE_TOKENS) {
    return messages
  }

  // Always keep the last user message and any subsequent messages
  const essentialMessages = messages.slice(lastUserMessageIndex)
  let currentMessages = essentialMessages
  let currentTokens = countTokensJson(currentMessages)

  // Add messages from the end toward the beginning until we approach the limit
  for (let i = lastUserMessageIndex - 1; i >= 0; i--) {
    const message = messages[i]
    const messageTokens = countTokensJson([message])

    if (currentTokens + messageTokens <= MAX_MESSAGE_TOKENS) {
      currentMessages.unshift(message)
      currentTokens += messageTokens
    } else {
      break
    }
  }

  return currentMessages
}
