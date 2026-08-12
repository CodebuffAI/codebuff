import { describe, expect, test } from 'bun:test'

import type { FreebuffModelOption } from '../constants/freebuff-models'
import {
  clampReasoningEffort,
  reasoningEffortRank,
  REASONING_EFFORTS,
  type ReasoningEffort,
} from '../constants/reasoning-effort'
import {
  EFFORTS_THROUGH_HIGH,
  EFFORTS_THROUGH_MAX,
  EFFORTS_THROUGH_XHIGH,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_FABLE_5_MODEL_ID,
  FREEBUFF_GLM_V52_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  FREEBUFF_KIMI_K3_ECO_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
  FREEBUFF_WEB_ALL_MODELS,
  getFreebuffModelDefaultEffort,
  getFreebuffModelEfforts,
  getFreebuffModelReasoningEffort,
  resolveFreebuffReasoningEffort,
  SUPPORTED_FREEBUFF_MODELS,
} from '../constants/freebuff-models'

describe('the shared effort ladder', () => {
  test('is ordered ascending, because the clamp does index arithmetic on it', () => {
    // clampReasoningEffort answers "the most this model allows, but no more
    // than was asked". That is only meaningful if position implies magnitude,
    // so a reorder here would silently invert every clamp in the product.
    expect(REASONING_EFFORTS).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
      'ultra',
    ])
    expect(reasoningEffortRank('low')).toBeLessThan(reasoningEffortRank('high'))
    expect(reasoningEffortRank('high')).toBeLessThan(
      reasoningEffortRank('xhigh'),
    )
  })

  test('clamps DOWN to the ceiling rather than falling back to a default', () => {
    // The distinction that matters on a reroute: a user on xhigh whose request
    // lands on a model topping out at high should get high — the closest thing
    // to what they chose — not that model's default, which could be lower.
    expect(clampReasoningEffort('xhigh', EFFORTS_THROUGH_HIGH, 'low')).toBe(
      'high',
    )
    expect(clampReasoningEffort('ultra', EFFORTS_THROUGH_XHIGH, 'low')).toBe(
      'xhigh',
    )
    // Exactly on a rung is that rung.
    expect(clampReasoningEffort('medium', EFFORTS_THROUGH_HIGH, 'high')).toBe(
      'medium',
    )
    // Nothing recognizable asked for: the caller's fallback, not a guess.
    expect(clampReasoningEffort(undefined, EFFORTS_THROUGH_HIGH, 'high')).toBe(
      'high',
    )
    expect(clampReasoningEffort('bogus', EFFORTS_THROUGH_HIGH, 'high')).toBe(
      'high',
    )
    // Below everything on offer: the least of them, never nothing.
    expect(clampReasoningEffort('low', ['high', 'xhigh'], 'xhigh')).toBe('high')
  })
})

// `as const satisfies FreebuffModelOption` gives each row a narrow literal
// type, so the union has no `efforts` property at all unless every member
// declares one. Widening once here keeps the invariants readable.
const ALL_ROWS: readonly FreebuffModelOption[] = [
  ...SUPPORTED_FREEBUFF_MODELS,
  ...FREEBUFF_WEB_ALL_MODELS,
]

describe('per-model effort ladders', () => {
  test('every ladder contains its default', () => {
    for (const model of ALL_ROWS) {
      if (!model.efforts?.length) continue
      const dflt = getFreebuffModelDefaultEffort(model.id)!
      expect({
        id: model.id,
        containsDefault: model.efforts.includes(dflt),
      }).toEqual({ id: model.id, containsDefault: true })
    }
  })

  test('every ladder rung is a rung of the shared vocabulary', () => {
    for (const model of ALL_ROWS) {
      for (const effort of model.efforts ?? []) {
        expect(REASONING_EFFORTS).toContain(effort)
      }
    }
  })

  test('Muse Spark and Luna expose their complete native ladders', () => {
    expect(getFreebuffModelEfforts(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID)).toEqual(
      EFFORTS_THROUGH_XHIGH,
    )
    expect(getFreebuffModelEfforts(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)).toEqual(
      EFFORTS_THROUGH_MAX,
    )
    expect(
      resolveFreebuffReasoningEffort(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID, undefined),
    ).toBe('xhigh')
    expect(
      resolveFreebuffReasoningEffort(FREEBUFF_GPT_5_6_LUNA_MODEL_ID, undefined),
    ).toBe('high')
  })

  test('Claude Fable 5 exposes every enabled effort', () => {
    expect(getFreebuffModelEfforts(FREEBUFF_FABLE_5_MODEL_ID)).toEqual(
      EFFORTS_THROUGH_MAX,
    )
    expect(getFreebuffModelDefaultEffort(FREEBUFF_FABLE_5_MODEL_ID)).toBe(
      'high',
    )
  })

  test('DeepSeek exposes the three native V4 efforts on both models', () => {
    // One ladder since the Pro 08/13 GA build: DeepSeek documents the same
    // requested→actual mapping for flash and pro, and low is a real template on
    // both. Medium is not, on either, so it must not appear as a rung.
    for (const id of [
      FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    ]) {
      expect(getFreebuffModelEfforts(id)).toEqual(['low', 'high', 'max'])
      expect(resolveFreebuffReasoningEffort(id, undefined)).toBe('high')
      expect(getFreebuffModelReasoningEffort(id)).toBe('high')
      expect(resolveFreebuffReasoningEffort(id, 'medium')).toBe('high')
      expect(resolveFreebuffReasoningEffort(id, 'max')).toBe('max')
      expect(resolveFreebuffReasoningEffort(id, 'low')).toBe('low')
    }
  })

  test('binary, adaptive, and ignored controls do not masquerade as ladders', () => {
    for (const id of [
      FREEBUFF_MINIMAX_M3_MODEL_ID,
      FREEBUFF_MIMO_V25_MODEL_ID,
      FREEBUFF_GLM_V52_MODEL_ID,
      FREEBUFF_KIMI_K3_ECO_MODEL_ID,
    ]) {
      expect(getFreebuffModelEfforts(id)).toBeNull()
      expect(resolveFreebuffReasoningEffort(id, 'low')).toBeNull()
    }
    expect(resolveFreebuffReasoningEffort('some/unknown-model', 'high')).toBeNull()
  })

  test('a dated provider snapshot resolves like the undated id', () => {
    expect(
      resolveFreebuffReasoningEffort(
        `${FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID}-20260901`,
        'low',
      ),
    ).toBe('low')
  })
})
