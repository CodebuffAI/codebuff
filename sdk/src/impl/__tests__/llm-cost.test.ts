import { describe, expect, test } from 'bun:test'

import { computeCostCentsFromUsage } from '../llm'
import type { ModelPricing, UsageTokenCounts } from '../llm'

describe('computeCostCentsFromUsage', () => {
  test('computes cost from input + output rates', () => {
    const pricing: ModelPricing = {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
    }
    const usage: UsageTokenCounts = {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    }
    // input: 1M * $3/M = $3.00 ; output: 500K * $15/M = $7.50 ; total $10.50 = 1050 cents
    expect(computeCostCentsFromUsage({ usage, pricing })).toBe(1050)
  })

  test('returns undefined when pricing is undefined', () => {
    const usage: UsageTokenCounts = {
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    }
    expect(
      computeCostCentsFromUsage({ usage, pricing: undefined }),
    ).toBeUndefined()
  })

  test('returns undefined when pricing has neither input nor output rate', () => {
    const pricing: ModelPricing = {
      cachedInputPerMillionTokens: 0.3,
    }
    const usage: UsageTokenCounts = { inputTokens: 1_000_000, outputTokens: 0 }
    expect(computeCostCentsFromUsage({ usage, pricing })).toBeUndefined()
  })

  test('uses cachedInputPerMillionTokens for cached input portion', () => {
    const pricing: ModelPricing = {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
      cachedInputPerMillionTokens: 0.3,
    }
    const usage: UsageTokenCounts = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedInputTokens: 800_000,
    }
    // chargeableInput = 1M - 800K = 200K @ $3/M = $0.60
    // cachedInput        = 800K         @ $0.30/M = $0.24
    // total = $0.84 = 84 cents
    expect(computeCostCentsFromUsage({ usage, pricing })).toBe(84)
  })

  test('falls back to input rate for cached tokens when cached rate is absent', () => {
    const pricing: ModelPricing = {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
    }
    const usage: UsageTokenCounts = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cachedInputTokens: 800_000,
    }
    // no cached rate: all 1M input charged at $3/M = $3.00 = 300 cents
    expect(computeCostCentsFromUsage({ usage, pricing })).toBe(300)
  })

  test('returns 0 for zero usage', () => {
    const pricing: ModelPricing = {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
    }
    const usage: UsageTokenCounts = { inputTokens: 0, outputTokens: 0 }
    expect(computeCostCentsFromUsage({ usage, pricing })).toBe(0)
  })

  test('returns 0 when usage token counts are missing', () => {
    const pricing: ModelPricing = {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
    }
    const usage: UsageTokenCounts = {}
    expect(computeCostCentsFromUsage({ usage, pricing })).toBe(0)
  })

  test('treats negative / non-finite token counts as zero', () => {
    const pricing: ModelPricing = {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
    }
    const usage: UsageTokenCounts = {
      inputTokens: -100,
      outputTokens: Number.NaN,
      cachedInputTokens: Number.POSITIVE_INFINITY,
    }
    expect(computeCostCentsFromUsage({ usage, pricing })).toBe(0)
  })

  test('handles input-only pricing (no output rate)', () => {
    const pricing: ModelPricing = {
      inputPerMillionTokens: 3,
    }
    const usage: UsageTokenCounts = {
      inputTokens: 500_000,
      outputTokens: 200_000,
    }
    // input: 500K * $3/M = $1.50 ; output rate absent => 0 ; total 150 cents
    expect(computeCostCentsFromUsage({ usage, pricing })).toBe(150)
  })

  test('handles output-only pricing (no input rate)', () => {
    const pricing: ModelPricing = {
      outputPerMillionTokens: 15,
    }
    const usage: UsageTokenCounts = {
      inputTokens: 500_000,
      outputTokens: 200_000,
    }
    // output: 200K * $15/M = $3.00 ; input rate absent => 0 ; total 300 cents
    expect(computeCostCentsFromUsage({ usage, pricing })).toBe(300)
  })

  test('rounds to whole cents', () => {
    const pricing: ModelPricing = {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
    }
    const usage: UsageTokenCounts = {
      inputTokens: 1,
      outputTokens: 1,
    }
    // input: 1 * $3/M = $0.000003 ; output: 1 * $15/M = $0.000015
    // total = $0.000018 = 0.0018 cents -> rounds to 0
    expect(computeCostCentsFromUsage({ usage, pricing })).toBe(0)
  })

  test('does not let cached tokens exceed raw input tokens', () => {
    const pricing: ModelPricing = {
      inputPerMillionTokens: 3,
      outputPerMillionTokens: 15,
      cachedInputPerMillionTokens: 0.3,
    }
    // cachedInputTokens > inputTokens (malformed); chargeableInput clamped to 0
    const usage: UsageTokenCounts = {
      inputTokens: 100_000,
      outputTokens: 0,
      cachedInputTokens: 200_000,
    }
    // chargeableInput = max(0, 100K - 200K) = 0 ; cachedInput clamped to safe 200K @ $0.30/M = $0.06 = 6 cents
    expect(computeCostCentsFromUsage({ usage, pricing })).toBe(6)
  })
})
