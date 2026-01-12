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
  })
})
