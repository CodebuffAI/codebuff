import { AssertionError } from 'assert'

import { buildArray } from '@codebuff/common/util/array'
import { getErrorObject } from '@codebuff/common/util/error'
import { systemMessage, userMessage } from '@codebuff/common/util/messages'
import { closeXml } from '@codebuff/common/util/xml'
import { isEqual } from 'lodash'

import {
  simplifyToolResultContent,
  SUMMARIZABLE_TOOL_NAMES,
} from './simplify-tool-results'
import { countTokensJson } from './token-counter'

import type { System } from '../llm-api/claude'
import type {
  CodebuffToolMessage,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type {
  TextPart,
  ImagePart,
} from '@codebuff/common/types/messages/content-part'

export function messagesWithSystem(params: {
  messages: Message[]
  system: System
}): Message[] {
  const { messages, system } = params
  return [systemMessage(system), ...messages]
}

export function asUserMessage(str: string): string {
  return `<user_message>${str}${closeXml('user_message')}`
}

/**
 * Combines prompt, params, and content into a unified message content structure.
 * Always wraps the first text part in <user_message> tags for consistent XML framing.
 * If you need a specific text part wrapped, put it first or pre-wrap it yourself before calling.
 */
export function buildUserMessageContent(
  prompt: string | undefined,
  params: Record<string, any> | undefined,
  content?: Array<TextPart | ImagePart>,
): Array<TextPart | ImagePart> {
  const promptHasNonWhitespaceText = (prompt ?? '').trim().length > 0

  // If we have content array (e.g., text + images)
  if (content && content.length > 0) {
    // Check if content has a non-empty text part
    const firstTextPart = content.find((p): p is TextPart => p.type === 'text')
    const hasNonEmptyText = firstTextPart && firstTextPart.text.trim()

    // If content has no meaningful text but prompt is provided, prepend prompt
    if (!hasNonEmptyText && promptHasNonWhitespaceText) {
      const nonTextContent = content.filter((p) => p.type !== 'text')
      return [
        { type: 'text' as const, text: asUserMessage(prompt!) },
        ...nonTextContent,
      ]
    }

    // Find the first text part and wrap it in <user_message> tags
    let hasWrappedText = false
    const wrappedContent = content.map((part) => {
      if (part.type === 'text' && !hasWrappedText) {
        hasWrappedText = true
        // Check if already wrapped
        const alreadyWrapped = parseUserMessage(part.text) !== undefined
        if (alreadyWrapped) {
          return part
        }
        return {
          type: 'text' as const,
          text: asUserMessage(part.text),
        }
      }
      return part
    })
    return wrappedContent
  }

  // Only prompt/params, combine and return as simple text
  const textParts = buildArray([
    promptHasNonWhitespaceText ? prompt : undefined,
    params && JSON.stringify(params, null, 2),
  ])
  return [
    {
      type: 'text',
      text: asUserMessage(textParts.join('\n\n')),
    },
  ]
}

export function parseUserMessage(str: string): string | undefined {
  const match = str.match(/<user_message>(.*?)<\/user_message>/s)
  return match ? match[1] : undefined
}

export function withSystemInstructionTags(str: string): string {
  return `<system_instructions>${str}${closeXml('system_instructions')}`
}

export function withSystemTags(str: string): string {
  return `<system>${str}${closeXml('system')}`
}

export function castAssistantMessage(message: Message): Message | null {
  if (message.role !== 'assistant') {
    return message
  }
  if (typeof message.content === 'string') {
    return userMessage(
      `<previous_assistant_message>${message.content}${closeXml('previous_assistant_message')}`,
    )
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

// Number of summarizable tool results to keep in full form before simplifying.
// Keep only the newest result verbatim; older results are summarized so long
// validation/test/search loops do not dominate the main agent context.
const numToolResultsToKeep = 1

function simplifyToolResultHelper(params: {
  toolName: string
  toolResult: CodebuffToolOutput
  numKept: number
  logger: Logger
}): { result: CodebuffToolOutput; numKept: number } {
  const { toolName, toolResult, numKept, logger } = params
  const simplified = simplifyToolResultContent({
    toolName,
    content: toolResult,
    logger,
  })

  // Keep the full output for the N most recent summarizable results
  if (numKept < numToolResultsToKeep && !isEqual(simplified, toolResult)) {
    return { result: toolResult, numKept: numKept + 1 }
  }

  return {
    result: simplified,
    numKept,
  }
}

// Factor to reduce token count target by, to leave room for new messages
const shortenedMessageTokenFactor = 0.5
const replacementMessage = userMessage(
  withSystemTags('Previous message(s) omitted due to length'),
)

type ContextCategory =
  | 'toolResults'
  | 'todos'
  | 'fileReads'
  | 'subagents'
  | 'userAssistantMessages'

type ContextCategorySummary = Record<
  ContextCategory,
  { tokens: number; percent: number; messages: number }
>

const emptyContextCategorySummary = (): ContextCategorySummary => ({
  toolResults: { tokens: 0, percent: 0, messages: 0 },
  todos: { tokens: 0, percent: 0, messages: 0 },
  fileReads: { tokens: 0, percent: 0, messages: 0 },
  subagents: { tokens: 0, percent: 0, messages: 0 },
  userAssistantMessages: { tokens: 0, percent: 0, messages: 0 },
})

function getContextCategory(message: Message): ContextCategory {
  if (message.role !== 'tool') {
    return 'userAssistantMessages'
  }

  if (message.toolName === 'write_todos') {
    return 'todos'
  }

  if (
    message.toolName === 'read_files' ||
    message.toolName === 'find_files' ||
    message.toolName === 'read_subtree' ||
    message.toolName === 'read_outline' ||
    message.toolName === 'query_index'
  ) {
    return 'fileReads'
  }

  if (message.toolName === 'spawn_agents') {
    return 'subagents'
  }

  return 'toolResults'
}

export function getContextCategoryTelemetry(
  messages: Message[],
): ContextCategorySummary {
  const summary = emptyContextCategorySummary()
  let totalTokens = 0

  for (const message of messages) {
    const category = getContextCategory(message)
    const tokens = countTokensJson(message)
    summary[category].tokens += tokens
    summary[category].messages += 1
    totalTokens += tokens
  }

  if (totalTokens === 0) {
    return summary
  }

  for (const category of Object.keys(summary) as ContextCategory[]) {
    summary[category].percent = Math.round(
      (summary[category].tokens / totalTokens) * 100,
    )
  }

  return summary
}

/**
 * Trims messages from the beginning to fit within token limits while preserving
 * important content. Also simplifies large tool results to save tokens.
 *
 * The function:
 * 1. Processes messages from newest to oldest
 * 2. Simplifies summarizable tool results after keeping N most recent ones
 * 3. Stops adding messages when approaching token limit
 *
 * @param messages - Array of messages to trim
 * @param systemTokens - Number of tokens used by system prompt
 * @param maxTotalTokens - Maximum total tokens allowed, defaults to 200k
 * @returns Trimmed array of messages that fits within token limit
 */
export function trimMessagesToFitTokenLimit(params: {
  messages: Message[]
  systemTokens: number
  maxTotalTokens?: number
  logger: Logger
}): Message[] {
  const { messages, systemTokens, maxTotalTokens = 190_000, logger } = params
  const maxMessageTokens = maxTotalTokens - systemTokens

  // Check if we're already under the limit
  const initialTokens = countTokensJson(messages)

  if (initialTokens < maxMessageTokens) {
    return messages
  }

  const initialContextCategoryTelemetry = getContextCategoryTelemetry(messages)

  const shortenedMessages: Message[] = []
  let numKept = 0

  // Process messages from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'system' || m.role === 'user' || m.role === 'assistant') {
      shortenedMessages.push(m)
    } else if (m.role === 'tool') {
      if (!SUMMARIZABLE_TOOL_NAMES.has(m.toolName)) {
        shortenedMessages.push(m)
        continue
      }

      const toolResultMessage = structuredClone(m) as CodebuffToolMessage

      const result = simplifyToolResultHelper({
        toolName: toolResultMessage.toolName,
        toolResult: toolResultMessage.content,
        numKept,
        logger,
      })
      toolResultMessage.content = result.result
      numKept = result.numKept

      shortenedMessages.push(toolResultMessage)
    } else {
      m satisfies never
      throw new AssertionError({
        message: `Not a valid role: ${(m as { role: unknown }).role}`,
      })
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

  let trimmedMessages = filteredMessages.map((m) =>
    m === placeholder ? replacementMessage : m,
  )

  // Compute the running token total once (O(n)), then maintain it with
  // per-message deltas inside the simplification loop. Previously the loop
  // re-counted the entire array on every iteration, making the simplification
  // pass O(n²) in the number of messages.
  let runningTokens = countTokensJson(trimmedMessages)
  if (runningTokens > maxMessageTokens) {
    trimmedMessages = structuredClone(trimmedMessages)
    // Re-count after the deep clone since cloneDeep may preserve or strip
    // non-token-relevant fields; the clone is what we now mutate.
    runningTokens = countTokensJson(trimmedMessages)

    for (let i = trimmedMessages.length - 1; i >= 0; i--) {
      const message = trimmedMessages[i]
      if (
        message.role !== 'tool' ||
        !SUMMARIZABLE_TOOL_NAMES.has(message.toolName)
      ) {
        continue
      }

      const toolMessage = message as CodebuffToolMessage
      const beforeTokens = countTokensJson(message)
      const simplified = simplifyToolResultContent({
        toolName: toolMessage.toolName,
        content: toolMessage.content,
        logger,
      })
      if (isEqual(simplified, toolMessage.content)) {
        continue
      }

      toolMessage.content = simplified
      const afterTokens = countTokensJson(message)
      runningTokens += afterTokens - beforeTokens

      if (runningTokens <= maxMessageTokens) {
        break
      }
    }
  }

  logger.debug(
    {
      initialTokens,
      finalTokens: countTokensJson(trimmedMessages),
      maxMessageTokens,
      contextCategoryTelemetry: {
        before: initialContextCategoryTelemetry,
        after: getContextCategoryTelemetry(trimmedMessages),
      },
    },
    'Context category telemetry after trimming messages',
  )

  return trimmedMessages
}

export function getMessagesSubset(params: {
  messages: Message[]
  otherTokens: number
  logger: Logger
}): Message[] {
  const { messages, otherTokens, logger } = params
  const messagesSubset = trimMessagesToFitTokenLimit({
    messages,
    systemTokens: otherTokens,
    logger,
  })

  // trimMessagesToFitTokenLimit may return the original `messages` array
  // unchanged (early-return when already under the token limit), so mutating
  // message objects in place here would corrupt the caller's shared history.
  // Deep-clone before mutating providerOptions.
  const messagesSubsetClone = structuredClone(messagesSubset)

  // Remove cache_control from all messages
  for (const message of messagesSubsetClone) {
    for (const provider of ['anthropic', 'openrouter', 'codebuff'] as const) {
      delete message.providerOptions?.[provider]?.cacheControl
    }
  }

  // Cache up to the last message!
  const lastMessage = messagesSubsetClone[messagesSubsetClone.length - 1]
  if (!lastMessage) {
    logger.debug(
      {
        messages,
        messagesSubset: messagesSubsetClone,
        otherTokens,
      },
      'No last message found in messagesSubset!',
    )
  }

  return messagesSubsetClone
}

export function expireMessages(
  messages: Message[],
  endOf: 'agentStep' | 'userPrompt',
): Message[] {
  const ttlFilteredMessages = messages.filter((m) => {
    // Keep messages with no timeToLive
    if (m.timeToLive === undefined) return true

    // Remove messages that have expired
    if (m.timeToLive === 'agentStep') return false
    if (m.timeToLive === 'userPrompt' && endOf === 'userPrompt') return false

    return true
  })

  const lastIndexByTag = new Map<string, number>()
  ttlFilteredMessages.forEach((message, index) => {
    for (const tag of message.tags ?? []) {
      lastIndexByTag.set(tag, index)
    }
  })

  return ttlFilteredMessages.filter((message, index) => {
    for (const tag of message.keepLastTags ?? []) {
      if (message.tags?.includes(tag) && lastIndexByTag.get(tag) !== index) {
        return false
      }
    }
    return true
  })
}

/**
 * Removes tool calls from the message history that don't have corresponding tool responses.
 * This is important when passing message history to spawned agents, as unfinished tool calls
 * will cause issues with the LLM expecting tool responses.
 *
 * The function:
 * 1. Collects all toolCallIds from tool response messages
 * 2. Filters assistant messages to remove tool-call content parts without responses
 * 3. Removes assistant messages that become empty after filtering
 */
export function filterUnfinishedToolCalls(messages: Message[]): Message[] {
  // Collect all toolCallIds that have corresponding tool responses
  const respondedToolCallIds = new Set<string>()
  for (const message of messages) {
    if (message.role === 'tool') {
      respondedToolCallIds.add(message.toolCallId)
    }
  }

  // Filter messages, removing unfinished tool calls from assistant messages
  const filteredMessages: Message[] = []
  for (const message of messages) {
    if (message.role !== 'assistant') {
      filteredMessages.push(message)
      continue
    }

    // Filter out tool-call content parts that don't have responses
    const filteredContent = message.content.filter((part) => {
      if (part.type !== 'tool-call') {
        return true
      }
      return respondedToolCallIds.has(part.toolCallId)
    })

    // Only include the assistant message if it has content after filtering
    if (filteredContent.length > 0) {
      filteredMessages.push({
        ...message,
        content: filteredContent,
      })
    }
  }

  return filteredMessages
}

export function getEditedFiles(params: {
  messages: Message[]
  logger: Logger
}): string[] {
  const { messages, logger } = params
  return buildArray(
    messages
      .filter(
        (
          m,
        ): m is CodebuffToolMessage<
          'create_plan' | 'str_replace' | 'write_file'
        > => {
          return (
            m.role === 'tool' &&
            (m.toolName === 'create_plan' ||
              m.toolName === 'str_replace' ||
              m.toolName === 'write_file')
          )
        },
      )
      .map((m) => {
        try {
          const fileInfo = m.content[0].value
          if ('errorMessage' in fileInfo) {
            return null
          }
          return fileInfo.file
        } catch (error) {
          logger.error(
            { error: getErrorObject(error), m },
            'Error parsing file info',
          )
          return null
        }
      }),
  )
}

export function getPreviouslyReadFiles(params: {
  messages: Message[]
  logger: Logger
}): {
  path: string
  content: string
  referencedBy?: Record<string, string[]>
}[] {
  const { messages, logger } = params
  const files: ReturnType<typeof getPreviouslyReadFiles> = []
  for (const message of messages) {
    if (message.role !== 'tool') continue
    if (message.toolName === 'read_files') {
      try {
        files.push(
          ...(
            message as CodebuffToolMessage<'read_files'>
          ).content[0].value.filter(
            (
              file,
            ): file is Extract<typeof file, { content: string }> =>
              'content' in file,
          ),
        )
      } catch (error) {
        logger.error(
          { error: getErrorObject(error), message },
          'Error parsing read_files output from message',
        )
      }
    }

    if (message.toolName === 'find_files') {
      try {
        const v = (message as CodebuffToolMessage<'find_files'>).content[0]
          .value
        if ('message' in v) {
          continue
        }
        files.push(
          ...v.filter(
            (
              file,
            ): file is Extract<typeof file, { content: string }> =>
              'content' in file,
          ),
        )
      } catch (error) {
        logger.error(
          { error: getErrorObject(error), message },
          'Error parsing find_files output from message',
        )
      }
    }
  }
  return files
}
