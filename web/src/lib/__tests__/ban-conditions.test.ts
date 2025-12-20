export {}

import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'

import type { BanConditionContext } from '../ban-conditions'

let DISPUTE_THRESHOLD!: number
let DISPUTE_WINDOW_DAYS!: number
let banUser!: typeof import('../ban-conditions').banUser
let evaluateBanConditions!: typeof import('../ban-conditions').evaluateBanConditions
let getUserByStripeCustomerId!: typeof import('../ban-conditions').getUserByStripeCustomerId

let mockSelect!: ReturnType<typeof mock>
let mockUpdate!: ReturnType<typeof mock>
let mockDisputesList!: ReturnType<typeof mock>

const setupMocks = async () => {
  mockSelect = mock(() => ({
    from: mock(() => ({
      where: mock(() => ({
        limit: mock(() => Promise.resolve([])),
      })),
    })),
  }))

  mockUpdate = mock(() => ({
    set: mock(() => ({
      where: mock(() => Promise.resolve()),
    })),
  }))

  mockDisputesList = mock(() =>
    Promise.resolve({
      data: [],
    }),
  )

  await mockModule('@codebuff/internal/db', () => ({
    default: {
      select: mockSelect,
      update: mockUpdate,
    },
  }))

  await mockModule('@codebuff/internal/db/schema', () => ({
    user: {
      id: 'id',
      banned: 'banned',
      email: 'email',
      name: 'name',
      stripe_customer_id: 'stripe_customer_id',
    },
  }))

  await mockModule('@codebuff/internal/util/stripe', () => ({
    stripeServer: {
      disputes: {
        list: mockDisputesList,
      },
    },
  }))

  await mockModule('drizzle-orm', () => ({
    eq: mock((a: any, b: any) => ({ column: a, value: b })),
  }))

  const module = await import('../ban-conditions')
  DISPUTE_THRESHOLD = module.DISPUTE_THRESHOLD
  DISPUTE_WINDOW_DAYS = module.DISPUTE_WINDOW_DAYS
  banUser = module.banUser
  evaluateBanConditions = module.evaluateBanConditions
  getUserByStripeCustomerId = module.getUserByStripeCustomerId
}

await setupMocks()

const createMockLogger = () => ({
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
})

beforeEach(() => {
  mockDisputesList.mockClear()
  mockSelect.mockClear()
  mockUpdate.mockClear()
})

afterAll(() => {
  clearMockedModules()
})

describe('ban-conditions', () => {
  describe('DISPUTE_THRESHOLD and DISPUTE_WINDOW_DAYS', () => {
    it('has expected default threshold', () => {
      expect(DISPUTE_THRESHOLD).toBe(5)
    })

    it('has expected default window', () => {
      expect(DISPUTE_WINDOW_DAYS).toBe(14)
    })
  })

  describe('evaluateBanConditions', () => {
    it('returns shouldBan: false when no disputes exist', async () => {
      mockDisputesList.mockResolvedValueOnce({ data: [] })

      const logger = createMockLogger()
      const context: BanConditionContext = {
        userId: 'user-123',
        stripeCustomerId: 'cus_123',
        logger,
      }

      const result = await evaluateBanConditions(context)

      expect(result.shouldBan).toBe(false)
      expect(result.reason).toBe('')
    })

    it('returns shouldBan: false when disputes are below threshold', async () => {
      // Create disputes for the customer (below threshold)
      const disputes = Array.from(
        { length: DISPUTE_THRESHOLD - 1 },
        (_, i) => ({
          id: `dp_${i}`,
          charge: { customer: 'cus_123' },
          created: Math.floor(Date.now() / 1000),
        }),
      )

      mockDisputesList.mockResolvedValueOnce({ data: disputes })

      const logger = createMockLogger()
      const context: BanConditionContext = {
        userId: 'user-123',
        stripeCustomerId: 'cus_123',
        logger,
      }

      const result = await evaluateBanConditions(context)

      expect(result.shouldBan).toBe(false)
      expect(result.reason).toBe('')
    })

    it('returns shouldBan: true when disputes meet threshold', async () => {
      // Create disputes for the customer (at threshold)
      const disputes = Array.from({ length: DISPUTE_THRESHOLD }, (_, i) => ({
        id: `dp_${i}`,
        charge: { customer: 'cus_123' },
        created: Math.floor(Date.now() / 1000),
      }))

      mockDisputesList.mockResolvedValueOnce({ data: disputes })

      const logger = createMockLogger()
      const context: BanConditionContext = {
        userId: 'user-123',
        stripeCustomerId: 'cus_123',
        logger,
      }

      const result = await evaluateBanConditions(context)

      expect(result.shouldBan).toBe(true)
      expect(result.reason).toContain(`${DISPUTE_THRESHOLD} disputes`)
      expect(result.reason).toContain(`${DISPUTE_WINDOW_DAYS} days`)
    })

    it('returns shouldBan: true when disputes exceed threshold', async () => {
      // Create disputes for the customer (above threshold)
      const disputes = Array.from(
        { length: DISPUTE_THRESHOLD + 3 },
        (_, i) => ({
          id: `dp_${i}`,
          charge: { customer: 'cus_123' },
          created: Math.floor(Date.now() / 1000),
        }),
      )

      mockDisputesList.mockResolvedValueOnce({ data: disputes })

      const logger = createMockLogger()
      const context: BanConditionContext = {
        userId: 'user-123',
        stripeCustomerId: 'cus_123',
        logger,
      }

      const result = await evaluateBanConditions(context)

      expect(result.shouldBan).toBe(true)
      expect(result.reason).toContain(`${DISPUTE_THRESHOLD + 3} disputes`)
    })

    it('only counts disputes for the specified customer', async () => {
      // Mix of disputes from different customers
      const disputes = [
        // Disputes for our customer
        {
          id: 'dp_1',
          charge: { customer: 'cus_123' },
          created: Math.floor(Date.now() / 1000),
        },
        {
          id: 'dp_2',
          charge: { customer: 'cus_123' },
          created: Math.floor(Date.now() / 1000),
        },
        // Disputes for other customers (should be ignored)
        {
          id: 'dp_3',
          charge: { customer: 'cus_other' },
          created: Math.floor(Date.now() / 1000),
        },
        {
          id: 'dp_4',
          charge: { customer: 'cus_different' },
          created: Math.floor(Date.now() / 1000),
        },
        {
          id: 'dp_5',
          charge: { customer: 'cus_another' },
          created: Math.floor(Date.now() / 1000),
        },
        {
          id: 'dp_6',
          charge: { customer: 'cus_more' },
          created: Math.floor(Date.now() / 1000),
        },
      ]

      mockDisputesList.mockResolvedValueOnce({ data: disputes })

      const logger = createMockLogger()
      const context: BanConditionContext = {
        userId: 'user-123',
        stripeCustomerId: 'cus_123',
        logger,
      }

      const result = await evaluateBanConditions(context)

      // Only 2 disputes for cus_123, which is below threshold
      expect(result.shouldBan).toBe(false)
    })

    it('handles string customer ID in charge object', async () => {
      // Customer ID as string instead of object
      const disputes = Array.from({ length: DISPUTE_THRESHOLD }, (_, i) => ({
        id: `dp_${i}`,
        charge: { customer: 'cus_123' }, // String ID
        created: Math.floor(Date.now() / 1000),
      }))

      mockDisputesList.mockResolvedValueOnce({ data: disputes })

      const logger = createMockLogger()
      const context: BanConditionContext = {
        userId: 'user-123',
        stripeCustomerId: 'cus_123',
        logger,
      }

      const result = await evaluateBanConditions(context)

      expect(result.shouldBan).toBe(true)
    })

    it('handles customer object with id property', async () => {
      // Customer as object with id property
      const disputes = Array.from({ length: DISPUTE_THRESHOLD }, (_, i) => ({
        id: `dp_${i}`,
        charge: { customer: { id: 'cus_123' } }, // Object with id
        created: Math.floor(Date.now() / 1000),
      }))

      mockDisputesList.mockResolvedValueOnce({ data: disputes })

      const logger = createMockLogger()
      const context: BanConditionContext = {
        userId: 'user-123',
        stripeCustomerId: 'cus_123',
        logger,
      }

      const result = await evaluateBanConditions(context)

      expect(result.shouldBan).toBe(true)
    })

    it('calls Stripe API with correct time window and expand parameter', async () => {
      mockDisputesList.mockResolvedValueOnce({ data: [] })

      const logger = createMockLogger()
      const context: BanConditionContext = {
        userId: 'user-123',
        stripeCustomerId: 'cus_123',
        logger,
      }

      const beforeCall = Math.floor(Date.now() / 1000)
      await evaluateBanConditions(context)
      const afterCall = Math.floor(Date.now() / 1000)

      expect(mockDisputesList).toHaveBeenCalledTimes(1)
      const callArgs = mockDisputesList.mock.calls[0]?.[0]
      expect(callArgs.limit).toBe(100)
      // Verify expand parameter is set to get full charge object
      expect(callArgs.expand).toEqual(['data.charge'])

      // Verify the created.gte is within the expected window
      const expectedWindowStart =
        beforeCall - DISPUTE_WINDOW_DAYS * 24 * 60 * 60
      const windowTolerance = afterCall - beforeCall + 1 // Allow for time passing during test
      expect(callArgs.created.gte).toBeGreaterThanOrEqual(
        expectedWindowStart - windowTolerance,
      )
      expect(callArgs.created.gte).toBeLessThanOrEqual(
        expectedWindowStart + windowTolerance,
      )
    })

    // REGRESSION TEST: Without expand: ['data.charge'], dispute.charge is a string ID,
    // not an object, so dispute.charge.customer is undefined and no disputes match.
    // This test ensures we always expand the charge object.
    it('REGRESSION: must expand data.charge to access customer field', async () => {
      mockDisputesList.mockResolvedValueOnce({ data: [] })

      const logger = createMockLogger()
      const context: BanConditionContext = {
        userId: 'user-123',
        stripeCustomerId: 'cus_123',
        logger,
      }

      await evaluateBanConditions(context)

      const callArgs = mockDisputesList.mock.calls[0]?.[0]

      // This is critical: without expand, dispute.charge is just a string ID like "ch_xxx"
      // and we cannot access dispute.charge.customer to filter by customer.
      // If this test fails, the ban condition will NEVER match any disputes.
      expect(callArgs.expand).toBeDefined()
      expect(callArgs.expand).toContain('data.charge')
    })

    it('logs debug message after checking condition', async () => {
      mockDisputesList.mockResolvedValueOnce({ data: [] })

      const logger = createMockLogger()
      const context: BanConditionContext = {
        userId: 'user-123',
        stripeCustomerId: 'cus_123',
        logger,
      }

      await evaluateBanConditions(context)

      expect(logger.debug).toHaveBeenCalled()
    })
  })

  describe('getUserByStripeCustomerId', () => {
    it('returns user when found', async () => {
      const mockUser = {
        id: 'user-123',
        banned: false,
        email: 'test@example.com',
        name: 'Test User',
      }

      const limitMock = mock(() => Promise.resolve([mockUser]))
      const whereMock = mock(() => ({ limit: limitMock }))
      const fromMock = mock(() => ({ where: whereMock }))
      mockSelect.mockReturnValueOnce({ from: fromMock })

      const result = await getUserByStripeCustomerId('cus_123')

      expect(result).toEqual(mockUser)
    })

    it('returns null when user not found', async () => {
      const limitMock = mock(() => Promise.resolve([]))
      const whereMock = mock(() => ({ limit: limitMock }))
      const fromMock = mock(() => ({ where: whereMock }))
      mockSelect.mockReturnValueOnce({ from: fromMock })

      const result = await getUserByStripeCustomerId('cus_nonexistent')

      expect(result).toBeNull()
    })

    it('queries with correct stripe_customer_id', async () => {
      const limitMock = mock(() => Promise.resolve([]))
      const whereMock = mock(() => ({ limit: limitMock }))
      const fromMock = mock(() => ({ where: whereMock }))
      mockSelect.mockReturnValueOnce({ from: fromMock })

      await getUserByStripeCustomerId('cus_test_123')

      expect(mockSelect).toHaveBeenCalled()
      expect(fromMock).toHaveBeenCalled()
      expect(whereMock).toHaveBeenCalled()
      expect(limitMock).toHaveBeenCalledWith(1)
    })
  })

  describe('banUser', () => {
    it('updates user banned status to true', async () => {
      const whereMock = mock(() => Promise.resolve())
      const setMock = mock(() => ({ where: whereMock }))
      mockUpdate.mockReturnValueOnce({ set: setMock })

      const logger = createMockLogger()

      await banUser('user-123', 'Test ban reason', logger)

      expect(mockUpdate).toHaveBeenCalled()
      expect(setMock).toHaveBeenCalledWith({ banned: true })
    })

    it('logs the ban action with user ID and reason', async () => {
      const whereMock = mock(() => Promise.resolve())
      const setMock = mock(() => ({ where: whereMock }))
      mockUpdate.mockReturnValueOnce({ set: setMock })

      const logger = createMockLogger()
      const userId = 'user-123'
      const reason = 'Too many disputes'

      await banUser(userId, reason, logger)

      expect(logger.info).toHaveBeenCalledWith(
        { userId, reason },
        'User banned',
      )
    })
  })
})
