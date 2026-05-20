import { describe, expect, test } from 'bun:test'

import {
  formatFreebuffPremiumResetCountdown,
  getFreebuffPremiumResetAt,
} from '../freebuff-premium-reset'

describe('freebuff premium reset helpers', () => {
  test('uses server resetAt when it is in the future', () => {
    const nowMs = Date.parse('2026-05-11T20:00:00.000Z')
    const resetAt = getFreebuffPremiumResetAt({
      nowMs,
      rateLimitsByModel: {
        'test/model': {
          model: 'test/model',
          limit: 5,
          period: 'pacific_day',
          resetTimeZone: 'America/Los_Angeles',
          resetAt: '2026-05-12T07:00:00.000Z',
          windowHours: 24,
          recentCount: 2,
        },
      },
    })

    expect(resetAt.toISOString()).toBe('2026-05-12T07:00:00.000Z')
  })

  test('falls back to next midnight Pacific when resetAt is absent', () => {
    const resetAt = getFreebuffPremiumResetAt({
      nowMs: Date.parse('2026-05-11T20:00:00.000Z'),
    })

    expect(resetAt.toISOString()).toBe('2026-05-12T07:00:00.000Z')
  })

  test('keeps expired server resetAt instead of rolling stale quota forward', () => {
    const nowMs = Date.parse('2026-05-12T07:05:00.000Z')
    const resetAt = getFreebuffPremiumResetAt({
      nowMs,
      rateLimitsByModel: {
        'test/model': {
          model: 'test/model',
          limit: 5,
          period: 'pacific_day',
          resetTimeZone: 'America/Los_Angeles',
          resetAt: '2026-05-12T07:00:00.000Z',
          windowHours: 24,
          recentCount: 5,
        },
      },
    })

    expect(resetAt.toISOString()).toBe('2026-05-12T07:00:00.000Z')
    expect(formatFreebuffPremiumResetCountdown(resetAt, nowMs)).toBe('now')
  })

  test('handles Pacific daylight saving time boundaries', () => {
    const resetAt = getFreebuffPremiumResetAt({
      nowMs: Date.parse('2026-01-15T20:00:00.000Z'),
    })

    expect(resetAt.toISOString()).toBe('2026-01-16T08:00:00.000Z')
  })

  test('formats hours and minutes left', () => {
    const nowMs = Date.parse('2026-05-11T20:00:00.000Z')
    const resetAt = new Date('2026-05-12T07:30:00.000Z')

    expect(formatFreebuffPremiumResetCountdown(resetAt, nowMs)).toBe('11h 30m')
  })

  test('formats sub-hour reset countdowns', () => {
    const nowMs = Date.parse('2026-05-12T06:30:00.000Z')
    const resetAt = new Date('2026-05-12T07:00:00.000Z')

    expect(formatFreebuffPremiumResetCountdown(resetAt, nowMs)).toBe('30m')
  })
})
