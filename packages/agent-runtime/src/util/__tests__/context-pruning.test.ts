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
  getEffectiveContextLimits,
  getSemanticCompactionBudget,
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
    expect(getModelContextReservedTokens(100_000)).toBe(12_000)
    expect(getModelContextReservedTokens(200_000)).toBe(24_000)
    expect(getModelContextReservedTokens(1_000_000)).toBe(120_000)
    expect(getModelContextReservedTokens(5_000)).toBe(2_500)
    expect(getModelContextReservedTokens(2_000_000)).toBe(128_000)
  })

  it('honors the reserved fraction constant', () => {
    expect(MODEL_CONTEXT_RESERVED_FRACTION).toBe(0.12)
    expect(MODEL_CONTEXT_MIN_RESERVED_TOKENS).toBe(8_000)
    expect(MODEL_CONTEXT_MAX_RESERVED_TOKENS).toBe(128_000)
  })
})

describe('getModelContextMessageLimit (M4 unified threshold convergence)', () => {
  it('returns DEFAULT_MAX_CONTEXT_TOKENS when model window is unknown', () => {
    expect(getModelContextMessageLimit(undefined)).toBe(
      DEFAULT_MAX_CONTEXT_TOKENS,
    )
  })

  it('subtracts the reserved overhead from the model context window', () => {
    expect(getModelContextMessageLimit(100_000)).toBe(88_000)
    expect(getModelContextMessageLimit(200_000)).toBe(176_000)
    expect(getModelContextMessageLimit(262_144)).toBe(230_687)
    expect(getModelContextMessageLimit(500_000)).toBe(440_000)
    expect(getModelContextMessageLimit(1_000_000)).toBe(880_000)
    expect(getModelContextMessageLimit(5_000)).toBe(2_500)
  })

  it('is always >= 1 even for tiny context windows', () => {
    expect(getModelContextMessageLimit(1)).toBeGreaterThanOrEqual(1)
    expect(getModelContextMessageLimit(0)).toBeGreaterThanOrEqual(1)
  })
})

describe('getSemanticCompactionBudget', () => {
  it.each([
    [8_000, 2_000, 1_680, 2_000],
    [16_000, 6_000, 3_360, 2_000],
    [32_000, 18_000, 10_080, 6_000],
    [64_000, 42_000, 23_520, 14_000],
  ])(
    'keeps a meaningful working set for a small %i-token window',
    (window, trigger, target, headroom) => {
      expect(getSemanticCompactionBudget(window)).toEqual({
        resolvedContextWindowTokens: window,
        triggerBudgetTokens: trigger,
        targetBudgetTokens: target,
        headroomTokens: headroom,
      })
      expect(trigger).toBeGreaterThan(1)
      expect(target).toBeGreaterThan(1)
      expect(target).toBeLessThan(trigger)
    },
  )

  it.each([
    [128_000, 96_000, 72_000, 32_000],
    [200_000, 160_000, 84_000, 32_000],
    [262_144, 209_715, 110_100, 39_321],
    [500_000, 400_000, 210_000, 75_000],
    [1_000_000, 800_000, 420_000, 150_000],
  ])(
    'scales trigger and target budgets for a %i-token window',
    (window, trigger, target, headroom) => {
      expect(getSemanticCompactionBudget(window)).toEqual({
        resolvedContextWindowTokens: window,
        triggerBudgetTokens: trigger,
        targetBudgetTokens: target,
        headroomTokens: headroom,
      })
    },
  )

  it('uses conservative deterministic budgets when the window is unknown or invalid', () => {
    expect(getSemanticCompactionBudget(undefined)).toEqual({
      triggerBudgetTokens: 140_000,
      targetBudgetTokens: 100_000,
    })
    expect(getSemanticCompactionBudget(Number.NaN)).toEqual({
      triggerBudgetTokens: 140_000,
      targetBudgetTokens: 100_000,
    })
  })
})

describe('getEffectiveContextLimits', () => {
  it('recomputes provider-safe and status limits when failover changes windows', () => {
    expect(getEffectiveContextLimits(1_000_000)).toEqual({
      providerSafeMessageLimit: 880_000,
      statusWindowTokens: 1_000_000,
    })
    expect(getEffectiveContextLimits(32_000)).toEqual({
      providerSafeMessageLimit: 24_000,
      statusWindowTokens: 32_000,
    })
  })

  it('clamps explicit overrides to the active model instead of widening it', () => {
    expect(getEffectiveContextLimits(32_000, 100_000)).toEqual({
      providerSafeMessageLimit: 24_000,
      statusWindowTokens: 32_000,
    })
    expect(getEffectiveContextLimits(1_000_000, 50_000)).toEqual({
      providerSafeMessageLimit: 50_000,
      statusWindowTokens: 50_000,
    })
  })
})
