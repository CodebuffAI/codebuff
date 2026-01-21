/**
 * Integration tests for balance-calculator.ts UNION query behavior.
 *
 * These tests run against a real PostgreSQL database to verify that the
 * Drizzle ORM generates correct SQL for the UNION query in
 * getOrderedActiveGrantsForConsumption.
 *
 * To run these tests:
 * 1. Ensure the E2E database is running (see packages/internal/src/db/e2e-constants.ts)
 * 2. Run: DATABASE_URL=<your-test-db-url> bun test balance-calculator.integration
 *
 * Tests will be skipped if DATABASE_URL is not available.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { eq, and, asc, desc, ne, or, gt, isNull, sql } from 'drizzle-orm'
import { union } from 'drizzle-orm/pg-core'
import * as schema from '@codebuff/internal/db/schema'
import { consumeFromOrderedGrants } from '../balance-calculator'

import type { Logger } from '@codebuff/common/types/contracts/logger'

// Test logger that silently discards all logs
const testLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

// Test configuration
const TEST_USER_ID = 'integration-test-user-balance-calc'
const TEST_DATABASE_URL = process.env.DATABASE_URL

// Skip all tests if no DATABASE_URL is available
const shouldSkip = !TEST_DATABASE_URL

// Create test database connection
let testClient: ReturnType<typeof postgres> | null = null
let testDb: ReturnType<typeof drizzle<typeof schema>> | null = null

function getTestDb() {
  if (!testDb) {
    throw new Error('Test database not initialized')
  }
  return testDb
}

// Helper to create grants with specific properties
function createGrantData(overrides: {
  operation_id: string
  balance: number
  priority: number
  expires_at: Date | null
  created_at: Date
  principal?: number
}) {
  return {
    operation_id: overrides.operation_id,
    user_id: TEST_USER_ID,
    principal: overrides.principal ?? Math.max(overrides.balance, 100),
    balance: overrides.balance,
    type: 'free' as const,
    description: 'Integration test grant',
    priority: overrides.priority,
    expires_at: overrides.expires_at,
    created_at: overrides.created_at,
  }
}

// Helper to build active grants filter (mirrors production code)
function buildActiveGrantsFilter(userId: string, now: Date) {
  return and(
    eq(schema.creditLedger.user_id, userId),
    or(
      isNull(schema.creditLedger.expires_at),
      gt(schema.creditLedger.expires_at, now),
    ),
  )
}

// Helper that mirrors the production getOrderedActiveGrantsForConsumption
async function getOrderedActiveGrantsForConsumption(params: {
  userId: string
  now: Date
  conn: ReturnType<typeof drizzle<typeof schema>>
}) {
  const { userId, now, conn } = params
  const activeGrantsFilter = buildActiveGrantsFilter(userId, now)

  const grants = await union(
    conn
      .select()
      .from(schema.creditLedger)
      .where(and(activeGrantsFilter, ne(schema.creditLedger.balance, 0))),
    conn
      .select()
      .from(schema.creditLedger)
      .where(activeGrantsFilter)
      .orderBy(
        desc(schema.creditLedger.priority),
        sql`${schema.creditLedger.expires_at} DESC NULLS FIRST`,
        desc(schema.creditLedger.created_at),
      )
      .limit(1),
  ).orderBy(
    asc(schema.creditLedger.priority),
    sql`${schema.creditLedger.expires_at} ASC NULLS LAST`,
    asc(schema.creditLedger.created_at),
  )

  return grants
}

describe.skipIf(shouldSkip)(
  'Balance Calculator - Integration Tests (Real DB)',
  () => {
    beforeAll(async () => {
      if (shouldSkip) return

      // Create test database connection
      testClient = postgres(TEST_DATABASE_URL!)
      testDb = drizzle(testClient, { schema })

      // Create test user if not exists
      try {
        await testDb.insert(schema.user).values({
          id: TEST_USER_ID,
          email: 'integration-test@codebuff.test',
          name: 'Integration Test User',
        })
      } catch {
        // User might already exist, that's fine
      }
    })

    afterAll(async () => {
      if (shouldSkip || !testDb || !testClient) return

      // Clean up test user and all their grants
      await testDb
        .delete(schema.creditLedger)
        .where(eq(schema.creditLedger.user_id, TEST_USER_ID))
      await testDb.delete(schema.user).where(eq(schema.user.id, TEST_USER_ID))

      // Close connection
      await testClient.end()
    })

    afterEach(async () => {
      if (shouldSkip || !testDb) return

      // Clean up grants between tests for isolation
      await testDb
        .delete(schema.creditLedger)
        .where(eq(schema.creditLedger.user_id, TEST_USER_ID))
    })

    describe('getOrderedActiveGrantsForConsumption UNION query', () => {
      it('should return grants ordered by priority ASC, expires_at ASC NULLS LAST, created_at ASC', async () => {
        const db = getTestDb()
        const now = new Date()

        // Insert grants in random order
        await db.insert(schema.creditLedger).values([
          createGrantData({
            operation_id: 'int-test-grant-3',
            balance: 100,
            priority: 30,
            expires_at: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          }),
          createGrantData({
            operation_id: 'int-test-grant-1',
            balance: 100,
            priority: 10,
            expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          }),
          createGrantData({
            operation_id: 'int-test-grant-2',
            balance: 100,
            priority: 10, // Same priority as grant-1
            expires_at: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000), // Expires sooner
            created_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
          }),
          createGrantData({
            operation_id: 'int-test-grant-4',
            balance: 100,
            priority: 60, // Lowest priority
            expires_at: null, // Never expires
            created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          }),
        ])

        const grants = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        expect(grants.map((g) => g.operation_id)).toEqual([
          'int-test-grant-2', // priority 10, expires soonest
          'int-test-grant-1', // priority 10, expires later
          'int-test-grant-3', // priority 30
          'int-test-grant-4', // priority 60, never expires (NULLS LAST)
        ])
      })

      it('should include zero-balance last grant for debt recording', async () => {
        const db = getTestDb()
        const now = new Date()

        await db.insert(schema.creditLedger).values([
          createGrantData({
            operation_id: 'int-test-positive',
            balance: 100,
            priority: 10,
            expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          }),
          createGrantData({
            operation_id: 'int-test-zero-last',
            balance: 0, // Zero balance
            priority: 60, // Lowest priority = last grant
            expires_at: null, // Never expires
            created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          }),
        ])

        const grants = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        // Should include both: non-zero + zero-balance last grant
        expect(grants.length).toBe(2)
        expect(grants.map((g) => g.operation_id)).toEqual([
          'int-test-positive',
          'int-test-zero-last',
        ])
      })

      it('should deduplicate when last grant has non-zero balance', async () => {
        const db = getTestDb()
        const now = new Date()

        await db.insert(schema.creditLedger).values([
          createGrantData({
            operation_id: 'int-test-first',
            balance: 100,
            priority: 10,
            expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          }),
          createGrantData({
            operation_id: 'int-test-last-nonzero',
            balance: 50, // Non-zero balance
            priority: 60, // Lowest priority = last grant
            expires_at: null,
            created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          }),
        ])

        const grants = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        // UNION should deduplicate - last grant appears only once
        expect(grants.length).toBe(2)
        expect(
          grants.filter((g) => g.operation_id === 'int-test-last-nonzero')
            .length,
        ).toBe(1)
      })

      it('should handle all-zero-balance grants correctly', async () => {
        const db = getTestDb()
        const now = new Date()

        await db.insert(schema.creditLedger).values([
          createGrantData({
            operation_id: 'int-test-zero-1',
            balance: 0,
            priority: 10,
            expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          }),
          createGrantData({
            operation_id: 'int-test-zero-2',
            balance: 0,
            priority: 60, // This is the "last grant"
            expires_at: null,
            created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
          }),
        ])

        const grants = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        // Only the last grant should be returned (for debt recording)
        expect(grants.length).toBe(1)
        expect(grants[0].operation_id).toBe('int-test-zero-2')
      })

      it('should correctly order NULL expires_at as NULLS LAST in consumption order', async () => {
        const db = getTestDb()
        const now = new Date()

        await db.insert(schema.creditLedger).values([
          createGrantData({
            operation_id: 'int-test-expires-soon',
            balance: 100,
            priority: 60, // Same priority
            expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          }),
          createGrantData({
            operation_id: 'int-test-never-expires',
            balance: 100,
            priority: 60, // Same priority
            expires_at: null, // Never expires
            created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          }),
        ])

        const grants = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        // In consumption order: expires-soon first, never-expires last
        expect(grants[0].operation_id).toBe('int-test-expires-soon')
        expect(grants[1].operation_id).toBe('int-test-never-expires')
      })

      it('should filter out expired grants', async () => {
        const db = getTestDb()
        const now = new Date()

        await db.insert(schema.creditLedger).values([
          createGrantData({
            operation_id: 'int-test-active',
            balance: 100,
            priority: 10,
            expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          }),
          createGrantData({
            operation_id: 'int-test-expired',
            balance: 100,
            priority: 10,
            expires_at: new Date(now.getTime() - 1000), // Already expired
            created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          }),
        ])

        const grants = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        // Only active grant should be returned
        expect(grants.length).toBe(1)
        expect(grants[0].operation_id).toBe('int-test-active')
      })

      it('should handle empty grants case', async () => {
        const db = getTestDb()
        const now = new Date()

        // Don't insert any grants

        const grants = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        expect(grants).toEqual([])
      })

      it('should handle single grant case', async () => {
        const db = getTestDb()
        const now = new Date()

        await db.insert(schema.creditLedger).values([
          createGrantData({
            operation_id: 'int-test-single',
            balance: 100,
            priority: 10,
            expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          }),
        ])

        const grants = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        // Single grant should be returned (deduplicated by UNION)
        expect(grants.length).toBe(1)
        expect(grants[0].operation_id).toBe('int-test-single')
      })

      it('should handle grants with identical priority, expires_at, and created_at deterministically', async () => {
        const db = getTestDb()
        const now = new Date()

        // Create grants with IDENTICAL sorting fields (priority, expires_at, created_at)
        // This tests the known non-determinism issue - without a tiebreaker like operation_id,
        // PostgreSQL may return these in any order
        const sharedExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        const sharedCreatedAt = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)
        const sharedPriority = 10

        await db.insert(schema.creditLedger).values([
          createGrantData({
            operation_id: 'int-test-identical-a',
            balance: 100,
            priority: sharedPriority,
            expires_at: sharedExpiresAt,
            created_at: sharedCreatedAt,
          }),
          createGrantData({
            operation_id: 'int-test-identical-b',
            balance: 100,
            priority: sharedPriority,
            expires_at: sharedExpiresAt,
            created_at: sharedCreatedAt,
          }),
          createGrantData({
            operation_id: 'int-test-identical-c',
            balance: 100,
            priority: sharedPriority,
            expires_at: sharedExpiresAt,
            created_at: sharedCreatedAt,
          }),
        ])

        // Query multiple times to verify ordering stability
        const grants1 = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        const grants2 = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        const grants3 = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        // All grants should be returned
        expect(grants1.length).toBe(3)
        expect(grants2.length).toBe(3)
        expect(grants3.length).toBe(3)

        // Extract operation_ids for comparison
        const order1 = grants1.map((g) => g.operation_id)
        const order2 = grants2.map((g) => g.operation_id)
        const order3 = grants3.map((g) => g.operation_id)

        // All should contain the same grants
        expect(order1.sort()).toEqual(['int-test-identical-a', 'int-test-identical-b', 'int-test-identical-c'])

        // NOTE: This test documents the non-determinism issue.
        // Without an operation_id tiebreaker in the ORDER BY clause,
        // these assertions may randomly fail as PostgreSQL doesn't guarantee
        // a stable order for rows with identical sorting keys.
        // If this test fails intermittently, add operation_id as a tiebreaker.
        expect(order1).toEqual(order2)
        expect(order2).toEqual(order3)
      })
    })

    describe('consumeCredits end-to-end tests', () => {
      // Helper to get grant balance from DB
      async function getGrantBalance(operationId: string): Promise<number> {
        const db = getTestDb()
        const result = await db
          .select({ balance: schema.creditLedger.balance })
          .from(schema.creditLedger)
          .where(eq(schema.creditLedger.operation_id, operationId))
        return result[0]?.balance ?? 0
      }

      it('should consume credits from grants in priority order', async () => {
        const db = getTestDb()
        const now = new Date()

        // Insert grants with different priorities
        await db.insert(schema.creditLedger).values([
          createGrantData({
            operation_id: 'e2e-high-priority',
            balance: 50,
            principal: 50,
            priority: 10, // Consumed first
            expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          }),
          createGrantData({
            operation_id: 'e2e-low-priority',
            balance: 100,
            principal: 100,
            priority: 60, // Consumed second
            expires_at: null,
            created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          }),
        ])

        // Get grants in consumption order
        const grants = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        // Consume 70 credits (should take 50 from high-priority, 20 from low-priority)
        const result = await consumeFromOrderedGrants({
          userId: TEST_USER_ID,
          creditsToConsume: 70,
          grants,
          tx: db as any,
          logger: testLogger,
        })

        expect(result.consumed).toBe(70)

        // Verify balances in database
        const highPriorityBalance = await getGrantBalance('e2e-high-priority')
        const lowPriorityBalance = await getGrantBalance('e2e-low-priority')

        expect(highPriorityBalance).toBe(0) // 50 - 50 = 0
        expect(lowPriorityBalance).toBe(80) // 100 - 20 = 80
      })

      it('should record debt on last grant when all credits exhausted', async () => {
        const db = getTestDb()
        const now = new Date()

        // Insert grants with limited balance
        await db.insert(schema.creditLedger).values([
          createGrantData({
            operation_id: 'e2e-depleted',
            balance: 30,
            principal: 30,
            priority: 10,
            expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          }),
          createGrantData({
            operation_id: 'e2e-last-grant',
            balance: 0, // Already exhausted - this is the "last grant" for debt
            principal: 100,
            priority: 60,
            expires_at: null,
            created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          }),
        ])

        // Get grants in consumption order
        const grants = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        // Consume 100 credits (only 30 available, should create 70 debt)
        const result = await consumeFromOrderedGrants({
          userId: TEST_USER_ID,
          creditsToConsume: 100,
          grants,
          tx: db as any,
          logger: testLogger,
        })

        expect(result.consumed).toBe(100)

        // Verify balances in database
        const depletedBalance = await getGrantBalance('e2e-depleted')
        const lastGrantBalance = await getGrantBalance('e2e-last-grant')

        expect(depletedBalance).toBe(0) // 30 - 30 = 0
        expect(lastGrantBalance).toBe(-70) // 0 - 70 = -70 (debt)
      })

      it('should consume partial credits from multiple grants correctly', async () => {
        const db = getTestDb()
        const now = new Date()

        // Insert three grants
        await db.insert(schema.creditLedger).values([
          createGrantData({
            operation_id: 'e2e-grant-1',
            balance: 25,
            principal: 25,
            priority: 10,
            expires_at: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          }),
          createGrantData({
            operation_id: 'e2e-grant-2',
            balance: 50,
            principal: 50,
            priority: 10,
            expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          }),
          createGrantData({
            operation_id: 'e2e-grant-3',
            balance: 100,
            principal: 100,
            priority: 60,
            expires_at: null,
            created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          }),
        ])

        // Get grants in consumption order
        const grants = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        // Consume 60 credits (should take 25 from grant-1, 35 from grant-2)
        const result = await consumeFromOrderedGrants({
          userId: TEST_USER_ID,
          creditsToConsume: 60,
          grants,
          tx: db as any,
          logger: testLogger,
        })

        expect(result.consumed).toBe(60)

        // Verify balances in database
        const grant1Balance = await getGrantBalance('e2e-grant-1')
        const grant2Balance = await getGrantBalance('e2e-grant-2')
        const grant3Balance = await getGrantBalance('e2e-grant-3')

        expect(grant1Balance).toBe(0) // 25 - 25 = 0
        expect(grant2Balance).toBe(15) // 50 - 35 = 15
        expect(grant3Balance).toBe(100) // Untouched
      })

      it('should repay debt when consuming from grants with negative balance', async () => {
        const db = getTestDb()
        const now = new Date()

        // Insert grants: one with debt, one with positive balance
        await db.insert(schema.creditLedger).values([
          createGrantData({
            operation_id: 'e2e-debt-grant',
            balance: -50, // Has debt
            principal: 100,
            priority: 60,
            expires_at: null,
            created_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          }),
          createGrantData({
            operation_id: 'e2e-positive-grant',
            balance: 100,
            principal: 100,
            priority: 10,
            expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          }),
        ])

        // Get grants in consumption order
        const grants = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        // Consume 80 credits
        // The consumption algorithm works as follows:
        // 1. First pass (debt repayment): Uses creditsToConsume to repay debt
        //    - debt-grant has -50, repay 50 from the 80 requested, debt becomes 0
        //    - remainingToConsume = 30, consumed = 50
        // 2. Second pass (consumption): Consumes from positive balances
        //    - positive-grant has 100, consume 30, becomes 70
        //    - remainingToConsume = 0, consumed = 80
        const result = await consumeFromOrderedGrants({
          userId: TEST_USER_ID,
          creditsToConsume: 80,
          grants,
          tx: db as any,
          logger: testLogger,
        })

        expect(result.consumed).toBe(80)

        // Verify balances in database
        const debtGrantBalance = await getGrantBalance('e2e-debt-grant')
        const positiveGrantBalance = await getGrantBalance('e2e-positive-grant')

        // Debt should be repaid: -50 + 50 = 0
        expect(debtGrantBalance).toBe(0)
        // Positive grant: 100 - 30 (consume after debt repayment) = 70
        expect(positiveGrantBalance).toBe(70)
      })

      it('should track purchased credits consumption correctly', async () => {
        const db = getTestDb()
        const now = new Date()

        // Insert a mix of free and purchased grants
        await db.insert(schema.creditLedger).values([
          {
            operation_id: 'e2e-free-grant',
            user_id: TEST_USER_ID,
            balance: 30,
            principal: 30,
            type: 'free' as const,
            description: 'Free credits',
            priority: 10,
            expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
            created_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
          },
          {
            operation_id: 'e2e-purchased-grant',
            user_id: TEST_USER_ID,
            balance: 100,
            principal: 100,
            type: 'purchase' as const,
            description: 'Purchased credits',
            priority: 60,
            expires_at: null,
            created_at: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
          },
        ])

        // Get grants in consumption order
        const grants = await getOrderedActiveGrantsForConsumption({
          userId: TEST_USER_ID,
          now,
          conn: db,
        })

        // Consume 50 credits (30 from free, 20 from purchased)
        const result = await consumeFromOrderedGrants({
          userId: TEST_USER_ID,
          creditsToConsume: 50,
          grants,
          tx: db as any,
          logger: testLogger,
        })

        expect(result.consumed).toBe(50)
        expect(result.fromPurchased).toBe(20) // Only 20 came from purchase grant

        // Verify balances in database
        const freeBalance = await getGrantBalance('e2e-free-grant')
        const purchasedBalance = await getGrantBalance('e2e-purchased-grant')

        expect(freeBalance).toBe(0) // 30 - 30 = 0
        expect(purchasedBalance).toBe(80) // 100 - 20 = 80
      })
    })
  },
)
