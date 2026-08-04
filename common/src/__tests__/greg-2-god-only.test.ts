/**
 * Greg 2 Ultra / Super are god-only on Freebuff Web, and the reason is cost:
 * Ultra lists at $3.00/$10.00 per M against DeepSeek V4 Flash's $0.14/$0.28,
 * and both carry a ~17,000-token hidden preamble upstream — measured live
 * 2026-08-04, a bare "hi" billed 17,538 prompt tokens and $[redacted] on Ultra
 * against $[redacted] for deepseek-v4-flash-0731. There is no cheap request.
 */
import { describe, expect, it } from 'bun:test'

import {
  FREEBUFF_GREG_2_SUPER_MODEL_ID,
  FREEBUFF_GREG_2_ULTRA_MODEL_ID,
  FREEBUFF_MODELS,
  FREEBUFF_WEB_ALL_MODELS,
  FREEBUFF_WEB_GOD_ONLY_MODELS,
  FREEBUFF_WEB_MODELS,
  FREEBUFF_WEB_PREMIUM_MODEL_IDS,
  FREEBUFF_WEB_STANDARD_MODEL_IDS,
  isFreebuffWebGodOnlyModelId,
  isFreebuffWebModelId,
  SUPPORTED_FREEBUFF_MODELS,
} from '../constants/freebuff-models'

const GREG_IDS = [
  FREEBUFF_GREG_2_ULTRA_MODEL_ID,
  FREEBUFF_GREG_2_SUPER_MODEL_ID,
] as const

describe('Greg 2 is god-only on Freebuff Web', () => {
  it('is offered to god users and nobody else', () => {
    for (const id of GREG_IDS) {
      expect(isFreebuffWebGodOnlyModelId(id)).toBe(true)
      expect(isFreebuffWebModelId(id, { includeGodOnly: true })).toBe(true)
      expect(isFreebuffWebModelId(id, { includeGodOnly: false })).toBe(false)
      expect(FREEBUFF_WEB_GOD_ONLY_MODELS.map((m) => m.id)).toContain(id)
      // The god-only list is additive to the visible one, so it must NOT also
      // appear there or every user would see it.
      expect(FREEBUFF_WEB_MODELS.map((m) => m.id)).not.toContain(id)
    }
  })

  it('stays off every non-web surface', () => {
    // Web only, as asked. FREEBUFF_MODELS is the CLI/Desktop catalog and
    // SUPPORTED_FREEBUFF_MODELS the waiting-room set.
    for (const id of GREG_IDS) {
      expect(FREEBUFF_MODELS.map((m) => m.id)).not.toContain(id)
      expect(SUPPORTED_FREEBUFF_MODELS.map((m) => m.id)).not.toContain(id)
      expect(FREEBUFF_WEB_ALL_MODELS.map((m) => m.id)).toContain(id)
    }
  })

  it('is metered by the premium pool, never the standard one', () => {
    // FREEBUFF_WEB_STANDARD_MODEL_IDS is derived by filtering `!premium`, so a
    // premium row missing from the premium list would be metered by NO pool —
    // the failure this file's HY3 comment warns about, applied to the most
    // expensive models we serve.
    for (const id of GREG_IDS) {
      expect(FREEBUFF_WEB_PREMIUM_MODEL_IDS).toContain(id)
      expect(FREEBUFF_WEB_STANDARD_MODEL_IDS).not.toContain(id)
      const model = FREEBUFF_WEB_GOD_ONLY_MODELS.find((m) => m.id === id)
      expect(model?.premium).toBe(true)
    }
  })

  it('keeps ids distinct from any other catalog row', () => {
    // A second id for an already-offered model is how the retired `crof/glm-5.2`
    // became a quota-bypass route. These must be the only ids that reach Greg.
    const all = FREEBUFF_WEB_ALL_MODELS.map((m) => m.id)
    expect(new Set(all).size).toBe(all.length)
    expect(FREEBUFF_GREG_2_ULTRA_MODEL_ID).not.toBe(
      FREEBUFF_GREG_2_SUPER_MODEL_ID,
    )
  })
})
