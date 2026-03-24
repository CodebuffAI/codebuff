import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'

import {
  checkFreeModeRateLimit,
  FREE_MODE_RATE_LIMITS,
  resetFreeModeRateLimits,
} from '../free-mode-rate-limiter'

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS

describe('free-mode-rate-limiter', () => {
  let nowSpy: ReturnType<typeof spyOn>
  let fakeNow: number

  beforeEach(() => {
    resetFreeModeRateLimits()
    fakeNow = 1_000_000_000_000
    nowSpy = spyOn(Date, 'now').mockImplementation(() => fakeNow)
  })

  afterEach(() => {
    nowSpy.mockRestore()
  })

  function advanceTime(ms: number) {
    fakeNow += ms
  }

  function makeRequests(userId: string, count: number) {
    for (let i = 0; i < count; i++) {
      if (i > 0) {
        advanceTime(1 * SECOND_MS + 1)
      }
      const result = checkFreeModeRateLimit(userId)
      if (result.limited) {
        throw new Error(`Unexpectedly rate limited on request ${i + 1}`)
      }
    }
  }

  describe('checkFreeModeRateLimit', () => {
    it('allows the first request', () => {
      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(false)
    })

    it('limits when per-second limit is exceeded', () => {
      // Make all requests within the same second (no time advancement)
      for (let i = 0; i < FREE_MODE_RATE_LIMITS.PER_SECOND; i++) {
        expect(checkFreeModeRateLimit('user-1').limited).toBe(false)
      }

      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(true)
      if (result.limited) {
        expect(result.windowName).toBe('1 second')
      }
    })

    it('resets per-second window after expiry', () => {
      for (let i = 0; i < FREE_MODE_RATE_LIMITS.PER_SECOND; i++) {
        checkFreeModeRateLimit('user-1')
      }
      expect(checkFreeModeRateLimit('user-1').limited).toBe(true)

      advanceTime(1 * SECOND_MS + 1)

      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(false)
    })

    it('allows requests up to the per-minute limit', () => {
      for (let i = 0; i < FREE_MODE_RATE_LIMITS.PER_MINUTE; i++) {
        const result = checkFreeModeRateLimit('user-1')
        expect(result.limited).toBe(false)
        if (i < FREE_MODE_RATE_LIMITS.PER_MINUTE - 1) {
          advanceTime(1 * SECOND_MS + 1)
        }
      }
    })

    it('limits when per-minute limit is exceeded', () => {
      makeRequests('user-1', FREE_MODE_RATE_LIMITS.PER_MINUTE)
      // Advance past the 1-second window so the per-minute window is the one that triggers
      advanceTime(1 * SECOND_MS + 1)

      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(true)
      if (result.limited) {
        expect(result.windowName).toBe('1 minute')
      }
    })

    it('limits when per-30-minute limit is exceeded', () => {
      const perMinute = FREE_MODE_RATE_LIMITS.PER_MINUTE
      const per30Min = FREE_MODE_RATE_LIMITS.PER_30_MINUTES

      // Spread requests across multiple 1-minute windows to avoid hitting the per-minute limit
      let sent = 0
      while (sent < per30Min) {
        const batch = Math.min(perMinute, per30Min - sent)
        makeRequests('user-1', batch)
        sent += batch
        if (sent < per30Min) {
          // Advance past the 1-minute window so it resets
          advanceTime(1 * MINUTE_MS + 1)
        }
      }

      // Advance past the 1-minute window so the per-30-minute window is the one that triggers
      advanceTime(1 * MINUTE_MS + 1)

      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(true)
      if (result.limited) {
        expect(result.windowName).toBe('30 minutes')
      }
    })

    it('limits when per-5-hour limit is exceeded', () => {
      const perMinute = FREE_MODE_RATE_LIMITS.PER_MINUTE
      const per30Min = FREE_MODE_RATE_LIMITS.PER_30_MINUTES
      const per5Hours = FREE_MODE_RATE_LIMITS.PER_5_HOURS

      // Spread requests across multiple 30-minute windows
      let sent = 0
      while (sent < per5Hours) {
        const batchStart = fakeNow
        const batchFor30Min = Math.min(per30Min, per5Hours - sent)
        // Within each 30-min window, spread across 1-min windows
        let sentInWindow = 0
        while (sentInWindow < batchFor30Min) {
          const batch = Math.min(perMinute, batchFor30Min - sentInWindow)
          makeRequests('user-1', batch)
          sentInWindow += batch
          if (sentInWindow < batchFor30Min) {
            advanceTime(1 * MINUTE_MS + 1)
          }
        }
        sent += sentInWindow
        if (sent < per5Hours) {
          // Advance just past the 30-min window boundary to reset it,
          // accounting for time already elapsed in the inner loop
          const elapsed = fakeNow - batchStart
          advanceTime(30 * MINUTE_MS - elapsed + 1)
        }
      }

      // Advance past the 30-minute window so the per-5-hour window is the one that triggers
      advanceTime(30 * MINUTE_MS + 1)

      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(true)
      if (result.limited) {
        expect(result.windowName).toBe('5 hours')
      }
    })

    it('limits when per-7-day limit is exceeded', () => {
      const perMinute = FREE_MODE_RATE_LIMITS.PER_MINUTE
      const per30Min = FREE_MODE_RATE_LIMITS.PER_30_MINUTES
      const per5Hours = FREE_MODE_RATE_LIMITS.PER_5_HOURS
      const per7Days = FREE_MODE_RATE_LIMITS.PER_7_DAYS

      // Spread requests across multiple 5-hour windows
      let sent = 0
      while (sent < per7Days) {
        const batchFor5Hours = Math.min(per5Hours, per7Days - sent)
        let sentIn5Hr = 0
        while (sentIn5Hr < batchFor5Hours) {
          const batchFor30Min = Math.min(per30Min, batchFor5Hours - sentIn5Hr)
          let sentIn30Min = 0
          while (sentIn30Min < batchFor30Min) {
            const batch = Math.min(perMinute, batchFor30Min - sentIn30Min)
            makeRequests('user-1', batch)
            sentIn30Min += batch
            if (sentIn30Min < batchFor30Min) {
              advanceTime(1 * MINUTE_MS + 1)
            }
          }
          sentIn5Hr += sentIn30Min
          advanceTime(30 * MINUTE_MS + 1)
        }
        sent += sentIn5Hr
        // Advance past the 5-hour window (stays within 7-day window)
        advanceTime(5 * HOUR_MS + 1)
      }

      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(true)
      if (result.limited) {
        expect(result.windowName).toBe('7 days')
      }
    })

    it('does not increment counters when rate limited', () => {
      makeRequests('user-1', FREE_MODE_RATE_LIMITS.PER_MINUTE)
      // Advance past the 1-second window so the per-minute window blocks
      advanceTime(1 * SECOND_MS + 1)

      // These should all be rejected without changing state
      for (let i = 0; i < 5; i++) {
        const result = checkFreeModeRateLimit('user-1')
        expect(result.limited).toBe(true)
      }

      // After the 1-minute window expires, the user should only have used PER_MINUTE requests
      // against the 30-minute window, not PER_MINUTE + 5
      advanceTime(1 * MINUTE_MS + 1)

      // Should be allowed again (1-min window reset)
      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(false)
    })

    it('returns correct retryAfterMs for the violated window', () => {
      makeRequests('user-1', FREE_MODE_RATE_LIMITS.PER_MINUTE)
      // makeRequests advanced time by (PER_MINUTE - 1) * (SECOND_MS + 1)
      const elapsedInMakeRequests = (FREE_MODE_RATE_LIMITS.PER_MINUTE - 1) * (1 * SECOND_MS + 1)

      // Advance past the 1-second window, then a bit more
      const additionalAdvance = 2 * SECOND_MS
      advanceTime(additionalAdvance)

      const totalElapsed = elapsedInMakeRequests + additionalAdvance
      const expectedRetryAfterMs = 1 * MINUTE_MS - totalElapsed

      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(true)
      if (result.limited) {
        expect(result.windowName).toBe('1 minute')
        expect(result.retryAfterMs).toBe(expectedRetryAfterMs)
      }
    })

    it('resets per-minute window after expiry', () => {
      makeRequests('user-1', FREE_MODE_RATE_LIMITS.PER_MINUTE)
      advanceTime(1 * SECOND_MS + 1)

      const limited = checkFreeModeRateLimit('user-1')
      expect(limited.limited).toBe(true)

      // Advance past the 1-minute window
      advanceTime(1 * MINUTE_MS + 1)

      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(false)
    })

    it('isolates different users', () => {
      makeRequests('user-1', FREE_MODE_RATE_LIMITS.PER_MINUTE)
      advanceTime(1 * SECOND_MS + 1)

      // user-1 is rate limited
      expect(checkFreeModeRateLimit('user-1').limited).toBe(true)

      // user-2 should not be affected
      const result = checkFreeModeRateLimit('user-2')
      expect(result.limited).toBe(false)
    })

    it('retryAfterMs is never negative', () => {
      for (let i = 0; i < FREE_MODE_RATE_LIMITS.PER_SECOND; i++) {
        checkFreeModeRateLimit('user-1')
      }

      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(true)
      if (result.limited) {
        expect(result.retryAfterMs).toBeGreaterThanOrEqual(0)
      }
    })

    it('tracks counts across all windows simultaneously', () => {
      // Make some requests
      makeRequests('user-1', 5)

      // Advance past 1-minute window but within 30-minute window
      advanceTime(1 * MINUTE_MS + 1)

      // Make more requests — 1-min counter resets, but 30-min counter keeps accumulating
      makeRequests('user-1', 5)

      // Advance past 1-minute again
      advanceTime(1 * MINUTE_MS + 1)

      // The 30-min window should now have 10 requests counted
      // and the 1-min window should be fresh
      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(false)
    })
  })

  describe('resetFreeModeRateLimits', () => {
    it('clears all rate limit state', () => {
      for (let i = 0; i < FREE_MODE_RATE_LIMITS.PER_SECOND; i++) {
        checkFreeModeRateLimit('user-1')
      }
      expect(checkFreeModeRateLimit('user-1').limited).toBe(true)

      resetFreeModeRateLimits()

      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(false)
    })

    it('clears state for all users', () => {
      for (let i = 0; i < FREE_MODE_RATE_LIMITS.PER_SECOND; i++) {
        checkFreeModeRateLimit('user-1')
        checkFreeModeRateLimit('user-2')
      }

      expect(checkFreeModeRateLimit('user-1').limited).toBe(true)
      expect(checkFreeModeRateLimit('user-2').limited).toBe(true)

      resetFreeModeRateLimits()

      expect(checkFreeModeRateLimit('user-1').limited).toBe(false)
      expect(checkFreeModeRateLimit('user-2').limited).toBe(false)
    })
  })
})
