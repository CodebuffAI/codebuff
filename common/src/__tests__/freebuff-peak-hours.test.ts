import { describe, expect, test } from 'bun:test'

import {
  DEEPSEEK_PEAK_HOUR_RANGES_UTC,
  deepseekPricingWindow,
  formatDeepSeekPeakWindowsLocal,
  isDeepSeekPeakHour,
  nextDeepSeekWindowBoundary,
} from '../constants/freebuff-peak-hours'
import { resolveFreebuffSpendCeiling } from '../constants/freebuff-spend-ceilings'

/** A UTC instant on the given hour, on an ordinary day. */
const at = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 7, 20, hour, minute))

describe('the peak windows', () => {
  test.each([
    [0, false],
    [1, true],
    [3, true],
    [4, false],
    [5, false], // the gap BETWEEN the two windows — what a single range check
    [6, true], //  silently gets wrong
    [9, true],
    [10, false],
    [23, false],
  ])('%i:00 UTC peak=%p', (hour, peak) => {
    expect(isDeepSeekPeakHour(at(hour))).toBe(peak)
    expect(deepseekPricingWindow(at(hour))).toBe(peak ? 'peak' : 'off-peak')
  })

  test('treats boundaries as half-open, so the closing hour is already off-peak', () => {
    expect(isDeepSeekPeakHour(at(3, 59))).toBe(true)
    expect(isDeepSeekPeakHour(at(4, 0))).toBe(false)
    expect(isDeepSeekPeakHour(at(9, 59))).toBe(true)
    expect(isDeepSeekPeakHour(at(10, 0))).toBe(false)
  })
})

describe('nextDeepSeekWindowBoundary', () => {
  // This is the "your full limit returns at ..." number, so a wrong answer is
  // a promise broken to the user rather than a rounding error.
  const DAY = 24 * 3600_000
  test.each([
    ['mid-peak, to that window’s close', 2, at(4)],
    ['mid-second-window, to its close', 7, at(10)],
    ['in the gap, to the next window’s OPEN', 4, at(6)],
    ['long off-peak, wrapping to tomorrow’s 01:00', 11, new Date(at(1).getTime() + DAY)],
  ])('%s', (_label, from, expected) => {
    expect(nextDeepSeekWindowBoundary(at(from)).toISOString()).toBe(
      expected.toISOString(),
    )
  })

  test('always moves forward and flips the window', () => {
    for (let h = 0; h < 24; h++) {
      const now = at(h, 30)
      const b = nextDeepSeekWindowBoundary(now)
      expect(b.getTime()).toBeGreaterThan(now.getTime())
      expect(deepseekPricingWindow(b)).not.toBe(deepseekPricingWindow(now))
    }
  })
})

describe('formatDeepSeekPeakWindowsLocal', () => {
  test('renders both windows in the reader’s zone, not UTC', () => {
    // The whole reason the wire carries hour pairs instead of text: a user in
    // Los Angeles must not be asked to convert "01:00-04:00 UTC" themselves.
    const la = formatDeepSeekPeakWindowsLocal(at(12), 'America/Los_Angeles')
    expect(la).toHaveLength(DEEPSEEK_PEAK_HOUR_RANGES_UTC.length)
    expect(la[0]).toContain('6:00')
    expect(la[0]).toContain('9:00')

    const tokyo = formatDeepSeekPeakWindowsLocal(at(12), 'Asia/Tokyo')
    expect(tokyo[0]).not.toBe(la[0])
  })
})

describe('the peak-hours ceiling reduction', () => {
  const base = { accessTier: 'full' as const, countryCode: 'US' }

  test('does nothing without an explicit opt-in', () => {
    // The admin page resolves ceilings to SHOW policy; it must keep seeing the
    // unreduced number regardless of what time it renders at.
    const plain = resolveFreebuffSpendCeiling(base)
    const timeOnly = resolveFreebuffSpendCeiling({ ...base, at: at(2) })
    expect(timeOnly.usd).toBe(plain.usd)
    expect(timeOnly.peak).toBeUndefined()
  })

  test('halves the ceiling during peak and says when it returns', () => {
    const full = resolveFreebuffSpendCeiling(base)
    const peak = resolveFreebuffSpendCeiling({
      ...base,
      at: at(2),
      peakMultiplier: 0.5,
    })

    expect(peak.usd).toBeCloseTo(full.usd / 2, 10)
    expect(peak.peak?.baseUsd).toBe(full.usd)
    expect(peak.peak?.multiplier).toBe(0.5)
    // 02:00 UTC sits in the 01:00-04:00 window, so the full ceiling is back at
    // 04:00 — hours away, NOT at midnight Pacific.
    expect(peak.peak?.endsAt.getTime()).toBe(at(4).getTime())
  })

  test('leaves off-peak hours untouched', () => {
    const offPeak = resolveFreebuffSpendCeiling({
      ...base,
      at: at(12),
      peakMultiplier: 0.5,
    })
    expect(offPeak.usd).toBe(resolveFreebuffSpendCeiling(base).usd)
    expect(offPeak.peak).toBeUndefined()
  })

  test('reports the unreduced figures in `applied`', () => {
    // The admin view answers "which rule bound this account", which is a
    // policy question the time of day must not distort.
    const peak = resolveFreebuffSpendCeiling({
      ...base,
      at: at(2),
      peakMultiplier: 0.5,
    })
    expect(peak.applied.every((a) => a.usd > peak.usd)).toBe(true)
  })

  test('reduces the WINNER, so peak cannot change which rule binds', () => {
    // Scaling every candidate first could flip the winner at 01:00 and flip it
    // back at 04:00 — an account would change refusal reasons twice a day for
    // no policy reason.
    const restricted = {
      accessTier: 'full' as const,
      countryCode: 'CN',
      at: at(2),
      peakMultiplier: 0.5,
    }
    const peak = resolveFreebuffSpendCeiling(restricted)
    const offPeak = resolveFreebuffSpendCeiling({ ...restricted, at: at(12) })
    expect(peak.reason).toBe(offPeak.reason)
  })

  test.each([0, -1, Number.NaN, 1, 2])(
    'ignores a multiplier of %p rather than locking anyone out',
    (multiplier) => {
      // <= 0 would zero every ceiling for seven hours a day; >= 1 is the
      // documented kill switch.
      const r = resolveFreebuffSpendCeiling({
        ...base,
        at: at(2),
        peakMultiplier: multiplier,
      })
      expect(r.usd).toBe(resolveFreebuffSpendCeiling(base).usd)
      expect(r.peak).toBeUndefined()
    },
  )

  test('leaves the limited tier alone — it runs no DeepSeek model', () => {
    // DeepSeek V4 Flash was paused for this tier on 2026-08-18, leaving MiMo
    // 2.5, which costs the same at 02:00 UTC as at 14:00. Reducing here would
    // charge a limited account for a rate card it cannot reach — so this test
    // is also what fails, loudly, on the day Flash is restored to the tier.
    const limited = { accessTier: 'limited' as const, countryCode: 'US' }
    const peak = resolveFreebuffSpendCeiling({
      ...limited,
      at: at(2),
      peakMultiplier: 0.5,
    })
    expect(peak.usd).toBe(resolveFreebuffSpendCeiling(limited).usd)
    expect(peak.peak).toBeUndefined()
  })
})
