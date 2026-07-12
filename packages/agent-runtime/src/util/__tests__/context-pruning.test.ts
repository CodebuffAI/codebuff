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

import {
  maybePruneContext,
  DEFAULT_MAX_CONTEXT_TOKENS,
  getModelContextReservedTokens,
  getModelContextMessageLimit,
  MODEL_CONTEXT_MIN_RESERVED_TOKENS,
  MODEL_CONTEXT_MAX_RESERVED_TOKENS,
  MODEL_CONTEXT_RESERVED_FRACTION,
} from '../context-pruning'
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

describe('getModelContextReservedTokens (M4.2 unified reserved-token policy)', () => {
  it('returns undefined when contextWindowTokens is undefined', () => {
    expect(getModelContextReservedTokens(undefined)).toBeUndefined()
  })

  it('floors to the fraction of the window and clamps to [MIN, MAX]', () => {
    // 10% of 100_000 = 10_000, within [1024, 16000] -> 10_000
    expect(getModelContextReservedTokens(100_000)).toBe(10_000)
    // 10% of 200_000 = 20_000, clamped down to MAX 16_000
    expect(getModelContextReservedTokens(200_000)).toBe(16_000)
    // 10% of 5_000 = 500, clamped up to MIN 1_024
    expect(getModelContextReservedTokens(5_000)).toBe(1_024)
  })

  it('honors the reserved fraction constant', () => {
    expect(MODEL_CONTEXT_RESERVED_FRACTION).toBe(0.1)
    expect(MODEL_CONTEXT_MIN_RESERVED_TOKENS).toBe(1_024)
    expect(MODEL_CONTEXT_MAX_RESERVED_TOKENS).toBe(16_000)
  })
})

describe('getModelContextMessageLimit (M4 unified threshold convergence)', () => {
  it('returns DEFAULT_MAX_CONTEXT_TOKENS when model window is unknown', () => {
    expect(getModelContextMessageLimit(undefined)).toBe(
      DEFAULT_MAX_CONTEXT_TOKENS,
    )
  })

  it('subtracts the reserved overhead from the model context window', () => {
    // 100_000 - 10_000 (10% reserve) = 90_000
    expect(getModelContextMessageLimit(100_000)).toBe(90_000)
    // 200_000 - 16_000 (clamped reserve) = 184_000
    expect(getModelContextMessageLimit(200_000)).toBe(184_000)
    // 5_000 - 1_024 (clamped reserve) = 3_976
    expect(getModelContextMessageLimit(5_000)).toBe(3_976)
  })

  it('is always >= 1 even for tiny context windows', () => {
    expect(getModelContextMessageLimit(1)).toBeGreaterThanOrEqual(1)
    expect(getModelContextMessageLimit(0)).toBeGreaterThanOrEqual(1)
  })
})
