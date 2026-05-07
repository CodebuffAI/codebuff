import { describe, expect, test } from 'bun:test'

import { getZonedDayBounds } from '../zoned-time'

describe('getZonedDayBounds', () => {
  test('returns the current Pacific day bounds on a normal day', () => {
    const bounds = getZonedDayBounds(
      new Date('2026-04-17T16:00:00Z'),
      'America/Los_Angeles',
    )

    expect(bounds.startsAt.toISOString()).toBe('2026-04-17T07:00:00.000Z')
    expect(bounds.resetsAt.toISOString()).toBe('2026-04-18T07:00:00.000Z')
  })

  test('handles the shorter spring-forward Pacific day', () => {
    const bounds = getZonedDayBounds(
      new Date('2026-03-08T09:00:00Z'),
      'America/Los_Angeles',
    )

    expect(bounds.startsAt.toISOString()).toBe('2026-03-08T08:00:00.000Z')
    expect(bounds.resetsAt.toISOString()).toBe('2026-03-09T07:00:00.000Z')
  })

  test('handles the longer fall-back Pacific day', () => {
    const bounds = getZonedDayBounds(
      new Date('2026-11-01T09:00:00Z'),
      'America/Los_Angeles',
    )

    expect(bounds.startsAt.toISOString()).toBe('2026-11-01T07:00:00.000Z')
    expect(bounds.resetsAt.toISOString()).toBe('2026-11-02T08:00:00.000Z')
  })
})
