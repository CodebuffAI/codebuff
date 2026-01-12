import { describe, expect, it } from 'bun:test'

import { getUserUsageDataWithDeps } from '../usage-service'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { UsageServiceDeps } from '@codebuff/common/types/contracts/billing'
import type { GrantType } from '@codebuff/common/types/grant'

const logger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now

const createMockBalance = () => {
  const breakdown: Record<GrantType, number> = {
    free: 500,
    purchase: 500,
    referral: 0,
    admin: 0,
    organization: 0,
    ad: 0,
  }
  const principals: Record<GrantType, number> = {
    free: 500,
    purchase: 500,
    referral: 0,
    admin: 0,
    organization: 0,
    ad: 0,
  }
  return {
    totalRemaining: 1000,
    totalDebt: 0,
    netBalance: 1000,
    breakdown,
    principals,
  }
}

describe('usage-service', () => {
  describe('getUserUsageDataWithDeps', () => {
    describe('autoTopupEnabled field', () => {
      it('should include autoTopupEnabled: true when triggerMonthlyResetAndGrant returns true', async () => {
        const mockBalance = createMockBalance()
        const deps: UsageServiceDeps = {
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: true,
          }),
          checkAndTriggerAutoTopup: async () => undefined,
          calculateUsageAndBalance: async () => ({
            usageThisCycle: 100,
            balance: mockBalance,
          }),
        }

        const result = await getUserUsageDataWithDeps({
          userId: 'user-123',
          logger,
          deps,
        })

        expect(result.autoTopupEnabled).toBe(true)
        expect(result.usageThisCycle).toBe(100)
        expect(result.balance).toEqual(mockBalance)
        expect(result.nextQuotaReset).toBe(futureDate.toISOString())
      })

      it('should include autoTopupEnabled: false when triggerMonthlyResetAndGrant returns false', async () => {
        const mockBalance = createMockBalance()
        const deps: UsageServiceDeps = {
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: false,
          }),
          checkAndTriggerAutoTopup: async () => undefined,
          calculateUsageAndBalance: async () => ({
            usageThisCycle: 100,
            balance: mockBalance,
          }),
        }

        const result = await getUserUsageDataWithDeps({
          userId: 'user-123',
          logger,
          deps,
        })

        expect(result.autoTopupEnabled).toBe(false)
      })

      it('should include autoTopupTriggered: true when auto top-up was triggered', async () => {
        const mockBalance = createMockBalance()
        const deps: UsageServiceDeps = {
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: true,
          }),
          checkAndTriggerAutoTopup: async () => 500, // Returns amount when triggered
          calculateUsageAndBalance: async () => ({
            usageThisCycle: 100,
            balance: mockBalance,
          }),
        }

        const result = await getUserUsageDataWithDeps({
          userId: 'user-123',
          logger,
          deps,
        })

        expect(result.autoTopupTriggered).toBe(true)
        expect(result.autoTopupEnabled).toBe(true)
      })

      it('should include autoTopupTriggered: false when auto top-up was not triggered', async () => {
        const mockBalance = createMockBalance()
        const deps: UsageServiceDeps = {
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: true,
          }),
          checkAndTriggerAutoTopup: async () => undefined, // Returns undefined when not triggered
          calculateUsageAndBalance: async () => ({
            usageThisCycle: 100,
            balance: mockBalance,
          }),
        }

        const result = await getUserUsageDataWithDeps({
          userId: 'user-123',
          logger,
          deps,
        })

        expect(result.autoTopupTriggered).toBe(false)
      })

      it('should continue and return data even when auto top-up check fails', async () => {
        const mockBalance = createMockBalance()
        const deps: UsageServiceDeps = {
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: true,
          }),
          checkAndTriggerAutoTopup: async () => {
            throw new Error('Payment failed')
          },
          calculateUsageAndBalance: async () => ({
            usageThisCycle: 100,
            balance: mockBalance,
          }),
        }

        // Should not throw
        const result = await getUserUsageDataWithDeps({
          userId: 'user-123',
          logger,
          deps,
        })

        expect(result.autoTopupTriggered).toBe(false)
        expect(result.autoTopupEnabled).toBe(true)
        expect(result.balance).toEqual(mockBalance)
      })
    })

    describe('balance calculation', () => {
      it('should return balance breakdown with multiple grant types', async () => {
        const mixedBreakdown: Record<GrantType, number> = {
          free: 300,
          purchase: 500,
          referral: 200,
          admin: 100,
          organization: 0, // Excluded in personal context
          ad: 50,
        }
        const mixedPrincipals: Record<GrantType, number> = {
          free: 500,
          purchase: 500,
          referral: 200,
          admin: 100,
          organization: 0,
          ad: 50,
        }
        const mixedBalance = {
          totalRemaining: 1150,
          totalDebt: 0,
          netBalance: 1150,
          breakdown: mixedBreakdown,
          principals: mixedPrincipals,
        }

        const deps: UsageServiceDeps = {
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: false,
          }),
          checkAndTriggerAutoTopup: async () => undefined,
          calculateUsageAndBalance: async () => ({
            usageThisCycle: 350,
            balance: mixedBalance,
          }),
        }

        const result = await getUserUsageDataWithDeps({
          userId: 'user-123',
          logger,
          deps,
        })

        expect(result.balance.totalRemaining).toBe(1150)
        expect(result.balance.breakdown.free).toBe(300)
        expect(result.balance.breakdown.purchase).toBe(500)
        expect(result.balance.breakdown.referral).toBe(200)
        expect(result.balance.breakdown.admin).toBe(100)
        expect(result.balance.breakdown.ad).toBe(50)
        expect(result.usageThisCycle).toBe(350)
      })

      it('should return balance with debt when user has overspent', async () => {
        const debtBreakdown: Record<GrantType, number> = {
          free: 0,
          purchase: 0,
          referral: 0,
          admin: 0,
          organization: 0,
          ad: 0,
        }
        const debtBalance = {
          totalRemaining: 0,
          totalDebt: 150,
          netBalance: -150,
          breakdown: debtBreakdown,
          principals: debtBreakdown,
        }

        const deps: UsageServiceDeps = {
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: false,
          }),
          checkAndTriggerAutoTopup: async () => undefined,
          calculateUsageAndBalance: async () => ({
            usageThisCycle: 1150,
            balance: debtBalance,
          }),
        }

        const result = await getUserUsageDataWithDeps({
          userId: 'user-123',
          logger,
          deps,
        })

        expect(result.balance.totalRemaining).toBe(0)
        expect(result.balance.totalDebt).toBe(150)
        expect(result.balance.netBalance).toBe(-150)
      })

      it('should pass isPersonalContext: true to exclude organization credits', async () => {
        let capturedParams: any = null
        const mockBalance = createMockBalance()

        const deps: UsageServiceDeps = {
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: false,
          }),
          checkAndTriggerAutoTopup: async () => undefined,
          calculateUsageAndBalance: async (params) => {
            capturedParams = params
            return {
              usageThisCycle: 100,
              balance: mockBalance,
            }
          },
        }

        await getUserUsageDataWithDeps({
          userId: 'user-123',
          logger,
          deps,
        })

        expect(capturedParams).not.toBeNull()
        expect(capturedParams.isPersonalContext).toBe(true)
        expect(capturedParams.userId).toBe('user-123')
      })
    })

    describe('error handling', () => {
      it('should throw when triggerMonthlyResetAndGrant fails', async () => {
        const deps: UsageServiceDeps = {
          triggerMonthlyResetAndGrant: async () => {
            throw new Error('User not found')
          },
          checkAndTriggerAutoTopup: async () => undefined,
          calculateUsageAndBalance: async () => ({
            usageThisCycle: 0,
            balance: createMockBalance(),
          }),
        }

        await expect(
          getUserUsageDataWithDeps({
            userId: 'nonexistent-user',
            logger,
            deps,
          }),
        ).rejects.toThrow('User not found')
      })

      it('should throw when calculateUsageAndBalance fails', async () => {
        const deps: UsageServiceDeps = {
          triggerMonthlyResetAndGrant: async () => ({
            quotaResetDate: futureDate,
            autoTopupEnabled: false,
          }),
          checkAndTriggerAutoTopup: async () => undefined,
          calculateUsageAndBalance: async () => {
            throw new Error('Database connection failed')
          },
        }

        await expect(
          getUserUsageDataWithDeps({
            userId: 'user-123',
            logger,
            deps,
          }),
        ).rejects.toThrow('Database connection failed')
      })
    })
  })
})
