import { describe, test, expect } from 'bun:test'

import { UserState } from '@codebuff/common/old-constants'

import {
  getBannerColorLevel,
  generateUsageBannerText,
  generateLoadingBannerText,
  shouldAutoShowBanner,
} from '../usage-banner-state'

describe('usage-banner-state', () => {
  describe('getBannerColorLevel', () => {
    test('shows success for healthy credit balance (>= 1000)', () => {
      expect(getBannerColorLevel(1000)).toBe('success')
      expect(getBannerColorLevel(5000)).toBe('success')
    })

    test('shows warning for moderate credit balance (100-999)', () => {
      expect(getBannerColorLevel(999)).toBe('warning')
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
      })

      test('when user is not authenticated', () => {
        const result = shouldAutoShowBanner(false, false, 50, null)
        expect(result.shouldShow).toBe(false)
      })

      test('when balance data is unavailable', () => {
        const result = shouldAutoShowBanner(false, true, null, null)
        expect(result.shouldShow).toBe(false)
      })

      test('when user has healthy credits (>= 100)', () => {
        const result = shouldAutoShowBanner(false, true, 500, null)
        expect(result.shouldShow).toBe(false)
      })

      test('when already warned about current state', () => {
        const result = shouldAutoShowBanner(
          false,
          true,
          50,
          UserState.ATTENTION_NEEDED,
        )
        expect(result.shouldShow).toBe(false)
      })
    })

    describe('when banner SHOULD auto-show', () => {
      test('when first dropping below 100 credits', () => {
        const result = shouldAutoShowBanner(false, true, 99, null)
        expect(result.shouldShow).toBe(true)
        expect(result.newWarningState).toBe(UserState.ATTENTION_NEEDED)
      })

      test('when dropping into critical range (< 20)', () => {
        const result = shouldAutoShowBanner(
          false,
          true,
          19,
          UserState.ATTENTION_NEEDED,
        )
        expect(result.shouldShow).toBe(true)
        expect(result.newWarningState).toBe(UserState.CRITICAL)
      })

      test('when credits are depleted', () => {
        const result = shouldAutoShowBanner(false, true, 0, UserState.CRITICAL)
        expect(result.shouldShow).toBe(true)
        expect(result.newWarningState).toBe(UserState.DEPLETED)
      })
    })

    describe('state reset behavior', () => {
      test('clears warning state when credits return to healthy', () => {
        const result = shouldAutoShowBanner(
          false,
          true,
          500,
          UserState.CRITICAL,
        )
        expect(result.newWarningState).toBe(null)
      })

      test('re-warns after refill and subsequent drop', () => {
        // First: warned about low credits
        let result = shouldAutoShowBanner(false, true, 50, null)
        expect(result.shouldShow).toBe(true)

        // Then: refilled
        result = shouldAutoShowBanner(false, true, 500, result.newWarningState)
        expect(result.newWarningState).toBe(null)

        // Finally: dropped again - should warn again
        result = shouldAutoShowBanner(false, true, 50, result.newWarningState)
        expect(result.shouldShow).toBe(true)
      })
    })
  })
})
