import { describe, it, expect, mock } from 'bun:test'
import {
  getUserCostPerCredit,
} from '@codebuff/billing'
import {
  convertCreditsToUsdCents,
  convertStripeGrantAmountToCredits,
} from 'common/util/currency'

describe('Credit Conversion System', () => {
  describe('getUserCostPerCredit', () => {
    it('should return 1 cent per credit for all users currently', async () => {
      const cost = await getUserCostPerCredit('test-user')
      expect(cost).toBe(1)
    })

    it('should return 1 cent per credit for test user', async () => {
      const cost = await getUserCostPerCredit('test-user-undefined-case')
      expect(cost).toBe(1)
    })
  })

  describe('convertCreditsToUsdCents', () => {
    it('should convert credits to cents correctly', () => {
      expect(convertCreditsToUsdCents(100, 1)).toBe(100) // 100 credits at 1¢ each
      expect(convertCreditsToUsdCents(50, 2)).toBe(100) // 50 credits at 2¢ each
      expect(convertCreditsToUsdCents(1000, 0.5)).toBe(500) // 1000 credits at 0.5¢ each
    })

    it('should round up to nearest cent', () => {
      expect(convertCreditsToUsdCents(3, 0.5)).toBe(2) // 1.5 rounds to 2
      expect(convertCreditsToUsdCents(1, 0.1)).toBe(1) // 0.1 rounds to 1
    })

    it('should handle zero credits', () => {
      expect(convertCreditsToUsdCents(0, 1)).toBe(0)
    })

    it('should handle fractional credit costs', () => {
      expect(convertCreditsToUsdCents(10, 0.33)).toBe(4) // 3.3 rounds to 4
    })
  })

  describe('convertStripeGrantAmountToCredits', () => {
    it('should convert Stripe amount to credits correctly', () => {
      expect(convertStripeGrantAmountToCredits(100, 1)).toBe(100) // $1.00 = 100 credits at 1¢
      expect(convertStripeGrantAmountToCredits(100, 2)).toBe(50) // $1.00 = 50 credits at 2¢
    })

    it('should handle zero amount', () => {
      expect(convertStripeGrantAmountToCredits(0, 1)).toBe(0)
    })

    it('should round down to nearest whole credit', () => {
      expect(convertStripeGrantAmountToCredits(150, 1)).toBe(150) // $1.50 = 150 credits
      expect(convertStripeGrantAmountToCredits(155, 1)).toBe(155) // $1.55 = 155 credits
    })

    it('should handle fractional credit costs', () => {
      expect(convertStripeGrantAmountToCredits(100, 0.5)).toBe(200) // $1.00 = 200 credits at 0.5¢
    })
  })
})