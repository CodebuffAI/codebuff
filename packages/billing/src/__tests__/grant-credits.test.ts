import { describe, expect, it } from 'bun:test'

import {
  triggerMonthlyResetAndGrant,
  grantCreditOperation,
  revokeGrantByOperationId,
  getPreviousFreeGrantAmount,
  calculateTotalReferralBonus,
  processAndGrantCredit,
} from '../grant-credits'

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

type MockTransactionOptions = {
  user: {
    next_quota_reset: Date | null
    auto_topup_enabled: boolean | null
  } | null
  grants?: Array<{
    operation_id: string
    user_id: string
    principal: number
    balance: number
    type: string
    expires_at: Date | null
  }>
  expiredGrants?: Array<{
    principal: number
    expires_at: Date
  }>
  referralTotal?: number
  onInsert?: (values: any) => void
  onUpdate?: (values: any) => void
}

const createMockTransaction = (options: MockTransactionOptions): BillingTransactionFn => {
  const {
    user,
    grants = [],
    expiredGrants = [],
    referralTotal = 0,
    onInsert,
    onUpdate,
  } = options

  return async <T>(callback: (tx: any) => Promise<T>): Promise<T> => {
    const tx = {
      query: {
        user: {
          findFirst: async () => user,
        },
        creditLedger: {
          findFirst: async (params: any) => {
            // For revoke tests - find by operation_id
            if (params?.where) {
              return grants[0] ?? null
            }
            return null
          },
        },
      },
      update: () => ({
        set: (values: any) => ({
          where: () => {
            onUpdate?.(values)
            return Promise.resolve()
          },
        }),
      }),
      insert: () => ({
        values: (values: any) => {
          onInsert?.(values)
          return Promise.resolve()
        },
      }),
      select: (fields?: any) => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => expiredGrants,
            }),
            then: (cb: any) => {
              // For checking negative balances - filter grants with balance < 0
              const negativeGrants = grants.filter(g => g.balance < 0)
              return cb(negativeGrants)
            },
          }),
          then: (cb: any) => {
            // For referral query
            if (fields && 'totalCredits' in fields) {
              return cb([{ totalCredits: referralTotal.toString() }])
            }
            return cb([])
          },
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

      // Note: Tests for quota reset with past date require mocking getPreviousFreeGrantAmount
      // and calculateTotalReferralBonus which query the database directly (outside the transaction).
      // These functions would need DI support to be unit testable.
      // For now, this scenario is better tested via integration tests.
    })
  })

  describe('grantCreditOperation', () => {
    describe('debt settlement', () => {
      it('should settle debt when granting new credits', async () => {
        const insertedGrants: any[] = []
        const updatedValues: any[] = []

        // Create a mock tx with negative balance grant
        const mockTx = {
          query: {
            creditLedger: {
              findFirst: async () => null,
            },
          },
          select: () => ({
            from: () => ({
              where: () => ({
                then: (cb: any) =>
                  cb([
                    {
                      operation_id: 'debt-grant-1',
                      user_id: 'user-123',
                      balance: -200, // Debt of 200 credits
                      type: 'free',
                    },
                  ]),
              }),
            }),
          }),
          update: () => ({
            set: (values: any) => ({
              where: () => {
                updatedValues.push(values)
                return Promise.resolve()
              },
            }),
          }),
          insert: () => ({
            values: (values: any) => {
              insertedGrants.push(values)
              return Promise.resolve()
            },
          }),
        }

        await grantCreditOperation({
          userId: 'user-123',
          amount: 500,
          type: 'free',
          description: 'Monthly free credits',
          expiresAt: futureDate,
          operationId: 'new-grant-1',
          tx: mockTx as any,
          logger,
        })

        // Should have zeroed out the debt
        expect(updatedValues.length).toBeGreaterThan(0)
        expect(updatedValues[0].balance).toBe(0)

        // Should have created a new grant with reduced balance
        expect(insertedGrants.length).toBe(1)
        expect(insertedGrants[0].principal).toBe(500)
        expect(insertedGrants[0].balance).toBe(300) // 500 - 200 debt
        expect(insertedGrants[0].description).toContain('200 credits used to clear existing debt')
      })

      it('should create grant with full balance when no debt exists', async () => {
        const insertedGrants: any[] = []

        const mockTx = {
          query: {
            creditLedger: {
              findFirst: async () => null,
            },
          },
          select: () => ({
            from: () => ({
              where: () => ({
                then: (cb: any) => cb([]), // No negative balance grants
              }),
            }),
          }),
          update: () => ({
            set: () => ({
              where: () => Promise.resolve(),
            }),
          }),
          insert: () => ({
            values: (values: any) => {
              insertedGrants.push(values)
              return Promise.resolve()
            },
          }),
        }

        await grantCreditOperation({
          userId: 'user-123',
          amount: 500,
          type: 'free',
          description: 'Monthly free credits',
          expiresAt: futureDate,
          operationId: 'new-grant-1',
          tx: mockTx as any,
          logger,
        })

        // Should have created a new grant with full balance (no debt to deduct)
        expect(insertedGrants.length).toBe(1)
        expect(insertedGrants[0].principal).toBe(500)
        expect(insertedGrants[0].balance).toBe(500)
        expect(insertedGrants[0].description).toBe('Monthly free credits')
      })

      it('should not create grant when debt exceeds amount', async () => {
        const insertedGrants: any[] = []
        const updatedValues: any[] = []

        const mockTx = {
          query: {
            creditLedger: {
              findFirst: async () => null,
            },
          },
          select: () => ({
            from: () => ({
              where: () => ({
                then: (cb: any) =>
                  cb([
                    {
                      operation_id: 'debt-grant-1',
                      user_id: 'user-123',
                      balance: -1000, // Debt exceeds grant amount
                      type: 'free',
                    },
                  ]),
              }),
            }),
          }),
          update: () => ({
            set: (values: any) => ({
              where: () => {
                updatedValues.push(values)
                return Promise.resolve()
              },
            }),
          }),
          insert: () => ({
            values: (values: any) => {
              insertedGrants.push(values)
              return Promise.resolve()
            },
          }),
        }

        await grantCreditOperation({
          userId: 'user-123',
          amount: 500, // Less than debt
          type: 'free',
          description: 'Monthly free credits',
          expiresAt: futureDate,
          operationId: 'new-grant-1',
          tx: mockTx as any,
          logger,
        })

        // Should have zeroed out the debt
        expect(updatedValues.length).toBe(1)
        expect(updatedValues[0].balance).toBe(0)

        // Should NOT create a new grant since remainingAmount would be 0
        expect(insertedGrants.length).toBe(0)
      })
    })
  })

  describe('getPreviousFreeGrantAmount', () => {
    it('should return default amount when no expired grants exist', async () => {
      // The select().from().where().orderBy().limit() chain returns a promise-like
      // array in Drizzle, so we need to make it thenable
      const emptyResult: { principal: number }[] = []
      // @ts-expect-error - adding then to make it promise-like
      emptyResult.then = (cb: (rows: typeof emptyResult) => unknown) => Promise.resolve(cb(emptyResult))
      
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => emptyResult,
              }),
            }),
          }),
        }),
      }

      const result = await getPreviousFreeGrantAmount({
        userId: 'user-new',
        logger,
        deps: { db: mockDb as any },
      })

      // Default free credits grant is 1000
      expect(result).toBe(1000)
    })

    it('should return capped amount from previous expired grant', async () => {
      const grantResult = [{ principal: 3000 }]
      // @ts-expect-error - adding then to make it promise-like
      grantResult.then = (cb: (rows: typeof grantResult) => unknown) => Promise.resolve(cb(grantResult))
      
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => grantResult,
              }),
            }),
          }),
        }),
      }

      const result = await getPreviousFreeGrantAmount({
        userId: 'user-high-grant',
        logger,
        deps: { db: mockDb as any },
      })

      // Should be capped at 2000
      expect(result).toBe(2000)
    })

    it('should return exact amount when previous grant was below cap', async () => {
      const grantResult = [{ principal: 1500 }]
      // @ts-expect-error - adding then to make it promise-like
      grantResult.then = (cb: (rows: typeof grantResult) => unknown) => Promise.resolve(cb(grantResult))
      
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => grantResult,
              }),
            }),
          }),
        }),
      }

      const result = await getPreviousFreeGrantAmount({
        userId: 'user-normal-grant',
        logger,
        deps: { db: mockDb as any },
      })

      expect(result).toBe(1500)
    })
  })

  describe('calculateTotalReferralBonus', () => {
    it('should return 0 when no referrals exist', async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () =>
              Promise.resolve([{ totalCredits: '0' }]),
          }),
        }),
      }

      const result = await calculateTotalReferralBonus({
        userId: 'user-no-referrals',
        logger,
        deps: { db: mockDb as any },
      })

      expect(result).toBe(0)
    })

    it('should return sum of referral credits', async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () =>
              Promise.resolve([{ totalCredits: '500' }]),
          }),
        }),
      }

      const result = await calculateTotalReferralBonus({
        userId: 'user-with-referrals',
        logger,
        deps: { db: mockDb as any },
      })

      expect(result).toBe(500)
    })

    it('should return 0 on database error', async () => {
      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => {
              throw new Error('Database error')
            },
          }),
        }),
      }

      const result = await calculateTotalReferralBonus({
        userId: 'user-db-error',
        logger,
        deps: { db: mockDb as any },
      })

      expect(result).toBe(0)
    })
  })

  describe('processAndGrantCredit', () => {
    it('should call grantCreditOperation with correct params', async () => {
      let capturedParams: any = null
      const mockGrantCreditFn = async (params: any) => {
        capturedParams = params
      }

      await processAndGrantCredit({
        userId: 'user-123',
        amount: 500,
        type: 'purchase',
        description: 'Test grant',
        expiresAt: null,
        operationId: 'op-123',
        logger,
        deps: { grantCreditFn: mockGrantCreditFn as any },
      })

      expect(capturedParams.userId).toBe('user-123')
      expect(capturedParams.amount).toBe(500)
      expect(capturedParams.type).toBe('purchase')
      expect(capturedParams.description).toBe('Test grant')
      expect(capturedParams.operationId).toBe('op-123')
    })

    it('should log sync failure on error', async () => {
      let syncFailureLogged = false
      const mockLogSyncFailure = async () => {
        syncFailureLogged = true
      }

      const mockGrantCreditFn = async () => {
        throw new Error('Grant failed')
      }

      await expect(
        processAndGrantCredit({
          userId: 'user-123',
          amount: 500,
          type: 'purchase',
          description: 'Test grant',
          expiresAt: null,
          operationId: 'op-fail',
          logger,
          deps: {
            grantCreditFn: mockGrantCreditFn as any,
            logSyncFailureFn: mockLogSyncFailure as any,
          },
        }),
      ).rejects.toThrow('Grant failed')

      expect(syncFailureLogged).toBe(true)
    })
  })

  describe('revokeGrantByOperationId', () => {
    it('should successfully revoke a grant with positive balance', async () => {
      const updatedValues: any[] = []

      const mockTransaction: BillingTransactionFn = async (callback) => {
        const tx = {
          query: {
            creditLedger: {
              findFirst: async () => ({
                operation_id: 'grant-to-revoke',
                user_id: 'user-123',
                principal: 500,
                balance: 300, // 200 already consumed
                type: 'purchase',
                description: 'Purchased 500 credits',
              }),
            },
          },
          update: () => ({
            set: (values: any) => ({
              where: () => {
                updatedValues.push(values)
                return Promise.resolve()
              },
            }),
          }),
        }
        return callback(tx)
      }

      const result = await revokeGrantByOperationId({
        operationId: 'grant-to-revoke',
        reason: 'Test refund',
        logger,
        deps: { transaction: mockTransaction },
      })

      expect(result).toBe(true)
      expect(updatedValues.length).toBe(1)
      expect(updatedValues[0].principal).toBe(0)
      expect(updatedValues[0].balance).toBe(0)
      expect(updatedValues[0].description).toContain('Revoked: Test refund')
    })

    it('should return false when grant does not exist', async () => {
      const mockTransaction: BillingTransactionFn = async (callback) => {
        const tx = {
          query: {
            creditLedger: {
              findFirst: async () => null, // Grant not found
            },
          },
          update: () => ({
            set: () => ({
              where: () => Promise.resolve(),
            }),
          }),
        }
        return callback(tx)
      }

      const result = await revokeGrantByOperationId({
        operationId: 'non-existent-grant',
        reason: 'Test refund',
        logger,
        deps: { transaction: mockTransaction },
      })

      expect(result).toBe(false)
    })

    it('should return false when grant has negative balance', async () => {
      const mockTransaction: BillingTransactionFn = async (callback) => {
        const tx = {
          query: {
            creditLedger: {
              findFirst: async () => ({
                operation_id: 'debt-grant',
                user_id: 'user-123',
                principal: 500,
                balance: -100, // User has overspent
                type: 'free',
                description: 'Monthly free credits',
              }),
            },
          },
          update: () => ({
            set: () => ({
              where: () => Promise.resolve(),
            }),
          }),
        }
        return callback(tx)
      }

      const result = await revokeGrantByOperationId({
        operationId: 'debt-grant',
        reason: 'Test refund',
        logger,
        deps: { transaction: mockTransaction },
      })

      expect(result).toBe(false)
    })

    it('should successfully revoke a grant with zero balance', async () => {
      const updatedValues: any[] = []

      const mockTransaction: BillingTransactionFn = async (callback) => {
        const tx = {
          query: {
            creditLedger: {
              findFirst: async () => ({
                operation_id: 'depleted-grant',
                user_id: 'user-123',
                principal: 500,
                balance: 0, // Fully consumed
                type: 'free',
                description: 'Monthly free credits',
              }),
            },
          },
          update: () => ({
            set: (values: any) => ({
              where: () => {
                updatedValues.push(values)
                return Promise.resolve()
              },
            }),
          }),
        }
        return callback(tx)
      }

      // Balance of 0 is not negative, so it can be revoked (nothing to actually revoke though)
      const result = await revokeGrantByOperationId({
        operationId: 'depleted-grant',
        reason: 'Test refund',
        logger,
        deps: { transaction: mockTransaction },
      })

      expect(result).toBe(true)
      expect(updatedValues.length).toBe(1)
      expect(updatedValues[0].principal).toBe(0)
      expect(updatedValues[0].balance).toBe(0)
    })
  })
})
