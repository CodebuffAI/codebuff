import { AssertionError } from 'assert'

import { buildArray } from '@codebuff/common/util/array'
import { errorToObject } from '@codebuff/common/util/object'
import { closeXml } from '@codebuff/common/util/xml'
import { cloneDeep, isEqual } from 'lodash'

import { logger } from './logger'
import { simplifyTerminalCommandResults } from './simplify-tool-results'
import { countTokensJson } from './token-counter'

import type { System } from '../llm-apis/claude'
import type {
  CodebuffToolMessage,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type {
  Message,
  ToolMessage,
} from '@codebuff/common/types/messages/codebuff-message'

export function messagesWithSystem(
  messages: Message[],
  system: System,
): Message[] {
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

export function castAssistantMessage(message: Message): Message | null {
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

function simplifyTerminalHelper(
  toolResult: CodebuffToolOutput<'run_terminal_command'>,
  numKept: number,
): { result: CodebuffToolOutput<'run_terminal_command'>; numKept: number } {
  const simplified = simplifyTerminalCommandResults(toolResult)

  // Keep the full output for the N most recent commands
  if (numKept < numTerminalCommandsToKeep && !isEqual(simplified, toolResult)) {
    return { result: toolResult, numKept: numKept + 1 }
  }

  return {
    result: simplified,
    numKept,
  }
}

// Factor to reduce token count target by, to leave room for new messages
const shortenedMessageTokenFactor = 0.5
const replacementMessage = {
  role: 'user',
  content: asSystemMessage('Previous message(s) omitted due to length'),
} satisfies Message

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
  messages: Message[],
  systemTokens: number,
  maxTotalTokens: number = 190_000,
): Message[] {
  const maxMessageTokens = maxTotalTokens - systemTokens

  // Check if we're already under the limit
  const initialTokens = countTokensJson(messages)

  if (initialTokens < maxMessageTokens) {
    return messages
  }

  const shortenedMessages: Message[] = []
  let numKept = 0

  // Process messages from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'system' || m.role === 'user' || m.role === 'assistant') {
      shortenedMessages.push(m)
    } else if (m.role === 'tool') {
      if (m.content.toolName !== 'run_terminal_command') {
        shortenedMessages.push(m)
        continue
      }

      const terminalResultMessage = cloneDeep(
        m,
      ) as CodebuffToolMessage<'run_terminal_command'>

      const result = simplifyTerminalHelper(
        terminalResultMessage.content.output,
        numKept,
      )
      terminalResultMessage.content.output = result.result
      numKept = result.numKept

      shortenedMessages.push(terminalResultMessage)
    } else {
      m satisfies never
      const mAny = m as any
      throw new AssertionError({ message: `Not a valid role: ${mAny.role}` })
    }
  }
  shortenedMessages.reverse()

  const requiredTokens = countTokensJson(
    shortenedMessages.filter((m) => m.keepDuringTruncation),
  )
  let removedTokens = 0
  const tokensToRemove =
    (maxMessageTokens - requiredTokens) * (1 - shortenedMessageTokenFactor)

  const placeholder = 'deleted'
  const filteredMessages: (Message | typeof placeholder)[] = []
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
  messages: Message[],
  otherTokens: number,
): Message[] {
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
  messages: Message[],
  endOf: 'agentStep' | 'userPrompt',
): Message[] {
  return messages.filter((m) => {
    // Keep messages with no timeToLive
    if (m.timeToLive === undefined) return true

    // Remove messages that have expired
    if (m.timeToLive === 'agentStep') return false
    if (m.timeToLive === 'userPrompt' && endOf === 'userPrompt') return false

    return true
  })
}

export function getEditedFiles(messages: Message[]): string[] {
  return buildArray(
    messages
      .filter(
        (
          m,
        ): m is ToolMessage & {
          content: { toolName: 'create_plan' | 'str_replace' | 'write_file' }
        } => {
          return (
            m.role === 'tool' &&
            (m.content.toolName === 'create_plan' ||
              m.content.toolName === 'str_replace' ||
              m.content.toolName === 'write_file')
          )
        },
      )
      .map((m) => {
        try {
          const fileInfo = (
            m as CodebuffToolMessage<
              'create_plan' | 'str_replace' | 'write_file'
            >
          ).content.output[0].value
          if ('errorMessage' in fileInfo) {
            return null
          }
          return fileInfo.file
        } catch (error) {
          logger.error(
            { error: errorToObject(error), m },
            'Error parsing file info',
          )
          return null
        }
      }),
  )
}

export function getPreviouslyReadFiles(messages: Message[]): {
  path: string
  content: string
  referencedBy?: Record<string, string[]>
}[] {
  const files: ReturnType<typeof getPreviouslyReadFiles> = []
  for (const message of messages) {
    if (message.role !== 'tool') continue
    if (message.content.toolName === 'read_files') {
      try {
        files.push(
          ...(
            message as CodebuffToolMessage<'read_files'>
          ).content.output[0].value.filter(
            (
              file,
            ): file is typeof file & { contentOmittedForLength: undefined } =>
              !('contentOmittedForLength' in file),
          ),
        )
      } catch (error) {
        logger.error(
          { error: errorToObject(error), message },
          'Error parsing read_files output from message',
        )
      }
    }

    if (message.content.toolName === 'find_files') {
      try {
        const v = (message as CodebuffToolMessage<'find_files'>).content
          .output[0].value
        if ('message' in v) {
          continue
        }
        files.push(
          ...v.filter(
            (
              file,
            ): file is typeof file & { contentOmittedForLength: undefined } =>
              !('contentOmittedForLength' in file),
          ),
        )
      } catch (error) {
        logger.error(
          { error: errorToObject(error), message },
          'Error parsing find_files output from message',
        )
      }
    }
  }
  return files
}
