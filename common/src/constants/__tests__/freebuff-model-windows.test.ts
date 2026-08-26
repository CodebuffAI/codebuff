import { describe, expect, test } from 'bun:test'

import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
} from '../freebuff-model-ids'
import { getFreebuffModelAvailabilityWindowLabel } from '../freebuff-models'
import { FREEBUFF_GPT_5_6_LUNA_MODEL_ID } from '../freebuff-models'
import { getFreebuffPlanPauseWindowLabel } from '../freebuff-subscriptions'

/**
 * The two DeepSeek rows are time-gated in DIFFERENT ways, and a picker that
 * conflates them tells users the wrong thing:
 *
 *  - Flash is `off_peak_only` — genuinely shut at peak, for everyone.
 *  - Pro is open to everyone at every hour; only a PLAN's sessions pause.
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

  test('Pro is always available, so it carries only the plan-pause window', () => {
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
    ).toBe('Plan paused 5:00 PM – 3:00 AM')
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
