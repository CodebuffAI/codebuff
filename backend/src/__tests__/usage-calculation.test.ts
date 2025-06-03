import { calculateUsageAndBalance } from '@codebuff/billing'
import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { GrantType } from 'common/db/schema'
import { GRANT_PRIORITIES } from 'common/src/constants/grant-priorities'

// Mock logger - this is needed because @codebuff/billing likely uses the logger
mock.module('common/util/logger', () => ({
  logger: {
    debug: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
  },
  withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
}))

describe('Usage Calculation System', () => {
  beforeEach(() => {
    // Reset the mock between tests
    mock.restore()

    // Re-mock logger after restore
    mock.module('common/util/logger', () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
    }))
  })

  it('should calculate usage this cycle correctly', async () => {
    const mockGrants = [
      {
        operation_id: 'test-1',
        user_id: 'test-user',
        type: 'free' as GrantType,
        principal: 500, // Used 200 (500 - 300)
        balance: 300,
        created_at: new Date('2024-01-01'),
        expires_at: new Date('2024-02-01'),
        priority: GRANT_PRIORITIES.free,
      },
      {
        operation_id: 'test-2',
        user_id: 'test-user',
        type: 'purchase' as GrantType,
        principal: 1000, // Used 200 (1000 - 800)
        balance: 800,
        created_at: new Date('2024-01-15'),
        expires_at: null,
        priority: GRANT_PRIORITIES.purchase,
      },
    ]

    // Mock the database module
    mock.module('common/db', () => ({
      default: {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(mockGrants),
            }),
          }),
        }),
      },
    }))

    const { usageThisCycle } = await calculateUsageAndBalance(
      'test-user',
      new Date('2024-01-01'),
      new Date('2024-01-15') // Pass current time when grants are active
    )

    expect(usageThisCycle).toBe(400) // 200 + 200 = 400 total usage
  })

  it('should handle expired grants', async () => {
    const mockGrants = [
      {
        operation_id: 'test-1',
        user_id: 'test-user',
        type: 'free' as GrantType,
        principal: 500,
        balance: 300,
        created_at: new Date('2024-01-01'),
        expires_at: new Date('2024-01-15'), // Already expired
        priority: GRANT_PRIORITIES.free,
      },
    ]

    // Mock the database module
    mock.module('common/db', () => ({
      default: {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(mockGrants),
            }),
          }),
        }),
      },
    }))

    const { balance, usageThisCycle } = await calculateUsageAndBalance(
      'test-user',
      new Date('2024-01-01'),
      new Date('2024-01-16') // Current time after expiry
    )

    expect(balance.totalRemaining).toBe(0) // Expired grant doesn't count
    expect(balance.totalDebt).toBe(0)
    expect(balance.netBalance).toBe(0)
    expect(balance.breakdown).toEqual({
      free: 0,
      purchase: 0,
      referral: 0,
      admin: 0,
      organization: 0,
    })
    expect(usageThisCycle).toBe(200) // 500 - 300 = 200 used
  })

  it('should handle grants with debt', async () => {
    const mockGrants = [
      {
        operation_id: 'test-1',
        user_id: 'test-user',
        type: 'free' as GrantType,
        principal: 500,
        balance: -100, // In debt
        created_at: new Date('2024-01-01'),
        expires_at: new Date('2024-02-01'),
        priority: GRANT_PRIORITIES.free,
      },
    ]

    // Mock the database module
    mock.module('common/db', () => ({
      default: {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(mockGrants),
            }),
          }),
        }),
      },
    }))

    const { balance } = await calculateUsageAndBalance(
      'test-user',
      new Date('2024-01-01'),
      new Date('2024-01-15') // Pass current time when grants are active
    )

    expect(balance.totalRemaining).toBe(0)
    expect(balance.totalDebt).toBe(100)
    expect(balance.netBalance).toBe(-100)
    expect(balance.breakdown).toEqual({
      free: 0,
      purchase: 0,
      referral: 0,
      admin: 0,
      organization: 0,
    }) // No positive balances
  })

  it('should handle in-memory settlement between positive balance and debt', async () => {
    const mockGrants = [
      {
        operation_id: 'test-1',
        user_id: 'test-user',
        type: 'free' as GrantType,
        principal: 200,
        balance: 100, // Positive balance
        created_at: new Date('2024-01-01'),
        expires_at: new Date('2024-02-01'),
        priority: GRANT_PRIORITIES.free,
      },
      {
        operation_id: 'test-2',
        user_id: 'test-user',
        type: 'purchase' as GrantType,
        principal: 100,
        balance: -50, // Debt
        created_at: new Date('2024-01-15'),
        expires_at: null,
        priority: GRANT_PRIORITIES.purchase,
      },
    ]

    // Mock the database module
    mock.module('common/db', () => ({
      default: {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve(mockGrants),
            }),
          }),
        }),
      },
    }))

    const { balance, usageThisCycle } = await calculateUsageAndBalance(
      'test-user',
      new Date('2024-01-01'),
      new Date('2024-01-15') // Pass current time when grants are active
    )

    // Settlement: 100 positive balance - 50 debt = 50 remaining
    expect(balance.totalRemaining).toBe(50)
    expect(balance.totalDebt).toBe(0)
    expect(balance.netBalance).toBe(50)

    // Breakdown shows positive balances before settlement
    expect(balance.breakdown).toEqual({
      free: 100,
      purchase: 0, // No positive balance for purchase grant
      referral: 0,
      admin: 0,
      organization: 0,
    })

    // Principals show original grant amounts
    expect(balance.principals).toEqual({
      free: 200,
      purchase: 100,
      referral: 0,
      admin: 0,
      organization: 0,
    })

    // Usage calculation: (200-100) + (100-(-50)) = 100 + 150 = 250
    expect(usageThisCycle).toBe(250)
  })
})
