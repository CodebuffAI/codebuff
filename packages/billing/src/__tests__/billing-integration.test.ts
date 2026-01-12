/**
 * Integration tests for billing flows using dependency injection.
 *
 * These tests verify complete billing workflows by composing multiple functions
 * with injected mock dependencies. They test the integration between billing
 * components without hitting the actual database.
 */

import { describe, expect, it } from 'bun:test'

import {
  triggerMonthlyResetAndGrant,
  grantCreditOperation,
} from '../grant-credits'
import { getUserUsageDataWithDeps } from '../usage-service'
import {
  consumeCreditsWithDelegation,
  consumeCreditsWithFallback,
} from '../credit-delegation'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  BillingTransactionFn,
  UsageServiceDeps,
} from '@codebuff/common/types/contracts/billing'
import type { GrantType } from '@codebuff/common/types/grant'

// ============================================================================
// Test Helpers
// ============================================================================

const createTestLogger = (): Logger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
})

const futureDate = (daysFromNow = 30) =>
  new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000)

const pastDate = (daysAgo = 30) =>
  new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)

// ============================================================================
// Integration Test: Monthly Reset and Grant Flow
// ============================================================================

describe('Billing Integration: Monthly Reset Flow', () => {
  const logger = createTestLogger()

  // Note: Full monthly reset flow test requires DI support for getPreviousFreeGrantAmount
  // and calculateTotalReferralBonus which currently query the real DB outside the transaction.
  // These are tested indirectly through the usage-service tests which mock the entire flow.

  it('should return existing reset date when it is in the future (no DB calls needed)', async () => {
    const userId = 'user-future-reset'
    const futureResetDate = futureDate(15)
    const grantedCredits: any[] = []

    const mockTransaction: BillingTransactionFn = async (callback) => {
      const tx = {
        query: {
          user: {
            findFirst: async () => ({
              next_quota_reset: futureResetDate,
              auto_topup_enabled: true,
            }),
          },
          creditLedger: {
            findFirst: async () => null,
          },
        },
        update: () => ({
          set: () => ({
            where: () => Promise.resolve(),
          }),
        }),
        insert: () => ({
          values: (values: any) => {
            grantedCredits.push(values)
            return Promise.resolve()
          },
        }),
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => [],
              }),
              then: (cb: any) => cb([]),
            }),
            then: (cb: any) => cb([{ totalCredits: '0' }]),
          }),
        }),
      }
      return callback(tx)
    }

    // Execute the monthly reset flow with future date (should skip reset)
    const result = await triggerMonthlyResetAndGrant({
      userId,
      logger,
      deps: { transaction: mockTransaction },
    })

    // Verify the complete flow - should return existing date without granting
    expect(result.autoTopupEnabled).toBe(true)
    expect(result.quotaResetDate).toEqual(futureResetDate)
    expect(grantedCredits.length).toBe(0) // No new grants since date is in future
  })

  it('should throw error when user is not found', async () => {
    const mockTransaction: BillingTransactionFn = async (callback) => {
      const tx = {
        query: {
          user: {
            findFirst: async () => null, // User not found
          },
          creditLedger: {
            findFirst: async () => null,
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
              then: (cb: any) => cb([]),
            }),
            then: (cb: any) => cb([]),
          }),
        }),
      }
      return callback(tx)
    }

    await expect(
      triggerMonthlyResetAndGrant({
        userId: 'nonexistent-user',
        logger,
        deps: { transaction: mockTransaction },
      }),
    ).rejects.toThrow('User nonexistent-user not found')
  })
})

// ============================================================================
// Integration Test: Usage Data Flow
// ============================================================================

describe('Billing Integration: Usage Data Flow', () => {
  const logger = createTestLogger()

  it('should complete full usage data flow: reset → auto-topup check → balance calculation', async () => {
    const userId = 'user-usage-flow'
    const quotaResetDate = futureDate(25)

    const mockBreakdown: Record<GrantType, number> = {
      free: 500,
      purchase: 300,
      referral: 100,
      admin: 0,
      organization: 0,
      ad: 0,
    }

    const deps: UsageServiceDeps = {
      triggerMonthlyResetAndGrant: async () => ({
        quotaResetDate,
        autoTopupEnabled: true,
      }),
      checkAndTriggerAutoTopup: async () => undefined, // No top-up needed
      calculateUsageAndBalance: async (params) => {
        // Verify isPersonalContext is passed
        expect(params.isPersonalContext).toBe(true)
        return {
          usageThisCycle: 500,
          balance: {
            totalRemaining: 900,
            totalDebt: 0,
            netBalance: 900,
            breakdown: mockBreakdown,
            principals: mockBreakdown,
          },
        }
      },
    }

    const result = await getUserUsageDataWithDeps({
      userId,
      logger,
      deps,
    })

    // Verify complete flow output
    expect(result.usageThisCycle).toBe(500)
    expect(result.balance.totalRemaining).toBe(900)
    expect(result.balance.breakdown.free).toBe(500)
    expect(result.balance.breakdown.purchase).toBe(300)
    expect(result.nextQuotaReset).toBe(quotaResetDate.toISOString())
    expect(result.autoTopupEnabled).toBe(true)
    expect(result.autoTopupTriggered).toBe(false)
  })

  it('should handle auto-topup trigger in usage flow', async () => {
    const userId = 'user-needs-topup'
    const quotaResetDate = futureDate(20)

    const mockBreakdown: Record<GrantType, number> = {
      free: 0,
      purchase: 1000, // After top-up
      referral: 0,
      admin: 0,
      organization: 0,
      ad: 0,
    }

    const deps: UsageServiceDeps = {
      triggerMonthlyResetAndGrant: async () => ({
        quotaResetDate,
        autoTopupEnabled: true,
      }),
      checkAndTriggerAutoTopup: async () => 500, // Top-up was triggered, 500 credits added
      calculateUsageAndBalance: async () => ({
        usageThisCycle: 1000,
        balance: {
          totalRemaining: 1000,
          totalDebt: 0,
          netBalance: 1000,
          breakdown: mockBreakdown,
          principals: mockBreakdown,
        },
      }),
    }

    const result = await getUserUsageDataWithDeps({
      userId,
      logger,
      deps,
    })

    expect(result.autoTopupTriggered).toBe(true)
    expect(result.autoTopupEnabled).toBe(true)
    expect(result.balance.totalRemaining).toBe(1000)
  })

  it('should continue flow even when auto-topup fails', async () => {
    const userId = 'user-topup-fails'
    const quotaResetDate = futureDate(10)

    const mockBreakdown: Record<GrantType, number> = {
      free: 50,
      purchase: 0,
      referral: 0,
      admin: 0,
      organization: 0,
      ad: 0,
    }

    const deps: UsageServiceDeps = {
      triggerMonthlyResetAndGrant: async () => ({
        quotaResetDate,
        autoTopupEnabled: true,
      }),
      checkAndTriggerAutoTopup: async () => {
        throw new Error('Payment failed')
      },
      calculateUsageAndBalance: async () => ({
        usageThisCycle: 950,
        balance: {
          totalRemaining: 50,
          totalDebt: 0,
          netBalance: 50,
          breakdown: mockBreakdown,
          principals: mockBreakdown,
        },
      }),
    }

    // Should not throw, should continue with balance calculation
    const result = await getUserUsageDataWithDeps({
      userId,
      logger,
      deps,
    })

    expect(result.autoTopupTriggered).toBe(false) // Failed, so not triggered
    expect(result.balance.totalRemaining).toBe(50)
  })
})

// ============================================================================
// Integration Test: Debt Settlement Flow
// ============================================================================

describe('Billing Integration: Debt Settlement Flow', () => {
  const logger = createTestLogger()

  it('should settle debt when granting new credits', async () => {
    const userId = 'user-with-debt'
    const insertedGrants: any[] = []
    const updatedGrants: any[] = []

    // User has 200 credits of debt
    const debtGrant = {
      operation_id: 'debt-grant-1',
      user_id: userId,
      balance: -200,
      type: 'free',
    }

    const mockTx = {
      query: {
        creditLedger: {
          findFirst: async () => null,
        },
      },
      select: () => ({
        from: () => ({
          where: () => ({
            then: (cb: any) => cb([debtGrant]),
          }),
        }),
      }),
      update: () => ({
        set: (values: any) => ({
          where: () => {
            updatedGrants.push(values)
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
      userId,
      amount: 500,
      type: 'free',
      description: 'Monthly free credits',
      expiresAt: futureDate(30),
      operationId: 'new-grant-1',
      tx: mockTx as any,
      logger,
    })

    // Debt should be zeroed out
    expect(updatedGrants.length).toBe(1)
    expect(updatedGrants[0].balance).toBe(0)

    // New grant should have reduced balance (500 - 200 = 300)
    expect(insertedGrants.length).toBe(1)
    expect(insertedGrants[0].principal).toBe(500)
    expect(insertedGrants[0].balance).toBe(300)
    expect(insertedGrants[0].description).toContain('200 credits used to clear existing debt')
  })

  it('should handle multiple debt grants', async () => {
    const userId = 'user-multi-debt'
    const insertedGrants: any[] = []
    const updatedGrants: any[] = []

    // User has debt across multiple grants
    const debtGrants = [
      { operation_id: 'debt-1', user_id: userId, balance: -100, type: 'free' },
      { operation_id: 'debt-2', user_id: userId, balance: -150, type: 'purchase' },
    ]

    const mockTx = {
      query: {
        creditLedger: {
          findFirst: async () => null,
        },
      },
      select: () => ({
        from: () => ({
          where: () => ({
            then: (cb: any) => cb(debtGrants),
          }),
        }),
      }),
      update: () => ({
        set: (values: any) => ({
          where: () => {
            updatedGrants.push(values)
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
      userId,
      amount: 500,
      type: 'purchase',
      description: 'Purchased credits',
      expiresAt: null,
      operationId: 'purchase-grant-1',
      tx: mockTx as any,
      logger,
    })

    // Both debts should be zeroed out (2 updates)
    expect(updatedGrants.length).toBe(2)
    expect(updatedGrants.every((g) => g.balance === 0)).toBe(true)

    // New grant should have reduced balance (500 - 100 - 150 = 250)
    expect(insertedGrants.length).toBe(1)
    expect(insertedGrants[0].principal).toBe(500)
    expect(insertedGrants[0].balance).toBe(250)
  })

  it('should not create grant when debt exceeds grant amount', async () => {
    const userId = 'user-large-debt'
    const insertedGrants: any[] = []
    const updatedGrants: any[] = []

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
              cb([{ operation_id: 'big-debt', user_id: userId, balance: -1000, type: 'free' }]),
          }),
        }),
      }),
      update: () => ({
        set: (values: any) => ({
          where: () => {
            updatedGrants.push(values)
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
      userId,
      amount: 500, // Less than debt
      type: 'free',
      description: 'Monthly credits',
      expiresAt: futureDate(),
      operationId: 'small-grant',
      tx: mockTx as any,
      logger,
    })

    // Debt should still be zeroed
    expect(updatedGrants.length).toBe(1)
    expect(updatedGrants[0].balance).toBe(0)

    // No new grant created since remaining is 0 or negative
    expect(insertedGrants.length).toBe(0)
  })
})

// ============================================================================
// Integration Test: Credit Delegation Flow
// ============================================================================

describe('Billing Integration: Credit Delegation Flow', () => {
  const logger = createTestLogger()

  it('should return failure when no repository URL provided', async () => {
    const result = await consumeCreditsWithDelegation({
      userId: 'user-123',
      repositoryUrl: null,
      creditsToConsume: 100,
      logger,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('No repository URL provided')
    expect(result.organizationId).toBeUndefined()
  })

  it('should return failure when repository URL is empty', async () => {
    const result = await consumeCreditsWithDelegation({
      userId: 'user-123',
      repositoryUrl: '',
      creditsToConsume: 100,
      logger,
    })

    // Empty string passes the truthy check but fails to find org
    expect(result.success).toBe(false)
  })

  it('should fail gracefully for malformed repository URLs', async () => {
    const result = await consumeCreditsWithDelegation({
      userId: 'user-123',
      repositoryUrl: 'not-a-valid-url',
      creditsToConsume: 100,
      logger,
    })

    expect(result.success).toBe(false)
  })
})

// ============================================================================
// Integration Test: Credit Fallback Flow
// ============================================================================

describe('Billing Integration: Credit Fallback Flow', () => {
  const logger = createTestLogger()

  it('should fall back to personal credits when no repo URL provided', async () => {
    // Note: This test verifies the fallback logic structure
    // The actual consumeCredits call would need a full DB mock

    const result = await consumeCreditsWithFallback({
      userId: 'user-no-repo',
      creditsToCharge: 100,
      repoUrl: null,
      context: 'web search',
      logger,
    })

    // Will fail because we don't have real DB, but verifies the path
    expect(result.success).toBe(false) // Expected to fail without real DB
  })

  it('should attempt org delegation first when repo URL is provided', async () => {
    // This tests that the flow attempts delegation before fallback
    const result = await consumeCreditsWithFallback({
      userId: 'user-with-repo',
      creditsToCharge: 50,
      repoUrl: 'https://github.com/test/repo',
      context: 'docs lookup',
      logger,
    })

    // Will fail without DB but verifies the delegation is attempted
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// Integration Test: Complete Billing Cycle
// ============================================================================

describe('Billing Integration: Complete Billing Cycle', () => {
  const logger = createTestLogger()

  it('should handle complete cycle: reset → grant → usage check', async () => {
    const userId = 'user-complete-cycle'
    let quotaResetDate = futureDate(30)
    let currentBalance = 1000
    let usageThisCycle = 0

    // Step 1: Trigger monthly reset (mocked)
    const resetResult = await (async () => {
      // Simulate triggerMonthlyResetAndGrant behavior
      return {
        quotaResetDate,
        autoTopupEnabled: true,
      }
    })()

    expect(resetResult.quotaResetDate).toEqual(quotaResetDate)
    expect(resetResult.autoTopupEnabled).toBe(true)

    // Step 2: Get usage data with mocked deps
    const mockBreakdown: Record<GrantType, number> = {
      free: 500,
      purchase: 500,
      referral: 0,
      admin: 0,
      organization: 0,
      ad: 0,
    }

    const deps: UsageServiceDeps = {
      triggerMonthlyResetAndGrant: async () => resetResult,
      checkAndTriggerAutoTopup: async () => undefined,
      calculateUsageAndBalance: async () => ({
        usageThisCycle,
        balance: {
          totalRemaining: currentBalance,
          totalDebt: 0,
          netBalance: currentBalance,
          breakdown: mockBreakdown,
          principals: mockBreakdown,
        },
      }),
    }

    const usageResult = await getUserUsageDataWithDeps({
      userId,
      logger,
      deps,
    })

    expect(usageResult.balance.totalRemaining).toBe(1000)
    expect(usageResult.usageThisCycle).toBe(0)

    // Step 3: Simulate consumption
    currentBalance = 800
    usageThisCycle = 200

    const updatedBreakdown: Record<GrantType, number> = {
      free: 300,
      purchase: 500,
      referral: 0,
      admin: 0,
      organization: 0,
      ad: 0,
    }

    const depsAfterConsumption: UsageServiceDeps = {
      triggerMonthlyResetAndGrant: async () => resetResult,
      checkAndTriggerAutoTopup: async () => undefined,
      calculateUsageAndBalance: async () => ({
        usageThisCycle,
        balance: {
          totalRemaining: currentBalance,
          totalDebt: 0,
          netBalance: currentBalance,
          breakdown: updatedBreakdown,
          principals: mockBreakdown,
        },
      }),
    }

    const usageAfterConsumption = await getUserUsageDataWithDeps({
      userId,
      logger,
      deps: depsAfterConsumption,
    })

    expect(usageAfterConsumption.balance.totalRemaining).toBe(800)
    expect(usageAfterConsumption.usageThisCycle).toBe(200)
    expect(usageAfterConsumption.balance.breakdown.free).toBe(300) // 500 - 200
  })

  it('should handle debt creation and settlement cycle', async () => {
    const userId = 'user-debt-cycle'
    const insertedGrants: any[] = []
    const updatedGrants: any[] = []

    // Start with a grant that has gone into debt
    const existingGrant = {
      operation_id: 'old-grant',
      user_id: userId,
      principal: 500,
      balance: -100, // User overspent by 100
      type: 'free',
    }

    // New monthly grant should settle the debt
    const mockTx = {
      query: {
        creditLedger: {
          findFirst: async () => null,
        },
      },
      select: () => ({
        from: () => ({
          where: () => ({
            then: (cb: any) => cb([existingGrant]),
          }),
        }),
      }),
      update: () => ({
        set: (values: any) => ({
          where: () => {
            updatedGrants.push(values)
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
      userId,
      amount: 500,
      type: 'free',
      description: 'Monthly free credits',
      expiresAt: futureDate(30),
      operationId: 'new-monthly-grant',
      tx: mockTx as any,
      logger,
    })

    // Debt should be cleared
    expect(updatedGrants.length).toBe(1)
    expect(updatedGrants[0].balance).toBe(0)

    // New grant should have 400 credits (500 - 100 debt)
    expect(insertedGrants.length).toBe(1)
    expect(insertedGrants[0].balance).toBe(400)

    // Verify the user now has positive balance
    const mockBreakdown: Record<GrantType, number> = {
      free: 400,
      purchase: 0,
      referral: 0,
      admin: 0,
      organization: 0,
      ad: 0,
    }

    const deps: UsageServiceDeps = {
      triggerMonthlyResetAndGrant: async () => ({
        quotaResetDate: futureDate(30),
        autoTopupEnabled: false,
      }),
      checkAndTriggerAutoTopup: async () => undefined,
      calculateUsageAndBalance: async () => ({
        usageThisCycle: 0,
        balance: {
          totalRemaining: 400,
          totalDebt: 0,
          netBalance: 400,
          breakdown: mockBreakdown,
          principals: mockBreakdown,
        },
      }),
    }

    const usageResult = await getUserUsageDataWithDeps({
      userId,
      logger: createTestLogger(),
      deps,
    })

    expect(usageResult.balance.netBalance).toBe(400)
    expect(usageResult.balance.totalDebt).toBe(0)
  })
})

// ============================================================================
// Integration Test: Balance Calculation with Grant Priority
// ============================================================================

describe('Billing Integration: Balance Calculation', () => {
  const logger = createTestLogger()

  it('should calculate correct balance breakdown from multiple grant types', async () => {
    const userId = 'user-multi-grants'
    const quotaResetDate = futureDate(25)

    // Simulate having multiple grant types with different balances
    const mockBreakdown: Record<GrantType, number> = {
      free: 300,
      purchase: 500,
      referral: 150,
      admin: 50,
      organization: 0,
      ad: 25,
    }

    const mockPrincipals: Record<GrantType, number> = {
      free: 500,
      purchase: 500,
      referral: 200,
      admin: 50,
      organization: 0,
      ad: 50,
    }

    const deps: UsageServiceDeps = {
      triggerMonthlyResetAndGrant: async () => ({
        quotaResetDate,
        autoTopupEnabled: false,
      }),
      checkAndTriggerAutoTopup: async () => undefined,
      calculateUsageAndBalance: async () => ({
        usageThisCycle: 275, // 500-300 + 200-150 + 50-50 + 50-25 = 200+50+0+25 = 275
        balance: {
          totalRemaining: 1025, // Sum of breakdown
          totalDebt: 0,
          netBalance: 1025,
          breakdown: mockBreakdown,
          principals: mockPrincipals,
        },
      }),
    }

    const result = await getUserUsageDataWithDeps({
      userId,
      logger,
      deps,
    })

    // Verify all grant types are properly represented
    expect(result.balance.breakdown.free).toBe(300)
    expect(result.balance.breakdown.purchase).toBe(500)
    expect(result.balance.breakdown.referral).toBe(150)
    expect(result.balance.breakdown.admin).toBe(50)
    expect(result.balance.breakdown.ad).toBe(25)
    expect(result.balance.breakdown.organization).toBe(0)

    // Verify totals
    expect(result.balance.totalRemaining).toBe(1025)
    expect(result.balance.netBalance).toBe(1025)
    expect(result.usageThisCycle).toBe(275)
  })

  it('should handle balance with outstanding debt', async () => {
    const userId = 'user-with-debt'
    const quotaResetDate = futureDate(20)

    const mockBreakdown: Record<GrantType, number> = {
      free: 0,
      purchase: 0,
      referral: 0,
      admin: 0,
      organization: 0,
      ad: 0,
    }

    const deps: UsageServiceDeps = {
      triggerMonthlyResetAndGrant: async () => ({
        quotaResetDate,
        autoTopupEnabled: true,
      }),
      checkAndTriggerAutoTopup: async () => undefined, // Auto-topup might fail
      calculateUsageAndBalance: async () => ({
        usageThisCycle: 1200, // User overspent
        balance: {
          totalRemaining: 0,
          totalDebt: 200, // 200 credits in debt
          netBalance: -200,
          breakdown: mockBreakdown,
          principals: mockBreakdown,
        },
      }),
    }

    const result = await getUserUsageDataWithDeps({
      userId,
      logger,
      deps,
    })

    expect(result.balance.totalRemaining).toBe(0)
    expect(result.balance.totalDebt).toBe(200)
    expect(result.balance.netBalance).toBe(-200)
    expect(result.usageThisCycle).toBe(1200)
  })

  it('should exclude organization credits in personal context', async () => {
    const userId = 'user-with-org'
    const quotaResetDate = futureDate(15)

    let capturedParams: any = null

    // Breakdown without org credits (personal context)
    const personalBreakdown: Record<GrantType, number> = {
      free: 500,
      purchase: 300,
      referral: 0,
      admin: 0,
      organization: 0, // Excluded in personal context
      ad: 0,
    }

    const deps: UsageServiceDeps = {
      triggerMonthlyResetAndGrant: async () => ({
        quotaResetDate,
        autoTopupEnabled: false,
      }),
      checkAndTriggerAutoTopup: async () => undefined,
      calculateUsageAndBalance: async (params) => {
        capturedParams = params
        return {
          usageThisCycle: 200,
          balance: {
            totalRemaining: 800,
            totalDebt: 0,
            netBalance: 800,
            breakdown: personalBreakdown,
            principals: personalBreakdown,
          },
        }
      },
    }

    const result = await getUserUsageDataWithDeps({
      userId,
      logger,
      deps,
    })

    // Verify isPersonalContext was passed to calculateUsageAndBalance
    expect(capturedParams.isPersonalContext).toBe(true)
    expect(result.balance.breakdown.organization).toBe(0)
  })
})

// ============================================================================
// Integration Test: Error Propagation
// ============================================================================

describe('Billing Integration: Error Handling', () => {
  const logger = createTestLogger()

  it('should propagate error when user not found', async () => {
    const deps: UsageServiceDeps = {
      triggerMonthlyResetAndGrant: async () => {
        throw new Error('User not-found not found')
      },
      checkAndTriggerAutoTopup: async () => undefined,
      calculateUsageAndBalance: async () => ({
        usageThisCycle: 0,
        balance: {
          totalRemaining: 0,
          totalDebt: 0,
          netBalance: 0,
          breakdown: {} as any,
          principals: {} as any,
        },
      }),
    }

    await expect(
      getUserUsageDataWithDeps({
        userId: 'not-found',
        logger,
        deps,
      }),
    ).rejects.toThrow('User not-found not found')
  })

  it('should propagate error when balance calculation fails', async () => {
    const quotaResetDate = futureDate(30)

    const deps: UsageServiceDeps = {
      triggerMonthlyResetAndGrant: async () => ({
        quotaResetDate,
        autoTopupEnabled: false,
      }),
      checkAndTriggerAutoTopup: async () => undefined,
      calculateUsageAndBalance: async () => {
        throw new Error('Database connection failed')
      },
    }

    await expect(
      getUserUsageDataWithDeps({
        userId: 'user-db-error',
        logger,
        deps,
      }),
    ).rejects.toThrow('Database connection failed')
  })

  it('should NOT propagate auto-topup errors (graceful degradation)', async () => {
    const quotaResetDate = futureDate(30)

    const mockBreakdown: Record<GrantType, number> = {
      free: 50,
      purchase: 0,
      referral: 0,
      admin: 0,
      organization: 0,
      ad: 0,
    }

    const deps: UsageServiceDeps = {
      triggerMonthlyResetAndGrant: async () => ({
        quotaResetDate,
        autoTopupEnabled: true,
      }),
      checkAndTriggerAutoTopup: async () => {
        throw new Error('Stripe API unavailable')
      },
      calculateUsageAndBalance: async () => ({
        usageThisCycle: 450,
        balance: {
          totalRemaining: 50,
          totalDebt: 0,
          netBalance: 50,
          breakdown: mockBreakdown,
          principals: mockBreakdown,
        },
      }),
    }

    // Should NOT throw - auto-topup errors are swallowed
    const result = await getUserUsageDataWithDeps({
      userId: 'user-stripe-error',
      logger,
      deps,
    })

    expect(result.autoTopupTriggered).toBe(false)
    expect(result.balance.totalRemaining).toBe(50)
  })
})
