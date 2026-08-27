import { describe, expect, test } from 'bun:test'

import {
  FREEBUFF_WEB_LIMITED_MODEL_IDS,
  isFreebuffSessionModelAllowedForAccessTier,
} from '../freebuff-models'
import { FREEBUFF_SUBSCRIPTION_MODEL_IDS } from '../freebuff-subscriptions'

/**
 * A limited-region account is held to a catalog that contains NONE of the
 * models a plan meters. Before this, a subscriber there paid and received
 * nothing at all — every plan model failed admission with
 * session_model_mismatch.
 */
describe('paid plans at limited access', () => {
  test('the limited catalog still excludes every plan model when unpaid', () => {
    for (const model of FREEBUFF_SUBSCRIPTION_MODEL_IDS) {
      expect(FREEBUFF_WEB_LIMITED_MODEL_IDS).not.toContain(model)
      expect(isFreebuffSessionModelAllowedForAccessTier(model, 'limited')).toBe(
        false,
      )
    }
  })

  test('a paid plan unlocks exactly the models it meters', () => {
    for (const model of FREEBUFF_SUBSCRIPTION_MODEL_IDS) {
      expect(
        isFreebuffSessionModelAllowedForAccessTier(model, 'limited', true),
      ).toBe(true)
    }
  })

  test('paying does not unlock anything the plan does not cover', () => {
    // The god-only bait ids are the case that matters: a plan must never be a
    // way into a model nobody sells.
    expect(
      isFreebuffSessionModelAllowedForAccessTier(
        'openai/gpt-5.6-luna-es',
        'limited',
        true,
      ),
    ).toBe(false)
  })

  test('full access is unaffected by the flag either way', () => {
    for (const paid of [false, true]) {
      expect(
        isFreebuffSessionModelAllowedForAccessTier(
          FREEBUFF_SUBSCRIPTION_MODEL_IDS[0]!,
          'full',
          paid,
        ),
      ).toBe(true)
    }
  })

  test('the duplicated plan-model list has not drifted from the catalog', () => {
    // freebuff-models.ts cannot import freebuff-subscriptions.ts (that module
    // imports it), so the plan ids are duplicated there. This is the guard.
    for (const model of FREEBUFF_SUBSCRIPTION_MODEL_IDS) {
      expect(
        isFreebuffSessionModelAllowedForAccessTier(model, 'limited', true),
      ).toBe(true)
    }
    expect(FREEBUFF_SUBSCRIPTION_MODEL_IDS).toHaveLength(4)
  })
})
