import { afterEach, describe, expect, test } from 'bun:test'
import { setSystemTime } from 'bun:test'

import { formatResetTimeLong } from './time-format'

describe('formatResetTimeLong', () => {
  afterEach(() => {
    setSystemTime()
  })

  test('returns empty string for null', () => {
    expect(formatResetTimeLong(null)).toBe('')
  })

  test('formats a multi-day reset with remaining hours', () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const resetDate = new Date('2026-01-05T07:00:00.000Z')

    expect(formatResetTimeLong(resetDate)).toBe('4d 7h')
  })

  test('formats a whole number of days with no remaining hours', () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const resetDate = new Date('2026-01-03T00:00:00.000Z')

    expect(formatResetTimeLong(resetDate)).toBe('2d')
  })

  test('formats hours and minutes under a day away', () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const resetDate = new Date('2026-01-01T02:30:00.000Z')

    expect(formatResetTimeLong(resetDate)).toBe('2h 30m')
  })

  test('formats minutes only under an hour away', () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const resetDate = new Date('2026-01-01T00:15:00.000Z')

    expect(formatResetTimeLong(resetDate)).toBe('15m')
  })

  test('falls back to "now" for a date already in the past', () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const resetDate = new Date('2025-12-31T00:00:00.000Z')

    expect(formatResetTimeLong(resetDate)).toBe('now')
  })

  test('accepts an ISO string in addition to a Date', () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    expect(formatResetTimeLong('2026-01-01T01:00:00.000Z')).toBe('1h')
  })

  test('falls back to "now" for an unparseable date string', () => {
    setSystemTime(new Date('2026-01-01T00:00:00.000Z'))

    expect(formatResetTimeLong('not-a-date')).toBe('now')
  })
})
