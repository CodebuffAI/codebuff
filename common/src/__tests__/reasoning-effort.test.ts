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
  EFFORTS_THROUGH_XHIGH,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID,
  FREEBUFF_PROMPT_EFFORT_MODEL_IDS,
  FREEBUFF_WEB_ALL_MODELS,
  getFreebuffModelDefaultEffort,
  getFreebuffModelEfforts,
  getFreebuffModelReasoningEffort,
  isPromptEffortModelId,
  resolveFreebuffReasoningEffort,
  SUPPORTED_FREEBUFF_MODELS,
} from '../constants/freebuff-models'

describe('the shared effort ladder', () => {
  test('is ordered ascending, because the clamp does index arithmetic on it', () => {
    // clampReasoningEffort answers "the most this model allows, but no more
    // than was asked". That is only meaningful if position implies magnitude,
    // so a reorder here would silently invert every clamp in the product.
    expect(REASONING_EFFORTS).toEqual([
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
  test('no WIRE-steered ladder may top out above what the model already runs at', () => {
    // The rule the feature rests on, stated precisely. For a model whose rung
    // is sent to the provider, the ceiling must not exceed today's default:
    // users may spend less API effort, never more.
    //
    // Prompt-steered models are deliberately exempt, and the exemption is the
    // interesting half. DeepSeek's `high` sits ABOVE its `medium` default on
    // purpose — it asks the model in words to deliberate longer. That costs no
    // API effort because nothing from this ladder reaches the request, which is
    // exactly what isPromptEffortModelId guarantees.
    for (const model of ALL_ROWS) {
      if (!model.efforts?.length) continue
      if (isPromptEffortModelId(model.id)) continue
      const ceiling = model.efforts[model.efforts.length - 1]!
      const dflt = getFreebuffModelDefaultEffort(model.id)!
      expect({
        id: model.id,
        exceedsCeiling:
          reasoningEffortRank(ceiling) > reasoningEffortRank(dflt),
      }).toEqual({ id: model.id, exceedsCeiling: false })
    }
  })

  test('a prompt-steered ladder may exceed its default, but only because it never reaches the wire', () => {
    // Pins the pairing rather than the exemption: a model is allowed a rung
    // above its default ONLY while it is prompt-steered. If DeepSeek ever gains
    // a real effort API and leaves FREEBUFF_PROMPT_EFFORT_MODEL_IDS, the test
    // above starts governing it and this one fails first.
    for (const model of ALL_ROWS) {
      if (!model.efforts?.length) continue
      const ceiling = model.efforts[model.efforts.length - 1]!
      const dflt = getFreebuffModelDefaultEffort(model.id)!
      if (reasoningEffortRank(ceiling) <= reasoningEffortRank(dflt)) continue
      expect({ id: model.id, promptSteered: isPromptEffortModelId(model.id) })
        .toEqual({ id: model.id, promptSteered: true })
    }
  })

  test('every ladder rung is a rung of the shared vocabulary', () => {
    for (const model of ALL_ROWS) {
      for (const effort of model.efforts ?? []) {
        expect(REASONING_EFFORTS).toContain(effort)
      }
    }
  })

  test('Muse Spark goes to xhigh; Luna stops at high', () => {
    expect(getFreebuffModelEfforts(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID)).toEqual(
      EFFORTS_THROUGH_XHIGH,
    )
    expect(getFreebuffModelEfforts(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)).toEqual(
      EFFORTS_THROUGH_HIGH,
    )
    expect(
      resolveFreebuffReasoningEffort(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID, undefined),
    ).toBe('xhigh')
    expect(
      resolveFreebuffReasoningEffort(FREEBUFF_GPT_5_6_LUNA_MODEL_ID, undefined),
    ).toBe('high')
  })

  test("DeepSeek's ladder is prompt-level and leaves its API effort alone", () => {
    for (const id of [
      FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
      FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    ]) {
      // The user-facing default is `medium` — the rung that adds no nudge, so
      // today's request is reproduced byte for byte...
      expect(resolveFreebuffReasoningEffort(id, undefined)).toBe('medium')
      // ...while the API-level value the wire actually carries stays 'high',
      // explicit so a provider-side default change cannot move Freebuff.
      expect(getFreebuffModelReasoningEffort(id)).toBe('high')
      // And the ladder must never reach the request: DeepSeek's adapters
      // collapse anything below `max` to `high`, and CrofAI forwards an unknown
      // rung verbatim and 400s.
      expect(isPromptEffortModelId(id)).toBe(true)
    }
  })

  test('prompt-steered models are exactly the ones that offer a ladder without an API for it', () => {
    for (const id of FREEBUFF_PROMPT_EFFORT_MODEL_IDS) {
      expect(getFreebuffModelEfforts(id)).not.toBeNull()
    }
    // The wire-steered models must NOT be in that list, or their chosen effort
    // would never reach the provider that can act on it.
    expect(isPromptEffortModelId(FREEBUFF_MUSE_SPARK_12_CONTRIBUTOR_MODEL_ID)).toBe(false)
    expect(isPromptEffortModelId(FREEBUFF_GPT_5_6_LUNA_MODEL_ID)).toBe(false)
  })

  test('models without a ladder are untouched', () => {
    // Opt-in by construction: every other row keeps exactly today's behavior
    // and shows no control.
    expect(getFreebuffModelEfforts(FREEBUFF_MINIMAX_M3_MODEL_ID)).toBeNull()
    expect(resolveFreebuffReasoningEffort(FREEBUFF_MINIMAX_M3_MODEL_ID, 'low')).toBeNull()
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
