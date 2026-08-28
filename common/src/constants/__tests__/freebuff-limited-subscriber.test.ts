import { describe, expect, test } from 'bun:test'

import {
  FREEBUFF_WEB_LIMITED_MODEL_IDS,
  LIMITED_FREEBUFF_MODEL_ID,
  getFreebuffModelsForAccessTier,
  isFreebuffSessionModelAllowedForAccessTier,
  isFreebuffWebModelAllowedForLimitedTier,
  resolveFreebuffSessionModelForAccessTier,
  resolveFreebuffWebModelForLimitedTier,
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

/**
 * Allowing a model and RESOLVING it are separate questions, and the second one
 * is what the first shipped without.
 *
 * Admission resolves the pick before it binds a session row, so with the flag
 * missing here a limited subscriber's Luna pick was rewritten to MiMo, the row
 * was bound to MiMo, and the chat gate's own substitution then ran the turn as
 * MiMo — against a request that the widened `isFreebuff...AllowedForAccessTier`
 * had just approved. Nothing refused, nothing logged, and the user watched the
 * model they had paid for answer as the free one.
 */
describe('a plan model survives resolution, not just the allowlist', () => {
  test('unpaid limited access still coerces every plan model to MiMo', () => {
    for (const model of FREEBUFF_SUBSCRIPTION_MODEL_IDS) {
      expect(
        resolveFreebuffSessionModelForAccessTier(model, 'limited'),
      ).toBe(LIMITED_FREEBUFF_MODEL_ID)
    }
  })

  test('a paid plan keeps the pick intact', () => {
    for (const model of FREEBUFF_SUBSCRIPTION_MODEL_IDS) {
      expect(
        resolveFreebuffSessionModelForAccessTier(model, 'limited', {
          hasPaidSubscription: true,
        }),
      ).toBe(model)
    }
  })

  test('the Web picker offers and keeps plan rows for a subscriber', () => {
    for (const model of FREEBUFF_SUBSCRIPTION_MODEL_IDS) {
      // The picker's own allowlist — the one whose coercion effect reset a
      // subscriber's selection back to MiMo on the next render.
      expect(isFreebuffWebModelAllowedForLimitedTier(model)).toBe(false)
      expect(isFreebuffWebModelAllowedForLimitedTier(model, true)).toBe(true)
      expect(resolveFreebuffWebModelForLimitedTier(model, true)).toBe(model)
      expect(resolveFreebuffWebModelForLimitedTier(model)).toBe(
        LIMITED_FREEBUFF_MODEL_ID,
      )
    }
  })

  test('the CLI/Desktop tier catalog gains the plan rows and keeps the free ones', () => {
    const free = getFreebuffModelsForAccessTier('limited').map((m) => m.id)
    const paid = getFreebuffModelsForAccessTier('limited', true).map(
      (m) => m.id,
    )
    // The free limited rows are untouched: a plan TOPS UP the free pools, so
    // what the account can still run for free has to stay on offer.
    for (const id of free) expect(paid).toContain(id)
    expect(paid.slice(0, free.length)).toEqual(free)
    // And it gained at least one row it could not pick before.
    expect(paid.length).toBeGreaterThan(free.length)
    for (const id of paid) {
      expect(isFreebuffSessionModelAllowedForAccessTier(id, 'limited', true)).toBe(
        true,
      )
    }
  })

  test('full access is untouched by the widened catalog', () => {
    expect(getFreebuffModelsForAccessTier('full', true).map((m) => m.id)).toEqual(
      getFreebuffModelsForAccessTier('full').map((m) => m.id),
    )
  })
})
