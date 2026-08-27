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
 *  - `off_peak_only` — genuinely shut at peak, for everyone (Flash).
 *  - A PLAN pause — the row is open to all, only a subscriber's plan sessions
 *    stop being spent on it.
 *
 * V4 Pro carried the second kind until it was WITHDRAWN on 2026-08-26, which
 * leaves a third case this file now pins: a row that is open at no hour at all
 * must advertise neither label. A withdrawn model quoting opening hours is the
 * worst of the three — it tells a user to come back for something that is never
 * coming back.
 *
 * Pinned to a fixed instant and zone so the strings are deterministic.
 */
describe('model availability windows', () => {
  const now = new Date('2026-08-26T20:00:00Z')
  const TZ = 'America/Los_Angeles'

  test('Flash advertises when it is OPEN, not when it is shut', () => {
    expect(
      getFreebuffModelAvailabilityWindowLabel(
        FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
        now,
        { timeZone: TZ },
      ),
    ).toBe('Open 3:00 AM – 5:00 PM')
  })

  test('Flash needs no plan-pause line: it is already closed at peak', () => {
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
