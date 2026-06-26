import { describe, expect, it } from 'bun:test'

import {
  buildInfronRequestBody,
  extractUsageAndCost,
  INFRON_MODEL_MAP,
  isInfronModel,
} from '../infron'

import type { ChatCompletionRequestBody } from '../types'

const GLM = 'z-ai/glm-5.2'

describe('isInfronModel', () => {
  it('is dormant: no model routes to Infron yet (behavior-preserving)', () => {
    // INFRON_MODEL_MAP is intentionally empty until a follow-up activates GLM 5.2.
    expect(Object.keys(INFRON_MODEL_MAP)).toHaveLength(0)
    expect(isInfronModel(GLM)).toBe(false)
  })

  it('leaves all models on their existing providers', () => {
    expect(isInfronModel('z-ai/glm-5.1')).toBe(false)
    expect(isInfronModel('minimax/minimax-m3')).toBe(false)
    expect(isInfronModel('deepseek/deepseek-v4-flash')).toBe(false)
  })

  it('routes exactly the models listed in INFRON_MODEL_MAP', () => {
    for (const model of Object.keys(INFRON_MODEL_MAP)) {
      expect(isInfronModel(model)).toBe(true)
    }
  })
})

describe('buildInfronRequestBody', () => {
  const base: ChatCompletionRequestBody = {
    model: GLM,
    messages: [{ role: 'user', content: 'hi' }],
    stream: true,
    transforms: ['middle-out'],
    codebuff_metadata: { run_id: 'r1', cost_mode: 'free' },
  } as unknown as ChatCompletionRequestBody

  it('enables usage reporting (cost in the response)', () => {
    expect(buildInfronRequestBody(base).usage).toEqual({ include: true })
  })

  it('applies the alibaba sg→cn provider pin for GLM 5.2', () => {
    expect(buildInfronRequestBody(base).provider).toEqual({
      order: ['alibaba/sg', 'alibaba/cn'],
    })
  })

  it('strips internal-only fields', () => {
    const out = buildInfronRequestBody(base)
    expect(out.transforms).toBeUndefined()
    expect(out.codebuff_metadata).toBeUndefined()
  })

  it('preserves messages and stream flag', () => {
    const out = buildInfronRequestBody(base)
    expect(out.messages).toEqual(base.messages)
    expect(out.stream).toBe(true)
  })

  it('drops any inbound provider for an unpinned model', () => {
    const out = buildInfronRequestBody(
      { ...base, model: 'some/other-model' } as ChatCompletionRequestBody,
      'some/other-model',
    )
    expect(out.provider).toBeUndefined()
  })
})

describe('extractUsageAndCost', () => {
  // Real Infron response shape: `cost`/`cost_details` at the ROOT (sibling of
  // `usage`), already post-discount. Tokens live inside `usage`.
  const realResponse = {
    cost: 0.000052,
    cost_details: { discount_rate: 0.5, upstream_inference_cost: 0 },
    usage: {
      prompt_tokens: 20,
      completion_tokens: 21,
      completion_tokens_details: { reasoning_tokens: 15 },
      prompt_tokens_details: { cached_tokens: 4 },
    },
  }

  it('reads the post-discount cost from the response root, not usage', () => {
    const out = extractUsageAndCost(realResponse, GLM)
    expect(out.cost).toBe(0.000052)
    expect(out.inputTokens).toBe(20)
    expect(out.outputTokens).toBe(21)
    expect(out.reasoningTokens).toBe(15)
    expect(out.cacheReadInputTokens).toBe(4)
  })

  it('does NOT read cost from usage.cost (OpenRouter shape would mis-bill)', () => {
    // If cost is (wrongly) only inside usage, we must NOT pick it up — there is
    // no root cost here, so we fall back to token math, not 999.
    const out = extractUsageAndCost(
      { usage: { prompt_tokens: 0, completion_tokens: 0, cost: 999 } },
      GLM,
    )
    expect(out.cost).toBe(0)
  })

  it('falls back to list-price token math when root cost is absent', () => {
    const out = extractUsageAndCost(
      { usage: { prompt_tokens: 1000, completion_tokens: 500 } },
      GLM,
    )
    // GLM 5.2 list price: $1.4/M in, $4.4/M out (no cache hits here).
    const expected = (1000 * 1.4 + 500 * 4.4) / 1_000_000
    expect(out.cost).toBeCloseTo(expected, 12)
  })

  it('returns zeros when there is no usage', () => {
    expect(extractUsageAndCost({}, GLM)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      reasoningTokens: 0,
      cost: 0,
    })
  })
})
