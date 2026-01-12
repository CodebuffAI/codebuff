import { describe, expect, it } from 'bun:test'

import { triggerMonthlyResetAndGrant } from '../grant-credits'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { BillingTransactionFn } from '@codebuff/common/types/contracts/billing'

const logger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago

const createMockTransaction = (options: {
  user: {
    next_quota_reset: Date | null
    auto_topup_enabled: boolean | null
  } | null
}): BillingTransactionFn => {
  const { user } = options

  return async <T>(callback: (tx: any) => Promise<T>): Promise<T> => {
    const tx = {
      query: {
        user: {
          findFirst: async () => user,
        },
      },
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
      insert: () => ({
        values: () => Promise.resolve(),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => [],
            }),
          }),
          then: (cb: any) => cb([]),
        }),
      }),
    }
    return callback(tx)
  }
}

describe('grant-credits', () => {
  describe('triggerMonthlyResetAndGrant', () => {
    describe('autoTopupEnabled return value', () => {
      it('should return autoTopupEnabled: true when user has auto_topup_enabled: true', async () => {
        const mockTransaction = createMockTransaction({
          user: {
            next_quota_reset: futureDate,
            auto_topup_enabled: true,
          },
        })

        const result = await triggerMonthlyResetAndGrant({
          userId: 'user-123',
          logger,
          deps: { transaction: mockTransaction },
        })

        expect(result.autoTopupEnabled).toBe(true)
        expect(result.quotaResetDate).toEqual(futureDate)
      })

      it('should return autoTopupEnabled: false when user has auto_topup_enabled: false', async () => {
        const mockTransaction = createMockTransaction({
          user: {
            next_quota_reset: futureDate,
            auto_topup_enabled: false,
          },
        })

        const result = await triggerMonthlyResetAndGrant({
          userId: 'user-123',
          logger,
          deps: { transaction: mockTransaction },
        })

        expect(result.autoTopupEnabled).toBe(false)
      })

      it('should default autoTopupEnabled to false when user has auto_topup_enabled: null', async () => {
        const mockTransaction = createMockTransaction({
          user: {
            next_quota_reset: futureDate,
            auto_topup_enabled: null,
          },
        })

        const result = await triggerMonthlyResetAndGrant({
          userId: 'user-123',
          logger,
          deps: { transaction: mockTransaction },
        })

        expect(result.autoTopupEnabled).toBe(false)
      })

      it('should throw error when user is not found', async () => {
        const mockTransaction = createMockTransaction({
          user: null,
        })

        await expect(
          triggerMonthlyResetAndGrant({
            userId: 'nonexistent-user',
            logger,
            deps: { transaction: mockTransaction },
          }),
        ).rejects.toThrow('User nonexistent-user not found')
      })
    })

    describe('quota reset behavior', () => {
      it('should return existing reset date when it is in the future', async () => {
        const mockTransaction = createMockTransaction({
          user: {
            next_quota_reset: futureDate,
            auto_topup_enabled: false,
          },
        })

        const result = await triggerMonthlyResetAndGrant({
          userId: 'user-123',
          logger,
          deps: { transaction: mockTransaction },
        })

        expect(result.quotaResetDate).toEqual(futureDate)
      })
    })
  })
})
