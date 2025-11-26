import { describe, test, expect } from 'bun:test'

import {
  getBannerColorLevel,
  getThresholdInfo,
  generateUsageBannerText,
  generateLoadingBannerText,
  shouldAutoShowBanner,
} from '../usage-banner-state'

describe('usage-banner-state', () => {
  describe('getThresholdInfo', () => {
    test('returns high tier for >= 1000 credits', () => {
      expect(getThresholdInfo(1000)).toEqual({ tier: 'high', colorLevel: 'success', threshold: 1000 })
      expect(getThresholdInfo(5000)).toEqual({ tier: 'high', colorLevel: 'success', threshold: 1000 })
    })

    test('returns medium tier for 500-999 credits', () => {
      expect(getThresholdInfo(999)).toEqual({ tier: 'medium', colorLevel: 'warning', threshold: 500 })
      expect(getThresholdInfo(500)).toEqual({ tier: 'medium', colorLevel: 'warning', threshold: 500 })
    })

    test('returns low tier for 100-499 credits', () => {
      expect(getThresholdInfo(499)).toEqual({ tier: 'low', colorLevel: 'warning', threshold: 100 })
      expect(getThresholdInfo(100)).toEqual({ tier: 'low', colorLevel: 'warning', threshold: 100 })
    })

    test('returns out tier for < 100 credits', () => {
      expect(getThresholdInfo(99)).toEqual({ tier: 'out', colorLevel: 'error', threshold: 0 })
      expect(getThresholdInfo(0)).toEqual({ tier: 'out', colorLevel: 'error', threshold: 0 })
      expect(getThresholdInfo(-50)).toEqual({ tier: 'out', colorLevel: 'error', threshold: 0 })
    })

    test('returns medium tier when balance is unknown', () => {
      expect(getThresholdInfo(null)).toEqual({ tier: 'medium', colorLevel: 'warning', threshold: 500 })
    })
  })

  describe('getBannerColorLevel', () => {
    test('shows success for healthy credit balance (>= 1000)', () => {
      expect(getBannerColorLevel(1000)).toBe('success')
      expect(getBannerColorLevel(5000)).toBe('success')
    })

    test('shows warning for moderate credit balance (100-999)', () => {
      expect(getBannerColorLevel(999)).toBe('warning')
      expect(getBannerColorLevel(500)).toBe('warning')
      expect(getBannerColorLevel(100)).toBe('warning')
    })

    test('shows error for low credit balance (< 100)', () => {
      expect(getBannerColorLevel(99)).toBe('error')
      expect(getBannerColorLevel(0)).toBe('error')
      expect(getBannerColorLevel(-50)).toBe('error')
    })

    test('shows warning when balance is unknown', () => {
      expect(getBannerColorLevel(null)).toBe('warning')
    })
  })

  describe('generateLoadingBannerText', () => {
    test('shows session usage while loading', () => {
      const text = generateLoadingBannerText(150)
      expect(text).toContain('150')
    })

    test('indicates loading state', () => {
      const text = generateLoadingBannerText(0)
      expect(text.toLowerCase()).toContain('loading')
    })
  })

  describe('generateUsageBannerText', () => {
    test('always shows session usage', () => {
      const text = generateUsageBannerText({
        sessionCreditsUsed: 250,
        remainingBalance: null,
        next_quota_reset: null,
      })
      expect(text).toContain('250')
    })

    test('shows remaining balance when available', () => {
      const text = generateUsageBannerText({
        sessionCreditsUsed: 100,
        remainingBalance: 500,
        next_quota_reset: null,
      })
      expect(text).toContain('500')
    })

    test('omits balance when not available', () => {
      const text = generateUsageBannerText({
        sessionCreditsUsed: 100,
        remainingBalance: null,
        next_quota_reset: null,
      })
      expect(text).not.toContain('remaining')
    })

    test('shows renewal date when available', () => {
      const text = generateUsageBannerText({
        sessionCreditsUsed: 100,
        remainingBalance: 500,
        next_quota_reset: '2025-03-15T00:00:00.000Z',
        today: new Date('2025-03-01'),
      })
      expect(text).toContain('Mar')
      expect(text).toContain('15')
    })

    test('omits renewal date when not available', () => {
      const text = generateUsageBannerText({
        sessionCreditsUsed: 100,
        remainingBalance: 500,
        next_quota_reset: null,
      })
      expect(text.toLowerCase()).not.toContain('renew')
    })
  })

  describe('shouldAutoShowBanner', () => {
    describe('when banner should NOT auto-show', () => {
      test('during active AI response chain', () => {
        const result = shouldAutoShowBanner(true, true, 50, null)
        expect(result.shouldShow).toBe(false)
        expect(result.newWarningThreshold).toBe(null)
      })

      test('when user is not authenticated', () => {
        const result = shouldAutoShowBanner(false, false, 50, null)
        expect(result.shouldShow).toBe(false)
        expect(result.newWarningThreshold).toBe(null)
      })

      test('when balance data is unavailable', () => {
        const result = shouldAutoShowBanner(false, true, null, null)
        expect(result.shouldShow).toBe(false)
        expect(result.newWarningThreshold).toBe(null)
      })

      test('when user has healthy credits (>= 1000)', () => {
        const result = shouldAutoShowBanner(false, true, 1500, null)
        expect(result.shouldShow).toBe(false)
        expect(result.newWarningThreshold).toBe(null)
      })

      test('when staying within the same threshold bucket', () => {
        // Already warned about 500, current is 400 (still in < 500 bucket and > 100)
        const result = shouldAutoShowBanner(
          false,
          true,
          400,
          500,
        )
        expect(result.shouldShow).toBe(false)
        expect(result.newWarningThreshold).toBe(500)
      })
    })

    describe('when banner SHOULD auto-show', () => {
      test('when crossing HIGH threshold (< 1000)', () => {
        const result = shouldAutoShowBanner(false, true, 999, null)
        expect(result.shouldShow).toBe(true)
        expect(result.newWarningThreshold).toBe(1000)
      })

      test('when crossing MEDIUM threshold (< 500)', () => {
        const result = shouldAutoShowBanner(false, true, 499, null)
        expect(result.shouldShow).toBe(true)
        expect(result.newWarningThreshold).toBe(500)
      })

      test('when crossing LOW threshold (< 100)', () => {
        const result = shouldAutoShowBanner(false, true, 99, null)
        expect(result.shouldShow).toBe(true)
        expect(result.newWarningThreshold).toBe(100)
      })

      test('when crossing multiple thresholds at once (e.g. dropping huge amount)', () => {
        // Dropping from >1000 to <100
        const result = shouldAutoShowBanner(false, true, 50, null)
        expect(result.shouldShow).toBe(true)
        expect(result.newWarningThreshold).toBe(100)
      })

      test('when crossing to a lower threshold than previously warned', () => {
        // Previously warned at 500, now dropped below 100
        const result = shouldAutoShowBanner(false, true, 50, 500)
        expect(result.shouldShow).toBe(true)
        expect(result.newWarningThreshold).toBe(100)
      })
    })

    describe('state reset behavior', () => {
      test('clears warning state when credits return to healthy', () => {
        const result = shouldAutoShowBanner(
          false,
          true,
          1500,
          100,
        )
        expect(result.shouldShow).toBe(false)
        expect(result.newWarningThreshold).toBe(null)
      })

      test('re-warns after refill and subsequent drop', () => {
        // First: warned about low credits
        let result = shouldAutoShowBanner(false, true, 50, null)
        expect(result.shouldShow).toBe(true)
        expect(result.newWarningThreshold).toBe(100)

        // Then: refilled
        result = shouldAutoShowBanner(false, true, 1500, result.newWarningThreshold)
        expect(result.newWarningThreshold).toBe(null) // cleared

        // Finally: dropped again - should warn again
        result = shouldAutoShowBanner(false, true, 50, result.newWarningThreshold)
        expect(result.shouldShow).toBe(true)
        expect(result.newWarningThreshold).toBe(100)
      })
    })
  })
})
