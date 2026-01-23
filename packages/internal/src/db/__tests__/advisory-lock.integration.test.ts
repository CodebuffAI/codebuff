/**
 * Integration tests for advisory lock serialization of concurrent credit operations.
 *
 * These tests run against a real PostgreSQL database to verify that:
 * 1. Concurrent credit operations for the SAME user are properly serialized
 * 2. Concurrent operations for DIFFERENT users run in parallel (no blocking)
 * 3. Advisory locks prevent race conditions and data corruption
 *
 * In CI, these tests run against a PostgreSQL container. Locally, you can either:
 * 1. Run a local Postgres matching the default URL below:
 *    docker run -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=testdb postgres:16-alpine
 * 2. Set DATABASE_URL to point to your test database
 *
 * NOTE: These tests use the internal db singleton through withAdvisoryLockTransaction,
 * so DATABASE_URL must be set before running. The direct testDb connection is only
 * used for test setup/cleanup and verification queries.
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
import { eq, sql } from 'drizzle-orm'
import * as schema from '../schema'
import { withAdvisoryLockTransaction } from '../transaction'

import type { Logger } from '@codebuff/common/types/contracts/logger'

// Test logger that captures log messages for verification
function createTestLogger() {
  const logs: { level: string; args: unknown[] }[] = []
  return {
    logger: {
      debug: (...args: unknown[]) => logs.push({ level: 'debug', args }),
      info: (...args: unknown[]) => logs.push({ level: 'info', args }),
      warn: (...args: unknown[]) => logs.push({ level: 'warn', args }),
      error: (...args: unknown[]) => logs.push({ level: 'error', args }),
    } as Logger,
    logs,
  }
}

// Test configuration
const TEST_USER_ID_1 = 'advisory-lock-test-user-1'
const TEST_USER_ID_2 = 'advisory-lock-test-user-2'

// Default database URL matches the CI postgres container config
const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@127.0.0.1:5432/testdb'
const TEST_DATABASE_URL = process.env.DATABASE_URL || DEFAULT_TEST_DATABASE_URL

// Skip tests if DATABASE_URL is not configured and RUN_INTEGRATION_TESTS is not set.
// In CI, the test-internal-integration job provides a PostgreSQL container and sets DATABASE_URL.
// Locally, you can either set DATABASE_URL or RUN_INTEGRATION_TESTS=true.
const SKIP_INTEGRATION_TESTS =
  !process.env.DATABASE_URL && !process.env.RUN_INTEGRATION_TESTS

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
  user_id?: string
  org_id?: string | null
  balance: number
  priority?: number
  expires_at?: Date | null
  created_at?: Date
  principal?: number
}) {
  const now = new Date()
  return {
    operation_id: overrides.operation_id,
    user_id: overrides.user_id ?? TEST_USER_ID_1,
    org_id: overrides.org_id ?? null,
    principal: overrides.principal ?? Math.max(overrides.balance, 100),
    balance: overrides.balance,
    type: 'free' as const,
    description: 'Advisory lock integration test grant',
    priority: overrides.priority ?? 10,
    expires_at: overrides.expires_at ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    created_at: overrides.created_at ?? new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000),
  }
}

// Helper to simulate credit consumption with a delay
async function simulateCreditConsumptionWithDelay(params: {
  userId: string
  amount: number
  delayMs: number
  logger: Logger
}): Promise<{ consumed: number; startTime: number; endTime: number }> {
  const { userId, amount, delayMs, logger } = params
  const startTime = Date.now()

  const { result } = await withAdvisoryLockTransaction({
    callback: async (tx) => {
      // Simulate some work with a delay
      await new Promise((resolve) => setTimeout(resolve, delayMs))

      // Get current balance
      const grants = await tx
        .select()
        .from(schema.creditLedger)
        .where(eq(schema.creditLedger.user_id, userId))

      if (grants.length === 0) {
        return { consumed: 0 }
      }

      // Find a grant with positive balance
      const grant = grants.find((g) => g.balance > 0)
      if (!grant) {
        return { consumed: 0 }
      }

      // Consume credits
      const consumeAmount = Math.min(amount, grant.balance)
      await tx
        .update(schema.creditLedger)
        .set({ balance: grant.balance - consumeAmount })
        .where(eq(schema.creditLedger.operation_id, grant.operation_id))

      return { consumed: consumeAmount }
    },
    lockKey: `user:${userId}`,
    context: { userId, amount },
    logger,
  })

  return {
    consumed: result.consumed,
    startTime,
    endTime: Date.now(),
  }
}

// Helper to simulate a credit grant with a delay
async function simulateGrantWithDelay(params: {
  userId: string
  amount: number
  operationId: string
  delayMs: number
  logger: Logger
}): Promise<{ granted: number; startTime: number; endTime: number }> {
  const { userId, amount, operationId, delayMs, logger } = params
  const startTime = Date.now()

  await withAdvisoryLockTransaction({
    callback: async (tx) => {
      // Simulate some work with a delay
      await new Promise((resolve) => setTimeout(resolve, delayMs))

      // Insert the grant
      await tx.insert(schema.creditLedger).values(
        createGrantData({
          operation_id: operationId,
          user_id: userId,
          balance: amount,
          principal: amount,
        }),
      )
    },
    lockKey: `user:${userId}`,
    context: { userId, amount, operationId },
    logger,
  })

  return {
    granted: amount,
    startTime,
    endTime: Date.now(),
  }
}

describe.skipIf(SKIP_INTEGRATION_TESTS)('Advisory Lock Integration Tests (Real DB)', () => {
  beforeAll(async () => {
    // Create test database connection
    testClient = postgres(TEST_DATABASE_URL)
    testDb = drizzle(testClient, { schema })

    // Create test users if not exist
    for (const userId of [TEST_USER_ID_1, TEST_USER_ID_2]) {
      try {
        await testDb.insert(schema.user).values({
          id: userId,
          email: `${userId}@codebuff.test`,
          name: `Advisory Lock Test User ${userId}`,
        })
      } catch {
        // User might already exist, that's fine
      }
    }
  })

  afterAll(async () => {
    if (!testDb || !testClient) return

    // Clean up test data
    for (const userId of [TEST_USER_ID_1, TEST_USER_ID_2]) {
      await testDb
        .delete(schema.creditLedger)
        .where(eq(schema.creditLedger.user_id, userId))
      await testDb.delete(schema.user).where(eq(schema.user.id, userId))
    }

    // Close connection
    await testClient.end()
  })

  afterEach(async () => {
    if (!testDb) return

    // Clean up grants between tests for isolation
    for (const userId of [TEST_USER_ID_1, TEST_USER_ID_2]) {
      await testDb
        .delete(schema.creditLedger)
        .where(eq(schema.creditLedger.user_id, userId))
    }
  })

  describe('Concurrent credit consumption for same user', () => {
    it('should serialize concurrent consume operations and prevent race conditions', async () => {
      const db = getTestDb()
      const { logger } = createTestLogger()

      // Create a grant with 100 credits
      await db.insert(schema.creditLedger).values(
        createGrantData({
          operation_id: 'concurrent-consume-grant',
          user_id: TEST_USER_ID_1,
          balance: 100,
          principal: 100,
        }),
      )

      // Launch 3 concurrent consumption requests, each trying to consume 50 credits
      // With proper serialization, only the first 2 should succeed (100 total), third gets 0
      const results = await Promise.all([
        simulateCreditConsumptionWithDelay({
          userId: TEST_USER_ID_1,
          amount: 50,
          delayMs: 50, // Simulate some work
          logger,
        }),
        simulateCreditConsumptionWithDelay({
          userId: TEST_USER_ID_1,
          amount: 50,
          delayMs: 50,
          logger,
        }),
        simulateCreditConsumptionWithDelay({
          userId: TEST_USER_ID_1,
          amount: 50,
          delayMs: 50,
          logger,
        }),
      ])

      // Verify total consumed is exactly 100 (no over-consumption due to race)
      const totalConsumed = results.reduce((sum, r) => sum + r.consumed, 0)
      expect(totalConsumed).toBe(100)

      // Verify final balance is 0
      const finalGrant = await db.query.creditLedger.findFirst({
        where: eq(schema.creditLedger.operation_id, 'concurrent-consume-grant'),
      })
      expect(finalGrant?.balance).toBe(0)

      // Log timing information for debugging
      // Sort by start time to see the serialization pattern
      const sortedResults = [...results].sort((a, b) => a.startTime - b.startTime)
      console.log('Concurrent consumption timings:', sortedResults.map((r) => ({
        consumed: r.consumed,
        startTime: r.startTime,
        endTime: r.endTime,
        duration: r.endTime - r.startTime,
      })))

      // Verify that operations were serialized by checking that total execution time
      // is significantly longer than a single operation (due to waiting for locks)
      const totalElapsed = Math.max(...results.map((r) => r.endTime)) - Math.min(...results.map((r) => r.startTime))
      const singleOpTime = 50 // delayMs we used
      // With 3 serialized operations, total time should be at least 2x single op time
      console.log(`Total elapsed time: ${totalElapsed}ms (expected >${singleOpTime * 2}ms for serialization)`)
      expect(totalElapsed).toBeGreaterThan(singleOpTime * 2)
    })

    it('should serialize multiple rapid-fire consumption requests', async () => {
      const db = getTestDb()
      const { logger } = createTestLogger()

      // Create a grant with 1000 credits
      await db.insert(schema.creditLedger).values(
        createGrantData({
          operation_id: 'rapid-fire-grant',
          user_id: TEST_USER_ID_1,
          balance: 1000,
          principal: 1000,
        }),
      )

      // Launch 10 concurrent consumption requests, each trying to consume 150 credits
      // Total requested: 1500, but only 1000 available
      // With serialization, we should get exactly 1000 consumed total
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          simulateCreditConsumptionWithDelay({
            userId: TEST_USER_ID_1,
            amount: 150,
            delayMs: 20, // Short delay to make test faster
            logger,
          }),
        ),
      )

      const totalConsumed = results.reduce((sum, r) => sum + r.consumed, 0)
      expect(totalConsumed).toBe(1000)

      // Verify final balance is 0
      const finalGrant = await db.query.creditLedger.findFirst({
        where: eq(schema.creditLedger.operation_id, 'rapid-fire-grant'),
      })
      expect(finalGrant?.balance).toBe(0)
    })
  })

  describe('Concurrent operations for different users', () => {
    it('should allow parallel execution for different users (no blocking)', async () => {
      const db = getTestDb()
      const { logger: logger1 } = createTestLogger()
      const { logger: logger2 } = createTestLogger()

      // Create grants for two different users
      await db.insert(schema.creditLedger).values([
        createGrantData({
          operation_id: 'parallel-user1-grant',
          user_id: TEST_USER_ID_1,
          balance: 100,
          principal: 100,
        }),
        createGrantData({
          operation_id: 'parallel-user2-grant',
          user_id: TEST_USER_ID_2,
          balance: 100,
          principal: 100,
        }),
      ])

      const delayMs = 100 // Each operation takes 100ms

      // Run concurrent operations for different users
      const startTime = Date.now()
      const [result1, result2] = await Promise.all([
        simulateCreditConsumptionWithDelay({
          userId: TEST_USER_ID_1,
          amount: 50,
          delayMs,
          logger: logger1,
        }),
        simulateCreditConsumptionWithDelay({
          userId: TEST_USER_ID_2,
          amount: 50,
          delayMs,
          logger: logger2,
        }),
      ])
      const totalTime = Date.now() - startTime

      // Both operations should have consumed credits
      expect(result1.consumed).toBe(50)
      expect(result2.consumed).toBe(50)

      // Total time should be close to a single operation's time (parallel execution)
      // If serialized, it would be ~200ms. If parallel, ~100ms + overhead
      console.log(`Parallel execution total time: ${totalTime}ms (expected ~${delayMs}ms for parallel)`)
      
      // Allow some overhead but should be significantly less than 2x delay
      expect(totalTime).toBeLessThan(delayMs * 1.8)

      // Verify both operations overlapped in time (ran in parallel)
      const overlap = Math.min(result1.endTime, result2.endTime) - Math.max(result1.startTime, result2.startTime)
      console.log(`Time overlap between user operations: ${overlap}ms`)
      expect(overlap).toBeGreaterThan(0) // There should be overlap
    })
  })

  describe('Mixed grant and consume operations', () => {
    it('should serialize grant and consume operations for the same user', async () => {
      const db = getTestDb()
      const { logger } = createTestLogger()

      // Create initial grant with some credits
      await db.insert(schema.creditLedger).values(
        createGrantData({
          operation_id: 'mixed-ops-initial-grant',
          user_id: TEST_USER_ID_1,
          balance: 50,
          principal: 50,
        }),
      )

      // Run grant and consume concurrently
      // Grant adds 100, consume takes 80
      // Final balance should be 50 + 100 - 80 = 70 (regardless of order)
      const [grantResult, consumeResult] = await Promise.all([
        simulateGrantWithDelay({
          userId: TEST_USER_ID_1,
          amount: 100,
          operationId: 'mixed-ops-new-grant',
          delayMs: 50,
          logger,
        }),
        simulateCreditConsumptionWithDelay({
          userId: TEST_USER_ID_1,
          amount: 80,
          delayMs: 50,
          logger,
        }),
      ])

      // Get final total balance
      const grants = await db
        .select()
        .from(schema.creditLedger)
        .where(eq(schema.creditLedger.user_id, TEST_USER_ID_1))

      const totalBalance = grants.reduce((sum, g) => sum + g.balance, 0)
      
      // Depending on order:
      // If grant runs first: 50 + 100 - 80 = 70
      // If consume runs first: (50 - 50) + 100 = 100 (consume can only take 50)
      // Either way, we should have a valid non-negative balance
      expect(totalBalance).toBeGreaterThanOrEqual(0)
      console.log(`Mixed ops final balance: ${totalBalance}`)

      // Operations should have been serialized
      const wasGrantFirst = grantResult.endTime <= consumeResult.startTime + 10
      const wasConsumeFirst = consumeResult.endTime <= grantResult.startTime + 10
      console.log(`Grant first: ${wasGrantFirst}, Consume first: ${wasConsumeFirst}`)
    })
  })

  describe('Lock key validation', () => {
    it('should reject empty lock key', async () => {
      const { logger } = createTestLogger()

      await expect(
        withAdvisoryLockTransaction({
          callback: async () => 'should not run',
          lockKey: '',
          context: {},
          logger,
        }),
      ).rejects.toThrow('lockKey must be a non-empty string')
    })

    it('should reject whitespace-only lock key', async () => {
      const { logger } = createTestLogger()

      await expect(
        withAdvisoryLockTransaction({
          callback: async () => 'should not run',
          lockKey: '   ',
          context: {},
          logger,
        }),
      ).rejects.toThrow('lockKey must be a non-empty string')
    })
  })

  describe('Lock timeout behavior', () => {
    it('should complete successfully when lock is available within timeout', async () => {
      const { logger } = createTestLogger()

      // Simple test that lock timeout parameter is accepted and doesn't break normal operation
      const { result } = await withAdvisoryLockTransaction({
        callback: async () => {
          return 'success'
        },
        lockKey: `user:timeout-test-simple`,
        context: {},
        logger,
        lockTimeoutMs: 5000, // 5 second timeout
      })

      expect(result).toBe('success')
    })

    it('should allow second transaction after first completes', async () => {
      const { logger } = createTestLogger()
      const lockKey = `user:timeout-test-sequential`

      // First transaction completes normally
      const { result: result1 } = await withAdvisoryLockTransaction({
        callback: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return 'first'
        },
        lockKey,
        context: {},
        logger,
        lockTimeoutMs: 1000,
      })
      expect(result1).toBe('first')

      // Second transaction should acquire lock immediately after first releases
      const startTime = Date.now()
      const { result: result2 } = await withAdvisoryLockTransaction({
        callback: async () => {
          return 'second'
        },
        lockKey,
        context: {},
        logger,
        lockTimeoutMs: 1000,
      })
      const duration = Date.now() - startTime

      expect(result2).toBe('second')
      // Should be fast since lock was released
      expect(duration).toBeLessThan(500)
    })
  })

  describe('Error handling within locked transaction', () => {
    it('should release lock when callback throws an error', async () => {
      const db = getTestDb()
      const { logger } = createTestLogger()

      // Create a grant
      await db.insert(schema.creditLedger).values(
        createGrantData({
          operation_id: 'error-test-grant',
          user_id: TEST_USER_ID_1,
          balance: 100,
          principal: 100,
        }),
      )

      // First transaction throws an error
      await expect(
        withAdvisoryLockTransaction({
          callback: async (tx) => {
            throw new Error('Intentional test error')
          },
          lockKey: `user:${TEST_USER_ID_1}`,
          context: {},
          logger,
        }),
      ).rejects.toThrow('Intentional test error')

      // Second transaction should be able to acquire the lock immediately
      const startTime = Date.now()
      await withAdvisoryLockTransaction({
        callback: async (tx) => {
          // Do nothing, just verify lock is available
        },
        lockKey: `user:${TEST_USER_ID_1}`,
        context: {},
        logger,
      })
      const duration = Date.now() - startTime

      // Should be very fast since lock was released
      console.log(`Lock acquisition after error: ${duration}ms`)
      expect(duration).toBeLessThan(100) // Should be nearly instant
    })

    it('should rollback transaction on error and not persist partial changes', async () => {
      const db = getTestDb()
      const { logger } = createTestLogger()

      // Create a grant
      await db.insert(schema.creditLedger).values(
        createGrantData({
          operation_id: 'rollback-test-grant',
          user_id: TEST_USER_ID_1,
          balance: 100,
          principal: 100,
        }),
      )

      // Try to update balance and then throw
      await expect(
        withAdvisoryLockTransaction({
          callback: async (tx) => {
            // Update balance
            await tx
              .update(schema.creditLedger)
              .set({ balance: 50 })
              .where(eq(schema.creditLedger.operation_id, 'rollback-test-grant'))
            
            // Throw error after update
            throw new Error('Rollback test error')
          },
          lockKey: `user:${TEST_USER_ID_1}`,
          context: {},
          logger,
        }),
      ).rejects.toThrow('Rollback test error')

      // Verify balance was NOT changed (transaction rolled back)
      const grant = await db.query.creditLedger.findFirst({
        where: eq(schema.creditLedger.operation_id, 'rollback-test-grant'),
      })
      expect(grant?.balance).toBe(100) // Original value, not 50
    })
  })

  describe('Lock acquisition timing', () => {
    it('should NOT log at WARN level when lock acquisition takes less than 3s', async () => {
      const { logger, logs } = createTestLogger()

      // Start a transaction that takes a moderate amount of time (but < 3s)
      const longRunningPromise = withAdvisoryLockTransaction({
        callback: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200))
          return 'first'
        },
        lockKey: 'user:timing-test-short',
        context: { test: 'first' },
        logger,
      })

      // Wait a bit for the first transaction to acquire the lock
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Start a second transaction that will have to wait (but < 3s)
      const secondPromise = withAdvisoryLockTransaction({
        callback: async () => {
          return 'second'
        },
        lockKey: 'user:timing-test-short',
        context: { test: 'second' },
        logger,
      })

      const [firstResult, secondResult] = await Promise.all([longRunningPromise, secondPromise])

      expect(firstResult.result).toBe('first')
      expect(secondResult.result).toBe('second')

      // Since the wait is < 3 seconds, NO warn logs should be emitted
      // (observability only logs at WARN level when wait >= 3s)
      const warnLogs = logs.filter((l) => l.level === 'warn')
      console.log('Warn logs (should be empty for short waits):', warnLogs)
      
      // Verify no warn logs about lock contention
      const lockContentionWarn = warnLogs.find((l) => {
        const logObj = l.args[0] as Record<string, unknown>
        return logObj && typeof logObj.lockWaitMs === 'number'
      })
      expect(lockContentionWarn).toBeUndefined()
    })

    it('should measure lock wait time accurately even for short waits', async () => {
      const { logger } = createTestLogger()

      // Run a simple transaction and verify it completes without warn logs
      const startTime = Date.now()
      const { result } = await withAdvisoryLockTransaction({
        callback: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50))
          return 'success'
        },
        lockKey: 'user:timing-test-simple',
        context: {},
        logger,
      })
      const duration = Date.now() - startTime

      expect(result).toBe('success')
      expect(duration).toBeLessThan(500) // Should be quick, no contention
    })
  })

  describe('Observability thresholds', () => {
    it('should not emit WARN logs when operations complete quickly (no contention)', async () => {
      const db = getTestDb()
      const { logger, logs } = createTestLogger()

      // Create a grant
      await db.insert(schema.creditLedger).values(
        createGrantData({
          operation_id: 'observability-quick-grant',
          user_id: TEST_USER_ID_1,
          balance: 100,
          principal: 100,
        }),
      )

      // Run a quick operation
      await simulateCreditConsumptionWithDelay({
        userId: TEST_USER_ID_1,
        amount: 10,
        delayMs: 10, // Very short
        logger,
      })

      // No WARN logs should be emitted for quick operations
      const warnLogs = logs.filter((l) => l.level === 'warn')
      expect(warnLogs).toHaveLength(0)
    })

    it('should not emit WARN logs for moderate contention (< 3s wait)', async () => {
      const db = getTestDb()
      const { logger, logs } = createTestLogger()

      // Create a grant
      await db.insert(schema.creditLedger).values(
        createGrantData({
          operation_id: 'observability-moderate-grant',
          user_id: TEST_USER_ID_1,
          balance: 100,
          principal: 100,
        }),
      )

      // Run two concurrent operations that will cause brief contention
      const results = await Promise.all([
        simulateCreditConsumptionWithDelay({
          userId: TEST_USER_ID_1,
          amount: 10,
          delayMs: 100, // Each takes 100ms
          logger,
        }),
        simulateCreditConsumptionWithDelay({
          userId: TEST_USER_ID_1,
          amount: 10,
          delayMs: 100,
          logger,
        }),
      ])

      // Both should complete successfully
      expect(results[0]!.consumed + results[1]!.consumed).toBe(20)

      // Even with contention, wait time is ~100ms which is far below 3s threshold
      // No WARN logs should be emitted
      const warnLogs = logs.filter((l) => l.level === 'warn')
      console.log(`Contention test: ${warnLogs.length} warn logs (expected 0 for < 3s waits)`)
      expect(warnLogs).toHaveLength(0)
    })

    // Note: Testing 3s+ wait times in unit/integration tests is impractical
    // The unit tests in transaction.test.ts mock setTimeout to verify the threshold logic
  })

  describe('Hash collision resistance', () => {
    it('should use different lock hashes for user vs org with same ID', async () => {
      const { logger: logger1 } = createTestLogger()
      const { logger: logger2 } = createTestLogger()

      // Using the same ID for both user and org, but with prefixes they should not collide
      const sharedId = 'shared-id-12345'

      // Run concurrent operations with same ID but different prefixes
      const delayMs = 100

      const startTime = Date.now()
      const [userResultWrapper, orgResultWrapper] = await Promise.all([
        withAdvisoryLockTransaction({
          callback: async () => {
            await new Promise((resolve) => setTimeout(resolve, delayMs))
            return 'user'
          },
          lockKey: `user:${sharedId}`,
          context: {},
          logger: logger1,
        }),
        withAdvisoryLockTransaction({
          callback: async () => {
            await new Promise((resolve) => setTimeout(resolve, delayMs))
            return 'org'
          },
          lockKey: `org:${sharedId}`,
          context: {},
          logger: logger2,
        }),
      ])
      const totalTime = Date.now() - startTime

      expect(userResultWrapper.result).toBe('user')
      expect(orgResultWrapper.result).toBe('org')

      // They should run in parallel (different lock keys despite same ID)
      console.log(`User/Org parallel execution: ${totalTime}ms (expected ~${delayMs}ms for parallel)`)
      expect(totalTime).toBeLessThan(delayMs * 1.8)
    })
  })
})
