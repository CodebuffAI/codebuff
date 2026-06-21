import { userMessage } from '@codebuff/common/util/messages'
import { countTokensJson } from '@codebuff/agent-runtime/util/token-counter'
import { describe, expect, test } from 'bun:test'

import { getMessagesForModelContext } from '../llm'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('getMessagesForModelContext', () => {
  test('uses the default trim limit when context window is unknown', () => {
    const messages: Message[] = [userMessage('short context')]

    const result = getMessagesForModelContext({
      messages,
      logger,
    })

    expect(result).toBe(messages)
  })

  test('trims messages using the resolved model context window', () => {
    const messages: Message[] = [
      userMessage('old context '.repeat(10_000)),
      userMessage('middle context '.repeat(10_000)),
      userMessage('recent context '.repeat(10_000)),
    ]

    const largeContextResult = getMessagesForModelContext({
      messages,
      contextWindowTokens: 200_000,
      logger,
    })
    const smallContextResult = getMessagesForModelContext({
      messages,
      contextWindowTokens: 2_000,
      logger,
    })

    const smallContextJson = JSON.stringify(smallContextResult)

    expect(largeContextResult).toHaveLength(messages.length)
    expect(largeContextResult).toBe(messages)
    expect(smallContextResult).not.toEqual(messages)
    expect(smallContextJson).toContain(
      'Previous message(s) omitted due to length',
    )
    expect(smallContextJson).not.toContain('old context old context')
  })

  test('reserves part of the model context window for non-message request overhead', () => {
    const messages: Message[] = [userMessage('reserve-sensitive '.repeat(600))]
    const rawMessageTokens = countTokensJson(messages)

    const result = getMessagesForModelContext({
      messages,
      contextWindowTokens: rawMessageTokens + 512,
      logger,
    })

    expect(result).not.toEqual(messages)
    expect(JSON.stringify(result)).toContain(
      'Previous message(s) omitted due to length',
    )
  })
})
