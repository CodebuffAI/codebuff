import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_TIER,
  SUBSCRIPTION_TIERS,
} from '@codebuff/common/constants/subscription-plans'
import type { Logger } from '@codebuff/common/types/contracts/logger'

import {
  checkRateLimit,
  ensureActiveBlockGrantCallback,
  expireActiveBlockGrants,
  getWeekEnd,
  getWeekStart,
  getSubscriptionLimits,
  isWeeklyLimitError,
  migrateUnusedCredits,
} from '../subscription'

import type { BlockGrant, SubscriptionRow, WeeklyLimitError } from '../subscription'

const logger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

// Helper to create a UTC date on a specific day-of-week
// dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat
function utcDate(year: number, month: number, day: number): Date {
  const d = new Date(Date.UTC(year, month - 1, day))
  return d
}

function createMockSubscription(overrides?: Partial<{
  stripe_subscription_id: string
  tier: number
  billing_period_start: Date
}>) {
  return {
    stripe_subscription_id: 'sub-test-123',
    tier: 200,
    billing_period_start: utcDate(2025, 1, 8), // Wednesday
    user_id: 'user-123',
    status: 'active',
    ...overrides,
  } as SubscriptionRow
}

interface MockCaptures {
  insertValues: Record<string, unknown>[]
  updateSets: Record<string, unknown>[]
}

function createSequentialMock(options: {
  selectResults?: unknown[][]
  updateResults?: unknown[][]
  insertResults?: unknown[][]
}): { conn: any; captures: MockCaptures } {
  let selectIdx = 0
  let updateIdx = 0
  let insertIdx = 0
  const captures: MockCaptures = { insertValues: [], updateSets: [] }

  function makeChain(result: unknown, type?: 'insert' | 'update'): Record<string, unknown> {
    const chain: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'orderBy', 'limit', 'returning', 'onConflictDoNothing']) {
      chain[m] = () => chain
    }
    chain.values = (data: Record<string, unknown>) => {
      if (type === 'insert') captures.insertValues.push(data)
      return chain
    }
    chain.set = (data: Record<string, unknown>) => {
      if (type === 'update') captures.updateSets.push(data)
      return chain
    }
    chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject)
    return chain
  }

  const conn = {
    select: () => {
      const result = (options.selectResults ?? [])[selectIdx] ?? []
      selectIdx++
      return makeChain(result)
    },
    update: () => {
      const result = (options.updateResults ?? [])[updateIdx] ?? []
      updateIdx++
      return makeChain(result, 'update')
    },
    insert: () => {
      const result = (options.insertResults ?? [])[insertIdx] ?? []
      insertIdx++
      return makeChain(result, 'insert')
    },
  }

  return { conn, captures }
}

describe('subscription', () => {
  describe('getWeekStart', () => {
    it('should return start of today when now is the same day-of-week as billing start', () => {
      // 2025-01-08 is a Wednesday (3)
      const billingStart = utcDate(2025, 1, 8)
      // 2025-01-15 is also a Wednesday (3)
      const now = utcDate(2025, 1, 15)

      const result = getWeekStart(billingStart, now)

      expect(result).toEqual(utcDate(2025, 1, 15))
    })

    it('should go back to the billing day-of-week when now is later in the week', () => {
      // 2025-01-08 is a Wednesday (3)
      const billingStart = utcDate(2025, 1, 8)
      // 2025-01-17 is a Friday (5) — 2 days after Wednesday
      const now = utcDate(2025, 1, 17)

      const result = getWeekStart(billingStart, now)

      // Should go back to Wednesday 2025-01-15
      expect(result).toEqual(utcDate(2025, 1, 15))
    })

    it('should go back to previous week billing day when now is earlier in the week', () => {
      // 2025-01-08 is a Wednesday (3)
      const billingStart = utcDate(2025, 1, 8)
      // 2025-01-13 is a Monday (1) — before Wednesday
      const now = utcDate(2025, 1, 13)

      const result = getWeekStart(billingStart, now)

      // Should go back 5 days to Wednesday 2025-01-08
      expect(result).toEqual(utcDate(2025, 1, 8))
    })

    it('should handle billing start on Sunday with now on Saturday', () => {
      // 2025-01-05 is a Sunday (0)
      const billingStart = utcDate(2025, 1, 5)
      // 2025-01-18 is a Saturday (6) — 6 days after Sunday
      const now = utcDate(2025, 1, 18)

      const result = getWeekStart(billingStart, now)

      // Should go back 6 days to Sunday 2025-01-12
      expect(result).toEqual(utcDate(2025, 1, 12))
    })

    it('should handle billing start on Saturday with now on Sunday', () => {
      // 2025-01-04 is a Saturday (6)
      const billingStart = utcDate(2025, 1, 4)
      // 2025-01-12 is a Sunday (0) — 1 day after Saturday
      const now = utcDate(2025, 1, 12)

      const result = getWeekStart(billingStart, now)

      // Should go back 1 day to Saturday 2025-01-11
      expect(result).toEqual(utcDate(2025, 1, 11))
    })

    it('should zero out hours/minutes/seconds', () => {
      const billingStart = utcDate(2025, 1, 8) // Wednesday
      const now = new Date(Date.UTC(2025, 0, 17, 14, 30, 45, 123)) // Friday with time

      const result = getWeekStart(billingStart, now)

      expect(result.getUTCHours()).toBe(0)
      expect(result.getUTCMinutes()).toBe(0)
      expect(result.getUTCSeconds()).toBe(0)
      expect(result.getUTCMilliseconds()).toBe(0)
    })
  })

  describe('getWeekEnd', () => {
    it('should return exactly 7 days after week start', () => {
      const billingStart = utcDate(2025, 1, 8) // Wednesday
      const now = utcDate(2025, 1, 17) // Friday

      const weekStart = getWeekStart(billingStart, now)
      const weekEnd = getWeekEnd(billingStart, now)

      const diffMs = weekEnd.getTime() - weekStart.getTime()
      const diffDays = diffMs / (24 * 60 * 60 * 1000)

      expect(diffDays).toBe(7)
    })

    it('should return start of next billing-aligned week', () => {
      // 2025-01-08 is a Wednesday
      const billingStart = utcDate(2025, 1, 8)
      // 2025-01-17 is a Friday → week start is Wed 2025-01-15
      const now = utcDate(2025, 1, 17)

      const result = getWeekEnd(billingStart, now)

      // Next Wednesday: 2025-01-22
      expect(result).toEqual(utcDate(2025, 1, 22))
    })
  })

  describe('isWeeklyLimitError', () => {
    it('should return true for WeeklyLimitError', () => {
      const error: WeeklyLimitError = {
        error: 'weekly_limit_reached',
        used: 1000,
        limit: 1000,
        resetsAt: new Date(),
      }

      expect(isWeeklyLimitError(error)).toBe(true)
    })

    it('should return false for BlockGrant', () => {
      const grant: BlockGrant = {
        grantId: 'grant-1',
        credits: 500,
        expiresAt: new Date(),
        isNew: true,
      }

      expect(isWeeklyLimitError(grant)).toBe(false)
    })
  })

  describe('getSubscriptionLimits', () => {
    function createConnMock(overrides: Array<{
      credits_per_block: number
      block_duration_hours: number
      weekly_credit_limit: number
    }>) {
      return {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => overrides,
            }),
          }),
        }),
        update: () => ({}),
        insert: () => ({}),
      } as any
    }

    it('should use limit override when one exists', async () => {
      const conn = createConnMock([{
        credits_per_block: 9999,
        block_duration_hours: 10,
        weekly_credit_limit: 50000,
      }])

      const result = await getSubscriptionLimits({
        userId: 'user-123',
        logger,
        conn,
        tier: 200,
      })

      expect(result).toEqual({
        creditsPerBlock: 9999,
        blockDurationHours: 10,
        weeklyCreditsLimit: 50000,
      })
    })

    it('should use tier config when no override exists and tier is valid', async () => {
      const conn = createConnMock([])

      const result = await getSubscriptionLimits({
        userId: 'user-123',
        logger,
        conn,
        tier: 100,
      })

      expect(result).toEqual({
        creditsPerBlock: SUBSCRIPTION_TIERS[100].creditsPerBlock,
        blockDurationHours: SUBSCRIPTION_TIERS[100].blockDurationHours,
        weeklyCreditsLimit: SUBSCRIPTION_TIERS[100].weeklyCreditsLimit,
      })
    })

    it('should fall back to DEFAULT_TIER when tier is null', async () => {
      const conn = createConnMock([])

      const result = await getSubscriptionLimits({
        userId: 'user-123',
        logger,
        conn,
        tier: null,
      })

      expect(result).toEqual({
        creditsPerBlock: DEFAULT_TIER.creditsPerBlock,
        blockDurationHours: DEFAULT_TIER.blockDurationHours,
        weeklyCreditsLimit: DEFAULT_TIER.weeklyCreditsLimit,
      })
    })

    it('should fall back to DEFAULT_TIER when tier is invalid', async () => {
      const conn = createConnMock([])

      const result = await getSubscriptionLimits({
        userId: 'user-123',
        logger,
        conn,
        tier: 999,
      })

      expect(result).toEqual({
        creditsPerBlock: DEFAULT_TIER.creditsPerBlock,
        blockDurationHours: DEFAULT_TIER.blockDurationHours,
        weeklyCreditsLimit: DEFAULT_TIER.weeklyCreditsLimit,
      })
    })

  })

  describe('migrateUnusedCredits', () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    it('should insert idempotency marker when no unused grants exist', async () => {
      const { conn, captures } = createSequentialMock({
        selectResults: [[]], // no unused grants
      })

      await migrateUnusedCredits({
        tx: conn,
        userId: 'user-123',
        subscriptionId: 'sub-123',
        expiresAt: futureDate,
        logger,
      })

      expect(captures.insertValues).toHaveLength(1)
      expect(captures.insertValues[0].operation_id).toBe('subscribe-migrate-sub-123')
      expect(captures.insertValues[0].principal).toBe(0)
      expect(captures.insertValues[0].balance).toBe(0)
    })

    it('should zero old grants and create migration grant with correct total', async () => {
      const { conn, captures } = createSequentialMock({
        selectResults: [[
          { operation_id: 'g1', balance: 300 },
          { operation_id: 'g2', balance: 200 },
        ]],
      })

      await migrateUnusedCredits({
        tx: conn,
        userId: 'user-123',
        subscriptionId: 'sub-123',
        expiresAt: futureDate,
        logger,
      })

      expect(captures.updateSets).toHaveLength(2)
      expect(captures.updateSets[0]).toEqual({
        balance: 0,
        description: 'Migrated 300 credits to subscribe-migrate-sub-123',
      })
      expect(captures.updateSets[1]).toEqual({
        balance: 0,
        description: 'Migrated 200 credits to subscribe-migrate-sub-123',
      })

      expect(captures.insertValues).toHaveLength(1)
      expect(captures.insertValues[0].principal).toBe(500)
      expect(captures.insertValues[0].balance).toBe(500)
      expect(captures.insertValues[0].operation_id).toBe('subscribe-migrate-sub-123')
      expect(captures.insertValues[0].type).toBe('free')
    })
  })

  describe('expireActiveBlockGrants', () => {
    it('should return count of expired grants', async () => {
      const { conn } = createSequentialMock({
        updateResults: [[{ operation_id: 'op1' }, { operation_id: 'op2' }]],
      })

      const count = await expireActiveBlockGrants({
        userId: 'user-123',
        subscriptionId: 'sub-123',
        logger,
        conn,
      })

      expect(count).toBe(2)
    })

    it('should return 0 when no active grants exist', async () => {
      const { conn } = createSequentialMock({
        updateResults: [[]],
      })

      const count = await expireActiveBlockGrants({
        userId: 'user-123',
        subscriptionId: 'sub-123',
        logger,
        conn,
      })

      expect(count).toBe(0)
    })
  })

  describe('checkRateLimit', () => {
    const subscription = createMockSubscription()

    it('should report weekly_limit when usage reaches limit', async () => {
      const weeklyLimit = SUBSCRIPTION_TIERS[200].weeklyCreditsLimit
      const { conn } = createSequentialMock({
        selectResults: [
          [],                      // no limit overrides
          [{ total: weeklyLimit }], // weekly usage at limit
        ],
      })

      const result = await checkRateLimit({
        userId: 'user-123',
        subscription,
        logger,
        conn,
      })

      expect(result.limited).toBe(true)
      expect(result.reason).toBe('weekly_limit')
      expect(result.canStartNewBlock).toBe(false)
      expect(result.weeklyUsed).toBe(weeklyLimit)
      expect(result.weeklyLimit).toBe(weeklyLimit)
    })

    it('should allow new block when no active block exists', async () => {
      const { conn } = createSequentialMock({
        selectResults: [
          [],                 // no limit overrides
          [{ total: 5000 }], // under weekly limit
          [],                 // no active blocks
        ],
      })

      const result = await checkRateLimit({
        userId: 'user-123',
        subscription,
        logger,
        conn,
      })

      expect(result.limited).toBe(false)
      expect(result.canStartNewBlock).toBe(true)
      expect(result.weeklyUsed).toBe(5000)
    })

    it('should report block_exhausted when block has no balance', async () => {
      const futureExpiry = new Date(Date.now() + 3 * 60 * 60 * 1000)
      const { conn } = createSequentialMock({
        selectResults: [
          [],                 // no limit overrides
          [{ total: 5000 }], // under weekly limit
          [{ balance: 0, principal: 1200, expires_at: futureExpiry }],
        ],
      })

      const result = await checkRateLimit({
        userId: 'user-123',
        subscription,
        logger,
        conn,
      })

      expect(result.limited).toBe(true)
      expect(result.reason).toBe('block_exhausted')
      expect(result.blockUsed).toBe(1200)
      expect(result.blockLimit).toBe(1200)
    })

    it('should report not limited when block has remaining credits', async () => {
      const futureExpiry = new Date(Date.now() + 3 * 60 * 60 * 1000)
      const { conn } = createSequentialMock({
        selectResults: [
          [],                 // no limit overrides
          [{ total: 5000 }], // under weekly limit
          [{ balance: 800, principal: 1200, expires_at: futureExpiry }],
        ],
      })

      const result = await checkRateLimit({
        userId: 'user-123',
        subscription,
        logger,
        conn,
      })

      expect(result.limited).toBe(false)
      expect(result.canStartNewBlock).toBe(false)
      expect(result.blockUsed).toBe(400)
      expect(result.blockLimit).toBe(1200)
    })
  })

  describe('ensureActiveBlockGrantCallback', () => {
    const subscription = createMockSubscription()

    it('should return existing active grant', async () => {
      const futureExpiry = new Date(Date.now() + 3 * 60 * 60 * 1000)
      const { conn } = createSequentialMock({
        selectResults: [
          [{ operation_id: 'existing-grant', balance: 500, expires_at: futureExpiry }],
        ],
      })

      const result = await ensureActiveBlockGrantCallback({
        conn,
        userId: 'user-123',
        subscription,
        logger,
      })

      expect(isWeeklyLimitError(result)).toBe(false)
      const grant = result as BlockGrant
      expect(grant.grantId).toBe('existing-grant')
      expect(grant.credits).toBe(500)
      expect(grant.isNew).toBe(false)
    })

    it('should return weekly limit error when limit is reached', async () => {
      const weeklyLimit = SUBSCRIPTION_TIERS[200].weeklyCreditsLimit
      const { conn } = createSequentialMock({
        selectResults: [
          [],                      // no existing grants
          [],                      // no limit overrides
          [{ total: weeklyLimit }], // weekly limit reached
        ],
      })

      const result = await ensureActiveBlockGrantCallback({
        conn,
        userId: 'user-123',
        subscription,
        logger,
      })

      expect(isWeeklyLimitError(result)).toBe(true)
      const error = result as WeeklyLimitError
      expect(error.error).toBe('weekly_limit_reached')
      expect(error.used).toBe(weeklyLimit)
      expect(error.limit).toBe(weeklyLimit)
    })

    it('should create new block grant when none exists', async () => {
      const now = new Date('2025-01-15T10:00:00Z')
      const { conn } = createSequentialMock({
        selectResults: [
          [],               // no existing grants
          [],               // no limit overrides
          [{ total: 0 }],  // no weekly usage
        ],
        insertResults: [
          [{ operation_id: 'new-block-grant' }],
        ],
      })

      const result = await ensureActiveBlockGrantCallback({
        conn,
        userId: 'user-123',
        subscription,
        logger,
        now,
      })

      expect(isWeeklyLimitError(result)).toBe(false)
      const grant = result as BlockGrant
      expect(grant.isNew).toBe(true)
      expect(grant.grantId).toBe('new-block-grant')
      expect(grant.credits).toBe(SUBSCRIPTION_TIERS[200].creditsPerBlock)
      expect(grant.expiresAt.getTime()).toBe(
        now.getTime() + SUBSCRIPTION_TIERS[200].blockDurationHours * 60 * 60 * 1000,
      )
    })

    it('should cap block credits to weekly remaining', async () => {
      const weeklyLimit = SUBSCRIPTION_TIERS[200].weeklyCreditsLimit
      const expectedRemaining = 500
      const weeklyUsed = weeklyLimit - expectedRemaining
      const now = new Date('2025-01-15T10:00:00Z')
      const { conn, captures } = createSequentialMock({
        selectResults: [
          [],                    // no existing grants
          [],                    // no limit overrides
          [{ total: weeklyUsed }], // expectedRemaining credits remaining
        ],
        insertResults: [
          [{ operation_id: 'capped-block' }],
        ],
      })

      const result = await ensureActiveBlockGrantCallback({
        conn,
        userId: 'user-123',
        subscription,
        logger,
        now,
      })

      expect(isWeeklyLimitError(result)).toBe(false)
      const grant = result as BlockGrant
      expect(grant.credits).toBe(expectedRemaining)
      expect(captures.insertValues[0].principal).toBe(expectedRemaining)
      expect(captures.insertValues[0].balance).toBe(expectedRemaining)
    })

    it('should throw when insert returns no grant (duplicate operation)', async () => {
      const now = new Date('2025-01-15T10:00:00Z')
      const { conn } = createSequentialMock({
        selectResults: [
          [],               // no existing grants
          [],               // no limit overrides
          [{ total: 0 }],  // no weekly usage
        ],
        insertResults: [
          [],               // empty — simulates onConflictDoNothing
        ],
      })

      await expect(
        ensureActiveBlockGrantCallback({
          conn,
          userId: 'user-123',
          subscription,
          logger,
          now,
        }),
      ).rejects.toThrow('Failed to create block grant')
    })
  })
})
