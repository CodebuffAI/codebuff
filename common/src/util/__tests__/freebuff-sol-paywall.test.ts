import { describe, expect, it } from 'bun:test'

import {
  GEMINI_4_ARGON_MODEL_ID,
  GPT_61_SOL_MODEL_ID,
} from '../../constants/freebuff-sol-promo'
import {
  FREEBUFF_PRO_ONLY_CATALOG_MODEL_IDS,
  FREEBUFF_US_OR_PAID_MODEL_IDS,
} from '../../constants/freebuff-models'
import { freebuffPlanRequired } from '../freebuff-model-selection'

/**
 * GPT-6.1 Sol's and Gemini 4 Argon's paywall as every picker draws it
 * (Desktop, CLI, Web, mobile all call `freebuffPlanRequired`): the server
 * ships a per-viewer verdict, which leaves both out for a US viewer and in for
 * everyone else.
 */
for (const [name, modelId] of [
  ['GPT-6.1 Sol', GPT_61_SOL_MODEL_ID],
  ['Gemini 4 Argon', GEMINI_4_ARGON_MODEL_ID],
] as const) {
  describe(`the ${name} lock`, () => {
    const nonUsVerdict = {
      planRequiredModelIds: [...FREEBUFF_PRO_ONLY_CATALOG_MODEL_IDS],
    }
    const usVerdict = {
      planRequiredModelIds: FREEBUFF_PRO_ONLY_CATALOG_MODEL_IDS.filter(
        (id) => !FREEBUFF_US_OR_PAID_MODEL_IDS.includes(id),
      ),
    }

    it('is paid-only in the catalog, with the US as its one exemption', () => {
      expect(FREEBUFF_PRO_ONLY_CATALOG_MODEL_IDS).toContain(modelId)
      expect(FREEBUFF_US_OR_PAID_MODEL_IDS).toEqual([
        GPT_61_SOL_MODEL_ID,
        GEMINI_4_ARGON_MODEL_ID,
      ])
    })

    it('opens for a planless US viewer and locks for everyone else', () => {
      expect(freebuffPlanRequired(modelId, false, usVerdict)).toBe(false)
      expect(freebuffPlanRequired(modelId, false, nonUsVerdict)).toBe(true)
    })

    it('locks when the client has no verdict (fails closed) and opens on a plan', () => {
      expect(freebuffPlanRequired(modelId, false, null)).toBe(true)
      expect(freebuffPlanRequired(modelId, true, nonUsVerdict)).toBe(false)
    })

    it('keeps Gemini 3.8 Flash paid-only for the US too', () => {
      const gemini = 'google/gemini-3.8-flash'
      expect(freebuffPlanRequired(gemini, false, usVerdict)).toBe(true)
      expect(freebuffPlanRequired(gemini, true, usVerdict)).toBe(false)
    })

    it('draws Muse Spark 1.3 open for a planless full-access viewer', () => {
      const muse = 'meta/muse-spark-1.3-contributor'
      expect(freebuffPlanRequired(muse, false, nonUsVerdict)).toBe(false)
      expect(freebuffPlanRequired(muse, false, null, 'full')).toBe(false)
      expect(freebuffPlanRequired(muse, false, null, 'limited')).toBe(true)
    })
  })
}
