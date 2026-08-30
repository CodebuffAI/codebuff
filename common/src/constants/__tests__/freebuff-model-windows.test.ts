import { describe, expect, test } from 'bun:test'

import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
} from '../freebuff-model-ids'
import {
  getFreebuffModelAvailabilityWindowLabel,
  isFreebuffPausedFreeModelId,
} from '../freebuff-models'
import { FREEBUFF_GPT_5_6_LUNA_MODEL_ID } from '../freebuff-models'
import { getFreebuffPlanPauseWindowLabel } from '../freebuff-subscriptions'

/**
 * Time-gating comes in two kinds and a picker that conflates them tells users
 * the wrong thing:
 *
 *  - `off_peak_only` — genuinely shut at peak, for everyone.
 *  - A PLAN pause — the row is open to all, only a subscriber's plan sessions
 *    stop being spent on it.
 *
 * V4 Pro carried the second kind until it was WITHDRAWN on 2026-08-26, which
 * leaves a third case this file pins: a row that is open at no hour at all must
 * advertise neither label. A withdrawn model quoting opening hours is the worst
 * of the three — it tells a user to come back for something that is never
 * coming back.
 *
 * As of 2026-08-28 NO model carries either time gate: Flash's peak closure was
 * removed when the traffic it displaced onto Luna turned out to cost more than
 * the peak card it avoided, and Pro is withdrawn. So the cases below are now
 * pinned by their SILENCE. That is the property worth keeping — a label is only
 * ever correct when it matches a restriction that actually exists, and the
 * failure this guards against is a stale window surviving the rule that
 * justified it.
 *
 * Pinned to a fixed instant and zone so the strings are deterministic — which
 * is also what makes the zone SUFFIX deterministic, since it is derived from
 * that zone on that date (PDT, not PST).
 */
describe('model availability windows', () => {
  const now = new Date('2026-08-26T20:00:00Z')
  const TZ = 'America/Los_Angeles'

  test('Flash, reopened at all hours, advertises no window at all', () => {
    // Read 'Open 3:00 AM – 5:00 PM PDT' until 2026-08-28, when the peak closure
    // was removed. A row open at every hour must say nothing: an opening-hours
    // label on an always-open model is a restriction the user will plan around
    // and that does not exist.
    expect(
      getFreebuffModelAvailabilityWindowLabel(
        FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
        now,
        { timeZone: TZ },
      ),
    ).toBeUndefined()
  })

  test('Flash needs no plan-pause line either', () => {
    // Undefined before and after, but for the opposite reason: it used to be
    // silent because the row was already shut at peak, and is now silent
    // because nothing pauses it at all.
    expect(
      getFreebuffPlanPauseWindowLabel(
        FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
        now,
        TZ,
      ),
    ).toBeUndefined()
  })

  test('a WITHDRAWN row advertises no hours of either kind', () => {
    // V4 Pro read 'Plan paused 5:00 PM – 3:00 AM' until 2026-08-26. Withdrawing
    // it removed it from FREEBUFF_SUBSCRIPTION_PEAK_PAUSED_MODEL_IDS, and both
    // labels must now be silent: the row cannot be admitted at any hour, so any
    // window it named would be a promise nothing can keep.
    expect(isFreebuffPausedFreeModelId(FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID)).toBe(
      true,
    )
    expect(
      getFreebuffModelAvailabilityWindowLabel(
        FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
        now,
        { timeZone: TZ },
      ),
    ).toBeUndefined()
    expect(
      getFreebuffPlanPauseWindowLabel(
        FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
        now,
        TZ,
      ),
    ).toBeUndefined()
  })

  test('a model with no time restriction says nothing at all', () => {
    expect(
      getFreebuffModelAvailabilityWindowLabel(
        FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
        now,
        { timeZone: TZ },
      ),
    ).toBeUndefined()
    expect(
      getFreebuffPlanPauseWindowLabel(FREEBUFF_GPT_5_6_LUNA_MODEL_ID, now, TZ),
    ).toBeUndefined()
  })
})
