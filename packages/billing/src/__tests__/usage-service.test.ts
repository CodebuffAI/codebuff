import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { afterEach, describe, expect, it } from 'bun:test'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const logger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now

const mockBalance = {
  totalRemaining: 1000,
  totalDebt: 0,
  netBalance: 1000,
  breakdown: { free: 500, referral: 0, referral_legacy: 0, subscription: 0, purchase: 500, admin: 0, organization: 0, ad: 0 },
  principals: { free: 500, referral: 0, referral_legacy: 0, subscription: 0, purchase: 500, admin: 0, organization: 0, ad: 0 },
}

describe('usage-service', () => {
  afterEach(() => {
    clearMockedModules()
  })

  describe('getUserUsageData', () => {
    describe('autoTopupEnabled field', () => {
      it('should include autoTopupEnabled: true when triggerMonthlyResetAndGrant returns true', async () => {
        await mockModule('@codebuff/billing/grant-credits', () => ({
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: true,
          }),
        }))

        await mockModule('@codebuff/billing/auto-topup', () => ({
          checkAndTriggerAutoTopup: async () => undefined,
        }))

        await mockModule('@codebuff/billing/balance-calculator', () => ({
          calculateUsageAndBalance: async () => ({
            usageThisCycle: 100,
            balance: mockBalance,
          }),
        }))

        await mockModule('@codebuff/billing/subscription', () => ({
          getActiveSubscription: async () => null,
        }))

        const { getUserUsageData } = await import('@codebuff/billing/usage-service')

        const result = await getUserUsageData({
          userId: 'user-123',
          logger,
        })

        expect(result.autoTopupEnabled).toBe(true)
        expect(result.usageThisCycle).toBe(100)
        expect(result.balance).toEqual(mockBalance)
        expect(result.nextQuotaReset).toBe(futureDate.toISOString())
      })

      it('should include autoTopupEnabled: false when triggerMonthlyResetAndGrant returns false', async () => {
        await mockModule('@codebuff/billing/grant-credits', () => ({
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: false,
          }),
        }))

        await mockModule('@codebuff/billing/auto-topup', () => ({
          checkAndTriggerAutoTopup: async () => undefined,
        }))

        await mockModule('@codebuff/billing/balance-calculator', () => ({
          calculateUsageAndBalance: async () => ({
            usageThisCycle: 100,
            balance: mockBalance,
          }),
        }))

        await mockModule('@codebuff/billing/subscription', () => ({
          getActiveSubscription: async () => null,
        }))

        const { getUserUsageData } = await import('@codebuff/billing/usage-service')

        const result = await getUserUsageData({
          userId: 'user-123',
          logger,
        })

        expect(result.autoTopupEnabled).toBe(false)
      })

      it('should include autoTopupTriggered: true when auto top-up was triggered', async () => {
        await mockModule('@codebuff/billing/grant-credits', () => ({
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: true,
          }),
        }))

        await mockModule('@codebuff/billing/auto-topup', () => ({
          checkAndTriggerAutoTopup: async () => 500, // Returns amount when triggered
        }))

        await mockModule('@codebuff/billing/balance-calculator', () => ({
          calculateUsageAndBalance: async () => ({
            usageThisCycle: 100,
            balance: mockBalance,
          }),
        }))

        await mockModule('@codebuff/billing/subscription', () => ({
          getActiveSubscription: async () => null,
        }))

        const { getUserUsageData } = await import('@codebuff/billing/usage-service')

        const result = await getUserUsageData({
          userId: 'user-123',
          logger,
        })

        expect(result.autoTopupTriggered).toBe(true)
        expect(result.autoTopupEnabled).toBe(true)
      })

      it('should include autoTopupTriggered: false when auto top-up was not triggered', async () => {
        await mockModule('@codebuff/billing/grant-credits', () => ({
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: true,
          }),
        }))

        await mockModule('@codebuff/billing/auto-topup', () => ({
          checkAndTriggerAutoTopup: async () => undefined, // Returns undefined when not triggered
        }))

        await mockModule('@codebuff/billing/balance-calculator', () => ({
          calculateUsageAndBalance: async () => ({
            usageThisCycle: 100,
            balance: mockBalance,
          }),
        }))

        await mockModule('@codebuff/billing/subscription', () => ({
          getActiveSubscription: async () => null,
        }))

        const { getUserUsageData } = await import('@codebuff/billing/usage-service')

        const result = await getUserUsageData({
          userId: 'user-123',
          logger,
        })

        expect(result.autoTopupTriggered).toBe(false)
      })

      it('should continue and return data even when auto top-up check fails', async () => {
        await mockModule('@codebuff/billing/grant-credits', () => ({
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: true,
          }),
        }))

        await mockModule('@codebuff/billing/auto-topup', () => ({
          checkAndTriggerAutoTopup: async () => {
            throw new Error('Payment failed')
          },
        }))

        await mockModule('@codebuff/billing/balance-calculator', () => ({
          calculateUsageAndBalance: async () => ({
            usageThisCycle: 100,
            balance: mockBalance,
          }),
        }))

        await mockModule('@codebuff/billing/subscription', () => ({
          getActiveSubscription: async () => null,
        }))

        const { getUserUsageData } = await import('@codebuff/billing/usage-service')

        // Should not throw
        const result = await getUserUsageData({
          userId: 'user-123',
          logger,
        })

        expect(result.autoTopupTriggered).toBe(false)
        expect(result.autoTopupEnabled).toBe(true)
        expect(result.balance).toEqual(mockBalance)
      })
    })
  })
})
