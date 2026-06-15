import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import {
  checkConfiguredFreeModeRateLimit,
  checkFreeModeRateLimit,
  checkRedisFreeModeRateLimit,
  FREE_MODE_PREMIUM_RATE_LIMITS,
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

  function makeRequests(
    userId: string,
    count: number,
    options: { premium?: boolean } = {},
  ) {
    for (let i = 0; i < count; i++) {
      if (i > 0) {
        advanceTime(1 * SECOND_MS + 1)
      }
      const result = checkFreeModeRateLimit(userId, options)
      if (result.limited) {
        throw new Error(
          `Unexpectedly rate limited on request ${i + 1} by ${result.windowName}`,
        )
      }
    }
  }

  // Send `count` premium requests within a single day, spreading across the
  // general 5-hour / 30-minute / 1-minute / 1-second windows so only the premium
  // daily window can be the limiting factor. The premium daily cap (2500) is
  // larger than the general 5-hour limit (2000), so the requests must be spread
  // across multiple 5-hour windows — not just 30-minute ones — or the general
  // 5-hour window would trip first. Use one less than each general max where
  // possible to avoid follow-up probe requests being blocked by a general
  // window that the helper filled exactly. `count` must stay under the general
  // 1-day limit (4000), and the whole sequence fits inside one day, so the
  // premium daily counter never resets mid-run.
  function sendPremiumWithinOneDay(userId: string, count: number) {
    const per5Hours = Math.max(1, FREE_MODE_RATE_LIMITS.PER_5_HOURS - 1)
    const per30Min = Math.max(1, FREE_MODE_RATE_LIMITS.PER_30_MINUTES - 1)
    const perMinute = Math.max(1, FREE_MODE_RATE_LIMITS.PER_MINUTE - 1)
    let sent = 0
    while (sent < count) {
      const fiveHourStart = fakeNow
      const batchFor5Hours = Math.min(per5Hours, count - sent)
      let sentIn5Hours = 0

      while (sentIn5Hours < batchFor5Hours) {
        const thirtyMinuteStart = fakeNow
        const batchFor30Min = Math.min(
          per30Min,
          batchFor5Hours - sentIn5Hours,
        )
        let sentIn30Min = 0

        while (sentIn30Min < batchFor30Min) {
          const batch = Math.min(perMinute, batchFor30Min - sentIn30Min)
          makeRequests(userId, batch, { premium: true })
          sentIn30Min += batch
          if (sentIn30Min < batchFor30Min) {
            advanceTime(1 * MINUTE_MS + 1)
          }
        }

        sentIn5Hours += sentIn30Min
        if (sentIn5Hours < batchFor5Hours) {
          const elapsed = fakeNow - thirtyMinuteStart
          advanceTime(30 * MINUTE_MS - elapsed + 1)
        }
      }

      sent += sentIn5Hours
      if (sent < count) {
        const elapsed = fakeNow - fiveHourStart
        advanceTime(5 * HOUR_MS - elapsed + 1)
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

    it('limits when per-day limit is exceeded', () => {
      const perMinute = FREE_MODE_RATE_LIMITS.PER_MINUTE
      const per30Min = FREE_MODE_RATE_LIMITS.PER_30_MINUTES
      const per5Hours = FREE_MODE_RATE_LIMITS.PER_5_HOURS
      const perDay = FREE_MODE_RATE_LIMITS.PER_DAY

      // Spread requests across multiple 5-hour windows, staying within one day.
      // Advances are boundary-aware so the whole sequence fits inside the
      // 1-day window without the per-day counter resetting.
      let sent = 0
      while (sent < perDay) {
        const windowStart = fakeNow
        const batchFor5Hours = Math.min(per5Hours, perDay - sent)
        // Within each 5-hour window, spread across 30-minute windows
        let sentIn5Hr = 0
        while (sentIn5Hr < batchFor5Hours) {
          const subWindowStart = fakeNow
          const batchFor30Min = Math.min(per30Min, batchFor5Hours - sentIn5Hr)
          // Within each 30-min window, spread across 1-min windows
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
          if (sentIn5Hr < batchFor5Hours) {
            // Advance just past the 30-min window boundary to reset it,
            // accounting for time already elapsed in the inner loop
            const elapsed = fakeNow - subWindowStart
            advanceTime(30 * MINUTE_MS - elapsed + 1)
          }
        }
        sent += sentIn5Hr
        // Advance just past the 5-hour window boundary to reset it (and all
        // smaller windows) while staying within the 1-day window
        const elapsed = fakeNow - windowStart
        advanceTime(5 * HOUR_MS - elapsed + 1)
      }

      const result = checkFreeModeRateLimit('user-1')
      expect(result.limited).toBe(true)
      if (result.limited) {
        expect(result.windowName).toBe('1 day')
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
      const elapsedInMakeRequests =
        (FREE_MODE_RATE_LIMITS.PER_MINUTE - 1) * (1 * SECOND_MS + 1)

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

  describe('premium model windows', () => {
    it('limits premium requests at the premium daily window', () => {
      sendPremiumWithinOneDay('user-1', FREE_MODE_PREMIUM_RATE_LIMITS.PER_DAY)
      // Advance past the general 1-minute window so it isn't the limiter.
      advanceTime(1 * MINUTE_MS + 1)

      const result = checkFreeModeRateLimit('user-1', { premium: true })
      expect(result.limited).toBe(true)
      if (result.limited) {
        expect(result.windowName).toBe('premium 1 day')
      }
    })

    it('does not apply premium windows to non-premium requests', () => {
      // Exhaust the premium daily window.
      sendPremiumWithinOneDay('user-1', FREE_MODE_PREMIUM_RATE_LIMITS.PER_DAY)
      advanceTime(1 * MINUTE_MS + 1)

      // Premium request is now blocked...
      expect(checkFreeModeRateLimit('user-1', { premium: true }).limited).toBe(
        true,
      )

      // ...but a non-premium request (which only consumes the general windows,
      // still well under their limits) is allowed.
      const nonPremium = checkFreeModeRateLimit('user-1', { premium: false })
      expect(nonPremium.limited).toBe(false)
    })

    it('premium requests still consume the general windows', () => {
      // The general per-second window (2) should still trip first for a burst.
      for (let i = 0; i < FREE_MODE_RATE_LIMITS.PER_SECOND; i++) {
        expect(
          checkFreeModeRateLimit('user-1', { premium: true }).limited,
        ).toBe(false)
      }
      const result = checkFreeModeRateLimit('user-1', { premium: true })
      expect(result.limited).toBe(true)
      if (result.limited) {
        expect(result.windowName).toBe('1 second')
      }
    })

    it('isolates premium counters between users', () => {
      sendPremiumWithinOneDay('user-1', FREE_MODE_PREMIUM_RATE_LIMITS.PER_DAY)
      advanceTime(1 * MINUTE_MS + 1)
      expect(checkFreeModeRateLimit('user-1', { premium: true }).limited).toBe(
        true,
      )
      expect(checkFreeModeRateLimit('user-2', { premium: true }).limited).toBe(
        false,
      )
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

  describe('checkRedisFreeModeRateLimit', () => {
    it('checks all windows in one Redis eval call', async () => {
      const evalMock = mock(async () => [0])
      const redis = { eval: evalMock }

      const result = await checkRedisFreeModeRateLimit(
        'user with spaces',
        redis,
      )

      expect(result.limited).toBe(false)
      expect(evalMock).toHaveBeenCalledTimes(1)

      const callArgs = evalMock.mock.calls[0] as unknown as [
        string,
        number,
        ...Array<string | number>,
      ]
      expect(callArgs[1]).toBe(5)
      expect(callArgs.slice(2, 7)).toEqual([
        'free-mode-rate-limit:v1:user%20with%20spaces:1000',
        'free-mode-rate-limit:v1:user%20with%20spaces:60000',
        'free-mode-rate-limit:v1:user%20with%20spaces:1800000',
        'free-mode-rate-limit:v1:user%20with%20spaces:18000000',
        'free-mode-rate-limit:v1:user%20with%20spaces:86400000',
      ])
      expect(callArgs[7]).toBe('5')
      expect(callArgs.slice(8, 11)).toEqual([
        '1 second',
        1_000,
        FREE_MODE_RATE_LIMITS.PER_SECOND,
      ])
    })

    it('parses Redis limited responses', async () => {
      const redis = {
        eval: mock(async () => [1, '1 minute', 12_345]),
      }

      const result = await checkRedisFreeModeRateLimit('user-1', redis)

      expect(result).toEqual({
        limited: true,
        windowName: '1 minute',
        retryAfterMs: 12_345,
      })
    })

    it('adds the premium daily window when premium=true', async () => {
      const evalMock = mock(async () => [0])
      const redis = { eval: evalMock }

      await checkConfiguredFreeModeRateLimit('user-1', {
        redisClient: redis,
        premium: true,
      })

      const callArgs = evalMock.mock.calls[0] as unknown as [
        string,
        number,
        ...Array<string | number>,
      ]
      // 5 general + 1 premium (daily) window.
      expect(callArgs[1]).toBe(6)
      const keys = callArgs.slice(2, 8)
      expect(keys).toContain(
        `free-mode-rate-limit:v1:user-1:premium:${24 * HOUR_MS}`,
      )
      // No separate sub-day premium window.
      expect(
        (keys as string[]).filter((k) => k.includes('premium')).length,
      ).toBe(1)
    })

    it('omits the premium windows when premium is not set', async () => {
      const evalMock = mock(async () => [0])
      const redis = { eval: evalMock }

      await checkConfiguredFreeModeRateLimit('user-1', {
        redisClient: redis,
      })

      const callArgs = evalMock.mock.calls[0] as unknown as [
        string,
        number,
        ...Array<string | number>,
      ]
      expect(callArgs[1]).toBe(5)
      const keys = callArgs.slice(2, 7) as string[]
      expect(keys.some((k) => k.includes('premium'))).toBe(false)
    })
  })

  describe('checkConfiguredFreeModeRateLimit', () => {
    it('falls back to the in-memory limiter when Redis is unavailable', async () => {
      const redis = {
        eval: mock(async () => {
          throw new Error('Redis unavailable')
        }),
      }

      const result = await checkConfiguredFreeModeRateLimit('user-1', {
        redisClient: redis,
      })

      expect(result.limited).toBe(false)
    })
  })
})
