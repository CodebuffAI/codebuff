import { assistantMessage, userMessage } from '@codebuff/common/util/messages'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import { maybePruneContext, DEFAULT_MAX_CONTEXT_TOKENS } from '../context-pruning'
import * as tokenCounter from '../token-counter'

import type { Message } from '@codebuff/common/types/messages/codebuff-message'

// Mock logger for tests (matches pattern from messages.test.ts)
const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('maybePruneContext', () => {
  beforeEach(() => {
    // Mock countTokensJson to count characters (simple, deterministic)
    spyOn(tokenCounter, 'countTokensJson').mockImplementation((text) => {
      return JSON.stringify(text).length
    })
  })

  afterEach(() => {
    mock.restore()
  })

  it('returns pruned: false when contextTokenCount is under threshold', () => {
    const messages: Message[] = [
      userMessage('short message'),
      assistantMessage('short response'),
    ]

    const result = maybePruneContext({
      messages,
      systemTokens: 100,
      contextTokenCount: 200,
      maxTotalTokens: 190_000,
      logger: logger as never,
    })

    expect(result.pruned).toBe(false)
    expect(result.messages).toBe(messages) // same reference, no copy
  })

  it('returns pruned: true and trimmed messages when contextTokenCount exceeds threshold', () => {
    // Create messages large enough to trigger pruning
    const longContent = 'x'.repeat(200_000)
    const messages: Message[] = [
      userMessage(longContent),
      userMessage(longContent),
      userMessage('recent short message'),
    ]

    const result = maybePruneContext({
      messages,
      systemTokens: 100,
      contextTokenCount: 400_000, // exceeds 190k threshold
      maxTotalTokens: 190_000,
      logger: logger as never,
    })

    expect(result.pruned).toBe(true)
    // trimMessagesToFitTokenLimit returns a new array when it trims
    expect(result.messages).not.toBe(messages)
    expect(result.messages.length).toBeGreaterThan(0)
    // Some reduction in token count should have occurred
    const inputTokens = tokenCounter.countTokensJson(messages)
    const finalTokens = tokenCounter.countTokensJson(result.messages)
    expect(finalTokens).toBeLessThan(inputTokens)
  })

  it('uses DEFAULT_MAX_CONTEXT_TOKENS when maxTotalTokens is undefined', () => {
    const result = maybePruneContext({
      messages: [userMessage('test')],
      systemTokens: 100,
      contextTokenCount: 100, // under default (190k)
      logger: logger as never,
    })

    expect(result.pruned).toBe(false)
    expect(DEFAULT_MAX_CONTEXT_TOKENS).toBe(190_000)
  })

  it('prunes when contextTokenCount exceeds DEFAULT_MAX_CONTEXT_TOKENS and maxTotalTokens is undefined', () => {
    const longContent = 'x'.repeat(200_000)
    const messages: Message[] = [
      userMessage(longContent),
      userMessage(longContent),
      userMessage('recent'),
    ]

    const result = maybePruneContext({
      messages,
      systemTokens: 100,
      contextTokenCount: 400_000, // exceeds default 190k
      logger: logger as never,
    })

    expect(result.pruned).toBe(true)
  })
})
