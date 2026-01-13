/**
 * Tests for auto-topup functions using dependency injection.
 */

import { describe, expect, it } from 'bun:test'

import {
  validateAutoTopupStatus,
  checkAndTriggerAutoTopup,
  checkAndTriggerOrgAutoTopup,
} from '../auto-topup'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { BillingDbConnection } from '@codebuff/common/types/contracts/billing'
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

// ============================================================================
// validateAutoTopupStatus Tests
// ============================================================================

describe('validateAutoTopupStatus', () => {
  const logger = createTestLogger()

  it('should return blockedReason when user has no stripe_customer_id', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => ({ stripe_customer_id: null }),
        },
      },
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    } as unknown as BillingDbConnection

    const result = await validateAutoTopupStatus({
      userId: 'user-no-stripe',
      logger,
      deps: { db: mockDb },
    })

    expect(result.blockedReason).toContain("don't have a valid account")
    expect(result.validPaymentMethod).toBeNull()
  })

  it('should return blockedReason when user not found', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => null,
        },
      },
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    } as unknown as BillingDbConnection

    const result = await validateAutoTopupStatus({
      userId: 'user-not-found',
      logger,
      deps: { db: mockDb },
    })

    expect(result.blockedReason).toContain("don't have a valid account")
    expect(result.validPaymentMethod).toBeNull()
  })

  it('should return blockedReason when no valid payment methods exist', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => ({ stripe_customer_id: 'cus_123' }),
        },
      },
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    } as unknown as BillingDbConnection

    const mockStripe = {
      paymentMethods: {
        list: async () => ({ data: [] }),
      },
    }

    const result = await validateAutoTopupStatus({
      userId: 'user-no-payment',
      logger,
      deps: { db: mockDb, stripeServer: mockStripe as any },
    })

    expect(result.blockedReason).toContain('valid payment method')
    expect(result.validPaymentMethod).toBeNull()
  })

  it('should return valid payment method when card is not expired', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => ({ stripe_customer_id: 'cus_123' }),
        },
      },
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    } as unknown as BillingDbConnection

    const futureYear = new Date().getFullYear() + 2
    const validCard = {
      id: 'pm_card_valid',
      type: 'card' as const,
      card: {
        exp_year: futureYear,
        exp_month: 12,
      },
    }

    const mockStripe = {
      paymentMethods: {
        list: async ({ type }: { type: string }) => {
          if (type === 'card') return { data: [validCard] }
          return { data: [] }
        },
      },
    }

    const result = await validateAutoTopupStatus({
      userId: 'user-valid-card',
      logger,
      deps: { db: mockDb, stripeServer: mockStripe as any },
    })

    expect(result.blockedReason).toBeNull()
    expect(result.validPaymentMethod?.id).toBe('pm_card_valid')
  })

  it('should return valid payment method when link payment exists', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => ({ stripe_customer_id: 'cus_123' }),
        },
      },
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    } as unknown as BillingDbConnection

    const linkPayment = {
      id: 'pm_link_valid',
      type: 'link' as const,
    }

    const mockStripe = {
      paymentMethods: {
        list: async ({ type }: { type: string }) => {
          if (type === 'link') return { data: [linkPayment] }
          return { data: [] }
        },
      },
    }

    const result = await validateAutoTopupStatus({
      userId: 'user-link-payment',
      logger,
      deps: { db: mockDb, stripeServer: mockStripe as any },
    })

    expect(result.blockedReason).toBeNull()
    expect(result.validPaymentMethod?.id).toBe('pm_link_valid')
  })

  it('should filter out expired cards', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => ({ stripe_customer_id: 'cus_123' }),
        },
      },
      update: () => ({
        set: () => ({
          where: () => Promise.resolve(),
        }),
      }),
    } as unknown as BillingDbConnection

    const expiredCard = {
      id: 'pm_card_expired',
      type: 'card',
      card: {
        exp_year: 2020,
        exp_month: 1,
      },
    }

    const mockStripe = {
      paymentMethods: {
        list: async ({ type }: { type: string }) => {
          if (type === 'card') return { data: [expiredCard] }
          return { data: [] }
        },
      },
    }

    const result = await validateAutoTopupStatus({
      userId: 'user-expired-card',
      logger,
      deps: { db: mockDb, stripeServer: mockStripe as any },
    })

    expect(result.blockedReason).toContain('valid payment method')
    expect(result.validPaymentMethod).toBeNull()
  })
})

// ============================================================================
// checkAndTriggerAutoTopup Tests
// ============================================================================

describe('checkAndTriggerAutoTopup', () => {
  const logger = createTestLogger()

  it('should return undefined when user not found', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => null,
        },
      },
    } as unknown as BillingDbConnection

    const result = await checkAndTriggerAutoTopup({
      userId: 'user-not-found',
      logger,
      deps: { db: mockDb },
    })

    expect(result).toBeUndefined()
  })

  it('should return undefined when auto_topup_enabled is false', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => ({
            auto_topup_enabled: false,
            auto_topup_threshold: 100,
            auto_topup_amount: 500,
            stripe_customer_id: 'cus_123',
            next_quota_reset: futureDate(30),
          }),
        },
      },
    } as unknown as BillingDbConnection

    const result = await checkAndTriggerAutoTopup({
      userId: 'user-disabled',
      logger,
      deps: { db: mockDb },
    })

    expect(result).toBeUndefined()
  })

  it('should return undefined when balance is above threshold', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => ({
            auto_topup_enabled: true,
            auto_topup_threshold: 100,
            auto_topup_amount: 500,
            stripe_customer_id: 'cus_123',
            next_quota_reset: futureDate(30),
          }),
        },
      },
    } as unknown as BillingDbConnection

    const mockBreakdown: Record<GrantType, number> = {
      free: 500,
      purchase: 500,
      referral: 0,
      admin: 0,
      organization: 0,
      ad: 0,
    }

    const mockCalculateUsageAndBalance = async () => ({
      usageThisCycle: 0,
      balance: {
        totalRemaining: 1000, // Above threshold of 100
        totalDebt: 0,
        netBalance: 1000,
        breakdown: mockBreakdown,
        principals: mockBreakdown,
      },
    })

    const result = await checkAndTriggerAutoTopup({
      userId: 'user-above-threshold',
      logger,
      deps: {
        db: mockDb,
        calculateUsageAndBalanceFn: mockCalculateUsageAndBalance,
      },
    })

    expect(result).toBeUndefined()
  })

  it('should return undefined when topup amount is below minimum', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => ({
            auto_topup_enabled: true,
            auto_topup_threshold: 100,
            auto_topup_amount: 100, // Below minimum of 500
            stripe_customer_id: 'cus_123',
            next_quota_reset: futureDate(30),
          }),
        },
      },
    } as unknown as BillingDbConnection

    const mockBreakdown: Record<GrantType, number> = {
      free: 50,
      purchase: 0,
      referral: 0,
      admin: 0,
      organization: 0,
      ad: 0,
    }

    const mockCalculateUsageAndBalance = async () => ({
      usageThisCycle: 450,
      balance: {
        totalRemaining: 50, // Below threshold of 100
        totalDebt: 0,
        netBalance: 50,
        breakdown: mockBreakdown,
        principals: mockBreakdown,
      },
    })

    const result = await checkAndTriggerAutoTopup({
      userId: 'user-low-topup-amount',
      logger,
      deps: {
        db: mockDb,
        calculateUsageAndBalanceFn: mockCalculateUsageAndBalance,
      },
    })

    expect(result).toBeUndefined()
  })

  it('should trigger topup when balance is below threshold and payment method is valid', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => ({
            auto_topup_enabled: true,
            auto_topup_threshold: 100,
            auto_topup_amount: 500,
            stripe_customer_id: 'cus_123',
            next_quota_reset: futureDate(30),
          }),
        },
      },
    } as unknown as BillingDbConnection

    const mockBreakdown: Record<GrantType, number> = {
      free: 50,
      purchase: 0,
      referral: 0,
      admin: 0,
      organization: 0,
      ad: 0,
    }

    const mockCalculateUsageAndBalance = async () => ({
      usageThisCycle: 450,
      balance: {
        totalRemaining: 50, // Below threshold of 100
        totalDebt: 0,
        netBalance: 50,
        breakdown: mockBreakdown,
        principals: mockBreakdown,
      },
    })

    const futureYear = new Date().getFullYear() + 2
    const validCard = {
      id: 'pm_card_valid',
      type: 'card',
      card: { exp_year: futureYear, exp_month: 12 },
    }

    const mockStripe = {
      paymentMethods: {
        list: async ({ type }: { type: string }) => {
          if (type === 'card') return { data: [validCard] }
          return { data: [] }
        },
      },
      paymentIntents: {
        create: async () => ({ status: 'succeeded', id: 'pi_123' }),
      },
    }

    let grantedCredits = 0
    const mockProcessAndGrantCredit = async (params: { amount: number }) => {
      grantedCredits = params.amount
    }

    const result = await checkAndTriggerAutoTopup({
      userId: 'user-needs-topup',
      logger,
      deps: {
        db: mockDb,
        stripeServer: mockStripe as any,
        calculateUsageAndBalanceFn: mockCalculateUsageAndBalance,
        processAndGrantCreditFn: mockProcessAndGrantCredit as any,
      },
    })

    expect(result).toBe(500)
    expect(grantedCredits).toBe(500)
  })

  it('should topup amount to cover debt when user has debt', async () => {
    const mockDb = {
      query: {
        user: {
          findFirst: async () => ({
            auto_topup_enabled: true,
            auto_topup_threshold: 100,
            auto_topup_amount: 500,
            stripe_customer_id: 'cus_123',
            next_quota_reset: futureDate(30),
          }),
        },
      },
    } as unknown as BillingDbConnection

    const mockBreakdown: Record<GrantType, number> = {
      free: 0,
      purchase: 0,
      referral: 0,
      admin: 0,
      organization: 0,
      ad: 0,
    }

    const mockCalculateUsageAndBalance = async () => ({
      usageThisCycle: 1200,
      balance: {
        totalRemaining: 0,
        totalDebt: 700, // More than default topup amount
        netBalance: -700,
        breakdown: mockBreakdown,
        principals: mockBreakdown,
      },
    })

    const futureYear = new Date().getFullYear() + 2
    const validCard = {
      id: 'pm_card_valid',
      type: 'card',
      card: { exp_year: futureYear, exp_month: 12 },
    }

    const mockStripe = {
      paymentMethods: {
        list: async ({ type }: { type: string }) => {
          if (type === 'card') return { data: [validCard] }
          return { data: [] }
        },
      },
      paymentIntents: {
        create: async () => ({ status: 'succeeded', id: 'pi_123' }),
      },
    }

    let grantedCredits = 0
    const mockProcessAndGrantCredit = async (params: { amount: number }) => {
      grantedCredits = params.amount
    }

    const result = await checkAndTriggerAutoTopup({
      userId: 'user-with-debt',
      logger,
      deps: {
        db: mockDb,
        stripeServer: mockStripe as any,
        calculateUsageAndBalanceFn: mockCalculateUsageAndBalance,
        processAndGrantCreditFn: mockProcessAndGrantCredit as any,
      },
    })

    // Should topup 700 (debt amount) since it's higher than the default 500
    expect(result).toBe(700)
    expect(grantedCredits).toBe(700)
  })
})

// ============================================================================
// checkAndTriggerOrgAutoTopup Tests
// ============================================================================

describe('checkAndTriggerOrgAutoTopup', () => {
  const logger = createTestLogger()

  it('should return early when organization not found', async () => {
    const mockDb = {
      query: {
        org: {
          findFirst: async () => null,
        },
      },
    } as unknown as BillingDbConnection

    await expect(
      checkAndTriggerOrgAutoTopup({
        organizationId: 'org-not-found',
        userId: 'user-123',
        logger,
        deps: { db: mockDb },
      }),
    ).rejects.toThrow('Organization org-not-found not found')
  })

  it('should return early when auto_topup_enabled is false', async () => {
    const mockDb = {
      query: {
        org: {
          findFirst: async () => ({
            auto_topup_enabled: false,
            auto_topup_threshold: 100,
            auto_topup_amount: 500,
            stripe_customer_id: 'cus_org_123',
          }),
        },
      },
    } as unknown as BillingDbConnection

    // Should not throw and not call any other functions
    await checkAndTriggerOrgAutoTopup({
      organizationId: 'org-disabled',
      userId: 'user-123',
      logger,
      deps: { db: mockDb },
    })

    // No error means it returned early as expected
  })

  it('should return early when org has no stripe_customer_id', async () => {
    const mockDb = {
      query: {
        org: {
          findFirst: async () => ({
            auto_topup_enabled: true,
            auto_topup_threshold: 100,
            auto_topup_amount: 500,
            stripe_customer_id: null,
          }),
        },
      },
    } as unknown as BillingDbConnection

    // Should not throw and return early
    await checkAndTriggerOrgAutoTopup({
      organizationId: 'org-no-stripe',
      userId: 'user-123',
      logger,
      deps: { db: mockDb },
    })
  })

  it('should not topup when balance is above threshold', async () => {
    const mockDb = {
      query: {
        org: {
          findFirst: async () => ({
            auto_topup_enabled: true,
            auto_topup_threshold: 100,
            auto_topup_amount: 500,
            stripe_customer_id: 'cus_org_123',
          }),
        },
      },
    } as unknown as BillingDbConnection

    const mockCalculateOrgUsageAndBalance = async () => ({
      usageThisCycle: 0,
      balance: {
        totalRemaining: 1000, // Above threshold
        totalDebt: 0,
        netBalance: 1000,
        breakdown: {} as any,
        principals: {} as any,
      },
    })

    let grantCalled = false
    const mockGrantOrgCredits = async () => {
      grantCalled = true
    }

    await checkAndTriggerOrgAutoTopup({
      organizationId: 'org-above-threshold',
      userId: 'user-123',
      logger,
      deps: {
        db: mockDb,
        calculateOrganizationUsageAndBalanceFn: mockCalculateOrgUsageAndBalance,
        grantOrganizationCreditsFn: mockGrantOrgCredits as any,
      },
    })

    expect(grantCalled).toBe(false)
  })

  it('should skip topup when amount is below minimum', async () => {
    const mockDb = {
      query: {
        org: {
          findFirst: async () => ({
            auto_topup_enabled: true,
            auto_topup_threshold: 100,
            auto_topup_amount: 100, // Below minimum of 500
            stripe_customer_id: 'cus_org_123',
          }),
        },
      },
    } as unknown as BillingDbConnection

    const mockCalculateOrgUsageAndBalance = async () => ({
      usageThisCycle: 900,
      balance: {
        totalRemaining: 50, // Below threshold
        totalDebt: 0,
        netBalance: 50,
        breakdown: {} as any,
        principals: {} as any,
      },
    })

    let grantCalled = false
    const mockGrantOrgCredits = async () => {
      grantCalled = true
    }

    await checkAndTriggerOrgAutoTopup({
      organizationId: 'org-low-amount',
      userId: 'user-123',
      logger,
      deps: {
        db: mockDb,
        calculateOrganizationUsageAndBalanceFn: mockCalculateOrgUsageAndBalance,
        grantOrganizationCreditsFn: mockGrantOrgCredits as any,
      },
    })

    expect(grantCalled).toBe(false)
  })

  it('should trigger topup when balance is below threshold', async () => {
    const mockDb = {
      query: {
        org: {
          findFirst: async () => ({
            auto_topup_enabled: true,
            auto_topup_threshold: 100,
            auto_topup_amount: 1000,
            stripe_customer_id: 'cus_org_123',
          }),
        },
      },
    } as unknown as BillingDbConnection

    const mockCalculateOrgUsageAndBalance = async () => ({
      usageThisCycle: 900,
      balance: {
        totalRemaining: 50, // Below threshold of 100
        totalDebt: 0,
        netBalance: 50,
        breakdown: {} as any,
        principals: {} as any,
      },
    })

    const futureYear = new Date().getFullYear() + 2
    const validCard = {
      id: 'pm_card_valid',
      type: 'card',
      card: { exp_year: futureYear, exp_month: 12 },
    }

    const mockStripe = {
      paymentMethods: {
        list: async () => ({ data: [validCard] }),
      },
      customers: {
        retrieve: async () => ({
          deleted: false,
          invoice_settings: { default_payment_method: 'pm_card_valid' },
        }),
      },
      paymentIntents: {
        create: async () => ({ status: 'succeeded', id: 'pi_org_123' }),
      },
    }

    let grantedAmount = 0
    const mockGrantOrgCredits = async (params: { amount: number }) => {
      grantedAmount = params.amount
    }

    await checkAndTriggerOrgAutoTopup({
      organizationId: 'org-needs-topup',
      userId: 'user-123',
      logger,
      deps: {
        db: mockDb,
        stripeServer: mockStripe as any,
        calculateOrganizationUsageAndBalanceFn: mockCalculateOrgUsageAndBalance,
        grantOrganizationCreditsFn: mockGrantOrgCredits as any,
      },
    })

    expect(grantedAmount).toBe(1000)
  })
})
