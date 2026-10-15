import { describe, expect, test } from 'bun:test'

import { FREEBUFF_PROJECT_UNDERSTANDING_MODEL_ID } from '../../constants/free-agents'
import {
  FREEBUFF_GPT_6_LUNA_MAX_PRICE,
  FREEBUFF_GPT_6_LUNA_MODEL_ID,
  FREEBUFF_GPT_6_LUNA_UPSTREAM_ORDER,
} from '../../constants/freebuff-models'
import {
  PROJECT_UNDERSTANDING_MODEL_PRICE_PER_MILLION_USD,
  estimateProjectUnderstandingCostUsd,
} from '../agent'

const PRICE = PROJECT_UNDERSTANDING_MODEL_PRICE_PER_MILLION_USD

describe("the project-understanding agent's price card", () => {
  // There is no server-side GPT-6 Luna rate card to pin against: Luna is
  // OpenRouter-only and OpenRouter reports each request's cost itself. So the
  // card is pinned here, once, to OpenAI's published GPT-6 Luna list prices
  // as documented on FREEBUFF_GPT_6_LUNA_UPSTREAM_ORDER (standard
  // $0.10 / $0.010 cached / $0.50 per million; flex exactly half). A repricing
  // moves that comment, this literal and the card together.
  test('is the agent model', () => {
    expect(FREEBUFF_PROJECT_UNDERSTANDING_MODEL_ID).toBe(
      FREEBUFF_GPT_6_LUNA_MODEL_ID,
    )
  })

  test("is GPT-6 Luna's standard-tier list price, term for term", () => {
    expect(PRICE).toEqual({ input: 0.1, cachedInput: 0.01, output: 0.5 })
  })

  test('is an upper bound on the endpoints Luna is routed to first', () => {
    // Flex first, standard behind it: the card is the dearer of the two.
    expect([...FREEBUFF_GPT_6_LUNA_UPSTREAM_ORDER]).toEqual([
      'openai/flex',
      'openai',
    ])
  })

  test("sits under the OpenRouter price ceiling, which must stay above list", () => {
    expect(PRICE.input).toBeLessThan(FREEBUFF_GPT_6_LUNA_MAX_PRICE.prompt)
    expect(PRICE.output).toBeLessThan(FREEBUFF_GPT_6_LUNA_MAX_PRICE.completion)
  })
})

describe('estimateProjectUnderstandingCostUsd', () => {
  test('is zero for no usage', () => {
    expect(
      estimateProjectUnderstandingCostUsd({
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      }),
    ).toBe(0)
  })

  test('prices a million of each term at the card', () => {
    expect(
      estimateProjectUnderstandingCostUsd({
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 0,
      }),
    ).toBeCloseTo(PRICE.input, 12)
    expect(
      estimateProjectUnderstandingCostUsd({
        inputTokens: 1_000_000,
        cachedInputTokens: 1_000_000,
        outputTokens: 0,
      }),
    ).toBeCloseTo(PRICE.cachedInput, 12)
    expect(
      estimateProjectUnderstandingCostUsd({
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 1_000_000,
      }),
    ).toBeCloseTo(PRICE.output, 12)
  })

  test('counts cached tokens as part of input, never on top of it', () => {
    // 40k prompt tokens of which 30k were cache reads: 10k fresh.
    const cost = estimateProjectUnderstandingCostUsd({
      inputTokens: 40_000,
      cachedInputTokens: 30_000,
      outputTokens: 2_000,
    })
    expect(cost).toBeCloseTo(
      (10_000 * PRICE.input +
        30_000 * PRICE.cachedInput +
        2_000 * PRICE.output) /
        1_000_000,
      12,
    )
  })

  test('clamps cached tokens to input, and reads bad counts as zero', () => {
    expect(
      estimateProjectUnderstandingCostUsd({
        inputTokens: 1_000,
        cachedInputTokens: 5_000,
        outputTokens: 0,
      }),
    ).toBeCloseTo((1_000 * PRICE.cachedInput) / 1_000_000, 12)
    expect(
      estimateProjectUnderstandingCostUsd({
        inputTokens: -10,
        cachedInputTokens: Number.NaN,
        outputTokens: Number.POSITIVE_INFINITY,
      }),
    ).toBe(0)
  })
})
