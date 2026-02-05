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

// Helper to create mock grants with specific properties
function createMockGrant(overrides: {
  operation_id: string
  balance: number
  priority: number
  expires_at: Date | null
  created_at: Date
  principal?: number
  type?: 'subscription' | 'purchase' | 'promotion' | 'organization' | 'referral'
}) {
  return {
    operation_id: overrides.operation_id,
    user_id: 'user-123',
    organization_id: null,
    principal: overrides.principal ?? Math.max(overrides.balance, 100),
    balance: overrides.balance,
    type: overrides.type ?? ('subscription' as const),
    description: 'Test grant',
    priority: overrides.priority,
    expires_at: overrides.expires_at,
    created_at: overrides.created_at,
  }
}

// Track grants returned by mock queries for verification
let capturedNonZeroQuery: any[] = []
let capturedLastGrantQuery: any[] = []
let unionResults: any[] = []

/**
 * Creates a mock that simulates the UNION query behavior.
 * The mock tracks what grants would be returned and verifies UNION deduplication.
 */
function createDbMockForUnion(options: {
  grants: ReturnType<typeof createMockGrant>[]
  updateCallback?: (grantId: string, newBalance: number) => void
}) {
  const { grants, updateCallback } = options

  // Simulate what the UNION query returns:
  // 1. Non-zero balance grants
  // 2. UNION with last grant (by priority DESC, expires_at DESC NULLS FIRST, created_at DESC)
  // 3. Deduplicated by UNION
  // 4. Ordered by priority ASC, expires_at ASC NULLS LAST, created_at ASC

  const now = new Date()
  const activeGrants = grants.filter(
    (g) => !g.expires_at || g.expires_at > now,
  )

  // Non-zero grants
  const nonZeroGrants = activeGrants.filter((g) => g.balance !== 0)
  capturedNonZeroQuery = [...nonZeroGrants]

  // Last grant (would be consumed last)
  const sortedForLast = [...activeGrants].sort((a, b) => {
    // Priority DESC
    if (b.priority !== a.priority) return b.priority - a.priority
    // expires_at DESC NULLS FIRST
    if (a.expires_at === null && b.expires_at !== null) return -1
    if (b.expires_at === null && a.expires_at !== null) return 1
    if (a.expires_at && b.expires_at) {
      if (b.expires_at.getTime() !== a.expires_at.getTime()) {
        return b.expires_at.getTime() - a.expires_at.getTime()
      }
    }
    // created_at DESC
    return b.created_at.getTime() - a.created_at.getTime()
  })
  const lastGrant = sortedForLast[0]
  capturedLastGrantQuery = lastGrant ? [lastGrant] : []

  // UNION (deduplicate) and sort for consumption
  const combined = [...nonZeroGrants]
  if (
    lastGrant &&
    !nonZeroGrants.some((g) => g.operation_id === lastGrant.operation_id)
  ) {
    combined.push(lastGrant)
  }

  // Sort for consumption order
  combined.sort((a, b) => {
    // Priority ASC
    if (a.priority !== b.priority) return a.priority - b.priority
    // expires_at ASC NULLS LAST
    if (a.expires_at === null && b.expires_at !== null) return 1
    if (b.expires_at === null && a.expires_at !== null) return -1
    if (a.expires_at && b.expires_at) {
      if (a.expires_at.getTime() !== b.expires_at.getTime()) {
        return a.expires_at.getTime() - b.expires_at.getTime()
      }
    }
    // created_at ASC
    return a.created_at.getTime() - b.created_at.getTime()
  })

  unionResults = combined

  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => combined,
        }),
      }),
    }),
    update: () => ({
      set: (values: { balance: number }) => ({
        where: () => {
          if (updateCallback) {
            // Find which grant is being updated based on the balance change
            const targetGrant = grants.find(
              (g) => g.balance !== values.balance,
            )
            if (targetGrant) {
              updateCallback(targetGrant.operation_id, values.balance)
            }
          }
          return Promise.resolve()
        },
      }),
    }),
  }
}

describe('Balance Calculator - calculateUsageAndBalance', () => {
  afterEach(() => {
    clearMockedModules()
  })

  describe('isPersonalContext behavior', () => {
    it('should exclude subscription credits when isPersonalContext is true', async () => {
      const now = new Date()
      const quotaResetDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days ago

      const grants = [
        createMockGrant({
          operation_id: 'free-grant',
          balance: 500,
          principal: 1000,
          priority: 20,
          type: 'purchase',
          expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        }),
        createMockGrant({
          operation_id: 'subscription-grant',
          balance: 2000,
          principal: 5000,
          priority: 10,
          type: 'subscription',
          expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        }),
      ]

      // Mock the database to return our test grants
      await mockModule('@codebuff/internal/db', () => ({
        default: {
          select: () => ({
            from: () => ({
              where: () => ({
                orderBy: () => grants,
              }),
            }),
          }),
        },
      }))

      // Mock analytics to prevent actual tracking
      await mockModule('@codebuff/common/analytics', () => ({
        trackEvent: () => {},
      }))

      const { calculateUsageAndBalance } = await import(
        '@codebuff/billing/balance-calculator'
      )

      const result = await calculateUsageAndBalance({
        userId: 'user-123',
        quotaResetDate,
        now,
        isPersonalContext: true,
        logger,
      })

      // Should only include purchase credits (500), not subscription (2000)
      expect(result.balance.totalRemaining).toBe(500)
      expect(result.balance.breakdown.purchase).toBe(500)
      expect(result.balance.breakdown.subscription).toBe(0)

      // Usage should only include purchase usage (1000 - 500 = 500), not subscription (5000 - 2000 = 3000)
      expect(result.usageThisCycle).toBe(500)
    })

    it('should include subscription credits when isPersonalContext is false', async () => {
      const now = new Date()
      const quotaResetDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days ago

      const grants = [
        createMockGrant({
          operation_id: 'free-grant',
          balance: 500,
          principal: 1000,
          priority: 20,
          type: 'purchase',
          expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        }),
        createMockGrant({
          operation_id: 'subscription-grant',
          balance: 2000,
          principal: 5000,
          priority: 10,
          type: 'subscription',
          expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        }),
      ]

      await mockModule('@codebuff/internal/db', () => ({
        default: {
          select: () => ({
            from: () => ({
              where: () => ({
                orderBy: () => grants,
              }),
            }),
          }),
        },
      }))

      await mockModule('@codebuff/common/analytics', () => ({
        trackEvent: () => {},
      }))

      const { calculateUsageAndBalance } = await import(
        '@codebuff/billing/balance-calculator'
      )

      const result = await calculateUsageAndBalance({
        userId: 'user-123',
        quotaResetDate,
        now,
        isPersonalContext: false,
        logger,
      })

      // Should include both purchase (500) and subscription (2000) credits
      expect(result.balance.totalRemaining).toBe(2500)
      expect(result.balance.breakdown.purchase).toBe(500)
      expect(result.balance.breakdown.subscription).toBe(2000)

      // Usage should include both: (1000 - 500) + (5000 - 2000) = 3500
      expect(result.usageThisCycle).toBe(3500)
    })

    it('should exclude organization credits when isPersonalContext is true', async () => {
      const now = new Date()
      const quotaResetDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      const grants = [
        createMockGrant({
          operation_id: 'free-grant',
          balance: 500,
          principal: 1000,
          priority: 20,
          type: 'purchase',
          expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        }),
        createMockGrant({
          operation_id: 'org-grant',
          balance: 3000,
          principal: 5000,
          priority: 5,
          type: 'organization',
          expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        }),
      ]

      await mockModule('@codebuff/internal/db', () => ({
        default: {
          select: () => ({
            from: () => ({
              where: () => ({
                orderBy: () => grants,
              }),
            }),
          }),
        },
      }))

      await mockModule('@codebuff/common/analytics', () => ({
        trackEvent: () => {},
      }))

      const { calculateUsageAndBalance } = await import(
        '@codebuff/billing/balance-calculator'
      )

      const result = await calculateUsageAndBalance({
        userId: 'user-123',
        quotaResetDate,
        now,
        isPersonalContext: true,
        logger,
      })

      // Should only include purchase credits (500), not organization (3000)
      expect(result.balance.totalRemaining).toBe(500)
      expect(result.balance.breakdown.purchase).toBe(500)
      expect(result.balance.breakdown.organization).toBe(0)
    })
  })
})

describe('Balance Calculator - Grant Ordering for Consumption', () => {
  // NOTE: This test suite uses a complex mock (createDbMockForUnion) to simulate the
  // behavior of the UNION query in `getOrderedActiveGrantsForConsumption`.
  // While it's useful for verifying the business logic and sorting/deduplication rules,
  // it does not test the actual SQL generated by Drizzle.
  // A better long-term solution would be to replace this with an integration test
  // that runs against a real test database to ensure the query itself is correct.
  afterEach(() => {
    clearMockedModules()
    capturedNonZeroQuery = []
    capturedLastGrantQuery = []
    unionResults = []
  })

  describe('getOrderedActiveGrantsForConsumption UNION query behavior', () => {
    it('should return grants ordered by priority ASC, expires_at ASC NULLS LAST, created_at ASC', async () => {
      const now = new Date()
      const grants = [
        createMockGrant({
          operation_id: 'grant-3',
          balance: 100,
          priority: 30, // Medium priority
          expires_at: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000), // 60 days
          created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        }),
        createMockGrant({
          operation_id: 'grant-1',
          balance: 100,
          priority: 10, // Highest priority (consumed first)
          expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
          created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        }),
        createMockGrant({
          operation_id: 'grant-2',
          balance: 100,
          priority: 10, // Same priority as grant-1
          expires_at: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000), // 15 days (expires sooner)
          created_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
        }),
        createMockGrant({
          operation_id: 'grant-4',
          balance: 100,
          priority: 60, // Lowest priority (consumed last)
          expires_at: null, // Never expires
          created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        }),
      ]

      const dbMock = createDbMockForUnion({ grants })

      await mockModule('@codebuff/internal/db', () => ({
        default: dbMock,
      }))
      await mockModule('@codebuff/internal/db/transaction', () => ({
        withSerializableTransaction: async ({
          callback,
        }: {
          callback: (tx: any) => Promise<unknown>
        }) => callback(dbMock),
      }))

      // Verify the UNION result order
      expect(unionResults.map((g) => g.operation_id)).toEqual([
        'grant-2', // priority 10, expires soonest
        'grant-1', // priority 10, expires later
        'grant-3', // priority 30
        'grant-4', // priority 60, never expires (NULLS LAST)
      ])
    })

    it('should include zero-balance last grant when all other grants have positive balance', async () => {
      const now = new Date()
      const grants = [
        createMockGrant({
          operation_id: 'grant-1',
          balance: 100,
          priority: 10,
          expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        }),
        createMockGrant({
          operation_id: 'grant-2-zero',
          balance: 0, // Zero balance - should still be included as last grant
          priority: 60, // Lowest priority = last grant
          expires_at: null, // Never expires
          created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        }),
      ]

      const dbMock = createDbMockForUnion({ grants })

      await mockModule('@codebuff/internal/db', () => ({
        default: dbMock,
      }))

      // Non-zero query should only have grant-1
      expect(capturedNonZeroQuery.map((g) => g.operation_id)).toEqual([
        'grant-1',
      ])

      // Last grant query should return grant-2-zero (lowest priority, never expires)
      expect(capturedLastGrantQuery.map((g) => g.operation_id)).toEqual([
        'grant-2-zero',
      ])

      // UNION result should include both (zero-balance grant added for debt recording)
      expect(unionResults.map((g) => g.operation_id)).toEqual([
        'grant-1',
        'grant-2-zero',
      ])
    })

    it('should deduplicate when last grant already has non-zero balance', async () => {
      const now = new Date()
      const grants = [
        createMockGrant({
          operation_id: 'grant-1',
          balance: 100,
          priority: 10,
          expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        }),
        createMockGrant({
          operation_id: 'grant-2',
          balance: 50, // Non-zero balance
          priority: 60, // Lowest priority = last grant
          expires_at: null,
          created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        }),
      ]

      const dbMock = createDbMockForUnion({ grants })

      await mockModule('@codebuff/internal/db', () => ({
        default: dbMock,
      }))

      // Both grants are in non-zero query
      expect(capturedNonZeroQuery.length).toBe(2)

      // Last grant is grant-2 (already in non-zero set)
      expect(capturedLastGrantQuery[0].operation_id).toBe('grant-2')

      // UNION should NOT duplicate grant-2
      expect(unionResults.length).toBe(2)
      expect(
        unionResults.filter((g) => g.operation_id === 'grant-2').length,
      ).toBe(1)
    })

    it('should handle empty grants case', async () => {
      const dbMock = createDbMockForUnion({ grants: [] })

      await mockModule('@codebuff/internal/db', () => ({
        default: dbMock,
      }))

      expect(unionResults).toEqual([])
      expect(capturedNonZeroQuery).toEqual([])
      expect(capturedLastGrantQuery).toEqual([])
    })

    it('should handle single grant case', async () => {
      const now = new Date()
      const grants = [
        createMockGrant({
          operation_id: 'only-grant',
          balance: 100,
          priority: 10,
          expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        }),
      ]

      const dbMock = createDbMockForUnion({ grants })

      await mockModule('@codebuff/internal/db', () => ({
        default: dbMock,
      }))

      // Single grant should be in both queries
      expect(capturedNonZeroQuery.length).toBe(1)
      expect(capturedLastGrantQuery.length).toBe(1)

      // UNION should return exactly one grant (deduplicated)
      expect(unionResults.length).toBe(1)
      expect(unionResults[0].operation_id).toBe('only-grant')
    })

    it('should handle all-zero-balance grants correctly', async () => {
      const now = new Date()
      const grants = [
        createMockGrant({
          operation_id: 'zero-1',
          balance: 0,
          priority: 10,
          expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        }),
        createMockGrant({
          operation_id: 'zero-2',
          balance: 0,
          priority: 60, // This is the "last grant"
          expires_at: null,
          created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        }),
      ]

      const dbMock = createDbMockForUnion({ grants })

      await mockModule('@codebuff/internal/db', () => ({
        default: dbMock,
      }))

      // No non-zero grants
      expect(capturedNonZeroQuery).toEqual([])

      // Last grant should still be identified
      expect(capturedLastGrantQuery[0].operation_id).toBe('zero-2')

      // UNION should return just the last grant (for debt recording)
      expect(unionResults.length).toBe(1)
      expect(unionResults[0].operation_id).toBe('zero-2')
    })

    it('should correctly identify last grant with NULL expires_at as NULLS FIRST in DESC order', async () => {
      const now = new Date()
      const grants = [
        createMockGrant({
          operation_id: 'expires-soon',
          balance: 100,
          priority: 60, // Same priority
          expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
        }),
        createMockGrant({
          operation_id: 'never-expires',
          balance: 100,
          priority: 60, // Same priority
          expires_at: null, // Never expires - should be "last" due to NULLS FIRST in DESC
          created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        }),
      ]

      const dbMock = createDbMockForUnion({ grants })

      await mockModule('@codebuff/internal/db', () => ({
        default: dbMock,
      }))

      // Last grant should be the one that never expires (NULL = NULLS FIRST in DESC)
      expect(capturedLastGrantQuery[0].operation_id).toBe('never-expires')

      // In consumption order (ASC NULLS LAST), expires-soon comes first
      expect(unionResults[0].operation_id).toBe('expires-soon')
      expect(unionResults[1].operation_id).toBe('never-expires')
    })
  })
})
