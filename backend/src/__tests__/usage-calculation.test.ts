import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { GrantType } from '@codebuff/internal/db/schema'
import { GRANT_PRIORITIES } from '@codebuff/internal/constants/grant-priorities'

// Mock the internal package modules before importing the function
mock.module('@codebuff/internal/db', () => ({
  default: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve([]),
        }),
      }),
    }),
  },
}))

mock.module('@codebuff/internal/db/schema', () => ({
  creditLedger: {
    user_id: 'user_id',
    expires_at: 'expires_at',
    priority: 'priority',
    created_at: 'created_at',
    principal: 'principal',
    balance: 'balance',
    type: 'type',
    operation_id: 'operation_id',
  },
  GrantType: {} as any,
}))

mock.module('@codebuff/internal/constants/grant-priorities', () => ({
  GRANT_PRIORITIES: {
    free: 1,
    purchase: 2,
    referral: 3,
    admin: 4,
    organization: 5,
  },
}))

mock.module('common/util/logger', () => ({
  logger: {
    debug: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
  },
  withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
}))

// Now import the function after mocking
import { calculateUsageAndBalance } from '@codebuff/billing'

describe('Usage Calculation System', () => {
  beforeEach(() => {
    // Reset all mocks between tests
    mock.restore()
    
    // Re-establish mocks
    mock.module('@codebuff/internal/db', () => ({
      default: {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve([]),
            }),
          }),
        }),
      },
    }))

    mock.module('@codebuff/internal/db/schema', () => ({
      creditLedger: {
        user_id: 'user_id',
        expires_at: 'expires_at',
        priority: 'priority',
        created_at: 'created_at',
        principal: 'principal',
        balance: 'balance',
        type: 'type',
        operation_id: 'operation_id',
      },
    }))

    mock.module('common/util/logger', () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
    }))
  })

  it('should calculate usage this cycle correctly', async () => {
    const mockGrants = [
      {
        operation_id: 'test-1',
        user_id: 'test-user',
        type: 'free' as GrantType,
        principal: 500,
        balance: 300,
        created_at: new Date('2024-01-01'),
        expires_at: new Date('2024-02-01'),
        priority: 1,
      },
      {
        operation_id: 'test-2',
        user_id: 'test-user',
        type: 'purchase' as GrantType,
        principal: 1000,
        balance: 800,
        created_at: new Date('2024-01-15'),
        expires_at: null,
        priority: 2,
      },
    ]

    // Mock the database to return our test grants
    mock.module('@codebuff/internal/db', () => ({
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
      new Date('2024-01-15')
    )

    expect(usageThisCycle).toBe(400) // (500-300) + (1000-800) = 400
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
        expires_at: new Date('2024-01-15'), // Expired
        priority: 1,
      },
    ]

    mock.module('@codebuff/internal/db', () => ({
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
      new Date('2024-01-16') // After expiry
    )

    expect(balance.totalRemaining).toBe(0)
    expect(usageThisCycle).toBe(200) // 500 - 300 = 200
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
        priority: 1,
      },
    ]

    mock.module('@codebuff/internal/db', () => ({
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
      new Date('2024-01-15')
    )

    expect(balance.totalRemaining).toBe(0)
    expect(balance.totalDebt).toBe(100)
    expect(balance.netBalance).toBe(-100)
  })

  it('should handle in-memory settlement between positive balance and debt', async () => {
    const mockGrants = [
      {
        operation_id: 'test-1',
        user_id: 'test-user',
        type: 'free' as GrantType,
        principal: 200,
        balance: 100, // Positive
        created_at: new Date('2024-01-01'),
        expires_at: new Date('2024-02-01'),
        priority: 1,
      },
      {
        operation_id: 'test-2',
        user_id: 'test-user',
        type: 'purchase' as GrantType,
        principal: 100,
        balance: -50, // Debt
        created_at: new Date('2024-01-15'),
        expires_at: null,
        priority: 2,
      },
    ]

    mock.module('@codebuff/internal/db', () => ({
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
      new Date('2024-01-15')
    )

    // Settlement: 100 positive - 50 debt = 50 remaining
    expect(balance.totalRemaining).toBe(50)
    expect(balance.totalDebt).toBe(0)
    expect(balance.netBalance).toBe(50)
    expect(usageThisCycle).toBe(250) // (200-100) + (100-(-50)) = 250
  })
})
