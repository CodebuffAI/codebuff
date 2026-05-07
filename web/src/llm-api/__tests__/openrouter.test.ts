import { describe, expect, it } from 'bun:test'

import { extractUsageAndCost } from '../openrouter'

describe('extractUsageAndCost', () => {
  describe('OpenRouter response shapes', () => {
    it('Anthropic shape: both cost and upstream_inference_cost populated with the SAME value (NOT additive)', () => {
      // This is the shape that caused the 2x overcharge bug on every Anthropic call.
      // The two fields report the same dollars via different routes (OR-billed-us
      // and what-upstream-charged-us). Summing them doubles the bill.
      const usage = {
        prompt_tokens: 91437,
        completion_tokens: 1209,
        prompt_tokens_details: { cached_tokens: 87047 },
        completion_tokens_details: { reasoning_tokens: 0 },
        cost: 0.1171,
        cost_details: { upstream_inference_cost: 0.1171 },
      }
      const result = extractUsageAndCost(usage)
      expect(result.cost).toBeCloseTo(0.1171, 6)
      expect(result.cost).not.toBeCloseTo(0.2342, 6) // the old, buggy sum
      expect(result.inputTokens).toBe(91437)
      expect(result.outputTokens).toBe(1209)
      expect(result.cacheReadInputTokens).toBe(87047)
    })

    it('Google shape: cost=0, upstream_inference_cost holds the real charge', () => {
      const usage = {
        prompt_tokens: 500,
        completion_tokens: 200,
        prompt_tokens_details: { cached_tokens: 0 },
        completion_tokens_details: { reasoning_tokens: 0 },
        cost: 0,
        cost_details: { upstream_inference_cost: 0.000547 },
      }
      const result = extractUsageAndCost(usage)
      expect(result.cost).toBeCloseTo(0.000547, 9)
    })

    it('Legacy shape: cost populated, cost_details missing', () => {
      const usage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        cost: 0.042,
      }
      const result = extractUsageAndCost(usage)
      expect(result.cost).toBeCloseTo(0.042, 6)
    })

    it('Legacy shape: cost populated, cost_details present but upstream_inference_cost absent', () => {
      const usage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        cost: 0.042,
        cost_details: {},
      }
      const result = extractUsageAndCost(usage)
      expect(result.cost).toBeCloseTo(0.042, 6)
    })

    it('Legacy shape: cost populated, upstream_inference_cost null', () => {
      const usage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        cost: 0.042,
        cost_details: { upstream_inference_cost: null },
      }
      const result = extractUsageAndCost(usage)
      expect(result.cost).toBeCloseTo(0.042, 6)
    })

    it('Anthropic shape with slight rounding drift: picks the larger of the two', () => {
      // Defensive: if the two fields ever diverge due to OR-side rounding,
      // using max avoids under-reporting our spend.
      const usage = {
        prompt_tokens: 1000,
        completion_tokens: 100,
        cost: 0.005,
        cost_details: { upstream_inference_cost: 0.0051 },
      }
      const result = extractUsageAndCost(usage)
      expect(result.cost).toBeCloseTo(0.0051, 6)
    })

    it('both cost and upstream missing: returns 0', () => {
      const usage = {
        prompt_tokens: 100,
        completion_tokens: 50,
      }
      const result = extractUsageAndCost(usage)
      expect(result.cost).toBe(0)
    })

    it('entire usage object undefined: returns zeros', () => {
      const result = extractUsageAndCost(undefined)
      expect(result.cost).toBe(0)
      expect(result.inputTokens).toBe(0)
      expect(result.outputTokens).toBe(0)
      expect(result.cacheReadInputTokens).toBe(0)
      expect(result.reasoningTokens).toBe(0)
    })

    it('entire usage object null: returns zeros', () => {
      const result = extractUsageAndCost(null)
      expect(result.cost).toBe(0)
    })

    it('cost is non-number (string): treated as 0', () => {
      const usage = {
        cost: '0.042' as unknown as number,
        cost_details: { upstream_inference_cost: 0.01 },
      }
      const result = extractUsageAndCost(usage)
      expect(result.cost).toBeCloseTo(0.01, 6)
    })
  })

  describe('token extraction', () => {
    it('extracts all token counts correctly', () => {
      const usage = {
        prompt_tokens: 1000,
        completion_tokens: 500,
        prompt_tokens_details: { cached_tokens: 900 },
        completion_tokens_details: { reasoning_tokens: 200 },
        cost: 0.01,
      }
      const result = extractUsageAndCost(usage)
      expect(result.inputTokens).toBe(1000)
      expect(result.outputTokens).toBe(500)
      expect(result.cacheReadInputTokens).toBe(900)
      expect(result.reasoningTokens).toBe(200)
    })

    it('missing nested token detail objects default to 0', () => {
      const usage = {
        prompt_tokens: 100,
        completion_tokens: 50,
        cost: 0.001,
      }
      const result = extractUsageAndCost(usage)
      expect(result.cacheReadInputTokens).toBe(0)
      expect(result.reasoningTokens).toBe(0)
    })
  })

  describe('regression: the exact bug from prod logs', () => {
    // Pulled from debug/web.jsonl `openrouter-cost-audit` entries.
    // Every one of these was billed at 2x the real price before the fix.
    it.each([
      { cost: 0.1155, expected: 0.1155 },
      { cost: 0.0534, expected: 0.0534 },
      { cost: 0.0584, expected: 0.0584 },
      { cost: 0.1171, expected: 0.1171 },
    ])('bills $expected (not 2x) when cost === upstream === $cost', ({ cost, expected }) => {
      const usage = {
        prompt_tokens: 100000,
        completion_tokens: 500,
        prompt_tokens_details: { cached_tokens: 95000 },
        cost,
        cost_details: { upstream_inference_cost: cost },
      }
      const result = extractUsageAndCost(usage)
      expect(result.cost).toBeCloseTo(expected, 6)
    })
  })
})
