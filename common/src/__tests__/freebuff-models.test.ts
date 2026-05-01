import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_FREEBUFF_MODEL_ID,
  FREEBUFF_GLM_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_MODELS,
  SUPPORTED_FREEBUFF_MODELS,
  getFreebuffDeploymentAvailabilityLabel,
  isFreebuffDeploymentHours,
  isFreebuffModelId,
  isSupportedFreebuffModelId,
} from '../constants/freebuff-models'

describe('freebuff model availability', () => {
  test('defaults to Kimi K2.6', () => {
    expect(DEFAULT_FREEBUFF_MODEL_ID).toBe(FREEBUFF_KIMI_MODEL_ID)
  })

  test('supports GLM 5.1 as a legacy server-side model without selecting it for new clients', () => {
    expect(FREEBUFF_MODELS.map((model) => model.id)).not.toContain(
      FREEBUFF_GLM_MODEL_ID,
    )
    expect(SUPPORTED_FREEBUFF_MODELS.map((model) => model.id)).toContain(
      FREEBUFF_GLM_MODEL_ID,
    )
    expect(isFreebuffModelId(FREEBUFF_GLM_MODEL_ID)).toBe(false)
    expect(isSupportedFreebuffModelId(FREEBUFF_GLM_MODEL_ID)).toBe(true)
  })

  test('formats the close time in the user local timezone while deployment is open', () => {
    expect(
      getFreebuffDeploymentAvailabilityLabel(new Date('2026-01-05T18:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('until 5:00 PM')
  })

  test('formats the next open time in the user local timezone while deployment is closed', () => {
    expect(
      getFreebuffDeploymentAvailabilityLabel(new Date('2026-01-05T12:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('opens 6:00 AM')
  })

  test('includes the weekday when the next opening is on a later local day', () => {
    expect(
      getFreebuffDeploymentAvailabilityLabel(new Date('2026-01-11T03:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('opens Sun 6:00 AM')
  })

  test('tracks deployment hours correctly across the open and close boundaries', () => {
    expect(isFreebuffDeploymentHours(new Date('2026-01-05T13:59:00Z'))).toBe(
      false,
    )
    expect(isFreebuffDeploymentHours(new Date('2026-01-05T14:00:00Z'))).toBe(
      true,
    )
    expect(isFreebuffDeploymentHours(new Date('2026-01-06T00:59:00Z'))).toBe(
      true,
    )
    expect(isFreebuffDeploymentHours(new Date('2026-01-06T01:00:00Z'))).toBe(
      false,
    )
    expect(isFreebuffDeploymentHours(new Date('2026-01-10T20:00:00Z'))).toBe(
      true,
    )
  })
})
