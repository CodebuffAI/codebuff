import { describe, expect, test } from 'bun:test'

import {
  getFreebuffDeploymentAvailabilityLabel,
  isFreebuffDeploymentHours,
} from '../constants/freebuff-models'

describe('freebuff model availability', () => {
  test('formats the close time in the user local timezone while deployment is open', () => {
    expect(
      getFreebuffDeploymentAvailabilityLabel(new Date('2026-01-05T18:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('until 5:00 PM local')
  })

  test('formats the next open time in the user local timezone while deployment is closed', () => {
    expect(
      getFreebuffDeploymentAvailabilityLabel(new Date('2026-01-05T12:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('opens 6:00 AM local')
  })

  test('includes the weekday when the next opening is on a later local day', () => {
    expect(
      getFreebuffDeploymentAvailabilityLabel(new Date('2026-01-10T20:00:00Z'), {
        locale: 'en-US',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('opens Mon 6:00 AM local')
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
  })
})
