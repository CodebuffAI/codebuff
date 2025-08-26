import { AssertionError } from 'assert'

import { buildArray } from '@codebuff/common/util/array'
import { closeXml } from '@codebuff/common/util/xml'

import { simplifyTerminalCommandResults } from './simplify-tool-results'
import { countTokensJson } from './token-counter'

import type { CodebuffMessage } from '@codebuff/common/types/messages/codebuff-message'
import type { LoggerEnvironment } from '../analytics/interfaces'

// Default console logger
const defaultLogger: LoggerEnvironment = {
  debug: (data: any, message?: string) => console.debug(message || '', data),
  info: (data: any, message?: string) => console.info(message || '', data),
  warn: (data: any, message?: string) => console.warn(message || '', data),
  error: (data: any, message?: string) => console.error(message || '', data),
}

export type System = string | Array<{ text: string }>

export function messagesWithSystem(
  messages: CodebuffMessage[],
  system: System,
): CodebuffMessage[] {
  return [
    {
      role: 'system',
      content:
        typeof system === 'string'
          ? system
          : system.map((part) => part.text).join('\n\n'),
    },
    ...messages,
  ]
}

export function asUserMessage(str: string): string {
  return `<user_message>${str}${closeXml('user_message')}`
}
export function parseUserMessage(str: string): string | undefined {
  const match = str.match(/<user_message>(.*?)<\/user_message>/s)
  return match ? match[1] : undefined
}

export function asSystemInstruction(str: string): string {
  return `<system_instructions>${str}${closeXml('system_instructions')}`
}

export function asSystemMessage(str: string): string {
  return `<system>${str}${closeXml('system')}`
}

export function isSystemInstruction(str: string): boolean {
  return (
    str.startsWith('<system_instructions>') &&
    str.endsWith(closeXml('system_instructions'))
  )
}

export function isSystemMessage(str: string): boolean {
  return str.startsWith('<system>') && str.endsWith(closeXml('system'))
}

export function castAssistantMessage(
  message: CodebuffMessage,
): CodebuffMessage | null {
  if (message.role !== 'assistant') {
    return message
  }
  if (typeof message.content === 'string') {
    return {
      content: `<previous_assistant_message>${message.content}${closeXml('previous_assistant_message')}`,
      role: 'user' as const,
    }
  }
  const content = buildArray(
    message.content.map((m) => {
      if (m.type === 'text') {
        return {
          ...m,
          text: `<previous_assistant_message>${m.text}${closeXml('previous_assistant_message')}`,
        }
      }
      return null
    }),
  )
  return content
    ? {
        role: 'user' as const,
        content,
      }
    : null
}

// Number of terminal command outputs to keep in full form before simplifying
const numTerminalCommandsToKeep = 5

/**
 * Helper function to simplify terminal command output while preserving some recent ones
 * @param text - Terminal output text to potentially simplify
 * @param numKept - Number of terminal outputs already kept in full form
 * @returns Object containing simplified result and updated count of kept outputs
 */
function simplifyTerminalHelper(
  text: string,
  numKept: number,
): { result: string; numKept: number } {
  const simplifiedText = simplifyTerminalCommandResults(text)

  // Keep the full output for the N most recent commands
  if (numKept < numTerminalCommandsToKeep && simplifiedText !== text) {
    return { result: text, numKept: numKept + 1 }
  }

  return {
    result: simplifiedText,
    numKept,
  }
}

// Factor to reduce token count target by, to leave room for new messages
const shortenedMessageTokenFactor = 0.5
const replacementMessage = {
  role: 'user',
  content: asSystemMessage('Previous message(s) omitted due to length'),
} satisfies CodebuffMessage

/**
 * Trims messages from the beginning to fit within token limits while preserving
 * important content. Also simplifies terminal command outputs to save tokens.
 *
 * The function:
 * 1. Processes messages from newest to oldest
 * 2. Simplifies terminal command outputs after keeping N most recent ones
 * 3. Stops adding messages when approaching token limit
 *
 * @param messages - Array of messages to trim
 * @param systemTokens - Number of tokens used by system prompt
 * @param maxTotalTokens - Maximum total tokens allowed, defaults to 200k
 * @returns Trimmed array of messages that fits within token limit
 */
export function trimMessagesToFitTokenLimit(
  messages: CodebuffMessage[],
  systemTokens: number,
  maxTotalTokens: number = 190_000,
): CodebuffMessage[] {
  const maxMessageTokens = maxTotalTokens - systemTokens

  // Check if we're already under the limit
  const initialTokens = countTokensJson(messages)

  if (initialTokens < maxMessageTokens) {
    return messages
  }

  const shortenedMessages: CodebuffMessage[] = []
  let numKept = 0

  // Process messages from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    let message: CodebuffMessage
    if (m.role === 'tool' || m.role === 'system') {
      message = messages[i]
    } else if (m.role === 'user') {
      let newContent: typeof m.content

      // Handle string content (usually terminal output)
      if (typeof m.content === 'string') {
        const result = simplifyTerminalHelper(m.content, numKept)
        message = { role: m.role, content: result.result }
        numKept = result.numKept
      } else {
        // Handle array content (mixed content types)
        newContent = []
        // Process content parts from newest to oldest
        for (let j = m.content.length - 1; j >= 0; j--) {
          const messagePart = m.content[j]
          // Preserve non-text content (i.e. images)
          if (messagePart.type !== 'text') {
            newContent.push(messagePart)
            continue
          }

          const result = simplifyTerminalHelper(messagePart.text, numKept)
          newContent.push({ ...messagePart, text: result.result })
          numKept = result.numKept
        }
        newContent.reverse()
        message = { ...m, content: newContent }
      }
    } else if (m.role === 'assistant') {
      let newContent: typeof m.content

      // Handle string content (usually terminal output)
      if (typeof m.content === 'string') {
        const result = simplifyTerminalHelper(m.content, numKept)
        message = { role: m.role, content: result.result }
        numKept = result.numKept
      } else {
        // Handle array content (mixed content types)
        newContent = []
        // Process content parts from newest to oldest
        for (let j = m.content.length - 1; j >= 0; j--) {
          const messagePart = m.content[j]
          // Preserve non-text content (i.e. images)
          if (messagePart.type !== 'text') {
            newContent.push(messagePart)
            continue
          }

          const result = simplifyTerminalHelper(messagePart.text, numKept)
          newContent.push({ ...messagePart, text: result.result })
          numKept = result.numKept
        }
        newContent.reverse()
        message = { ...m, content: newContent }
      }
    } else {
      m satisfies never
      throw new AssertionError({ message: 'Not a valid role' })
    }

    shortenedMessages.push(message)
  }
  shortenedMessages.reverse()

  const requiredTokens = countTokensJson(
    shortenedMessages.filter((m) => m.keepDuringTruncation),
  )
  let removedTokens = 0
  const tokensToRemove =
    (maxMessageTokens - requiredTokens) * (1 - shortenedMessageTokenFactor)

  const placeholder = 'deleted'
  const filteredMessages: (CodebuffMessage | typeof placeholder)[] = []
  for (const message of shortenedMessages) {
    if (removedTokens >= tokensToRemove || message.keepDuringTruncation) {
      filteredMessages.push(message)
      continue
    }
    removedTokens += countTokensJson(message)
    if (
      filteredMessages.length === 0 ||
      filteredMessages[filteredMessages.length - 1] !== placeholder
    ) {
      filteredMessages.push(placeholder)
      removedTokens -= countTokensJson(replacementMessage)
    }
  }

  return filteredMessages.map((m) =>
    m === placeholder ? replacementMessage : m,
  )
}

export function getMessagesSubset(
  messages: CodebuffMessage[],
  otherTokens: number,
  logger: LoggerEnvironment = defaultLogger,
): CodebuffMessage[] {
  const messagesSubset = trimMessagesToFitTokenLimit(messages, otherTokens)

  // Remove cache_control from all messages
  for (const message of messagesSubset) {
    delete message.providerOptions?.anthropic?.cacheControl
    delete message.providerOptions?.openrouter?.cacheControl
  }

  // Cache up to the last message!
  const lastMessage = messagesSubset[messagesSubset.length - 1]
  if (!lastMessage) {
    logger.debug(
      {
        messages,
        messagesSubset,
        otherTokens,
      },
      'No last message found in messagesSubset!',
    )
  }

  return messagesSubset
}

export function expireMessages(
  messages: CodebuffMessage[],
  endOf: 'agentStep' | 'userPrompt',
): CodebuffMessage[] {
  return messages.filter((m) => {
    // Keep messages with no timeToLive
    if (m.timeToLive === undefined) return true

    // Remove messages that have expired
    if (m.timeToLive === 'agentStep') return false
    if (m.timeToLive === 'userPrompt' && endOf === 'userPrompt') return false

    return true
  })
}
