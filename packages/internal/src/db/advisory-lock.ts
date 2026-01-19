import postgres from 'postgres'

import { env } from '@codebuff/internal/env'

/**
 * Lock IDs for different singleton processes.
 * These are arbitrary integers that must be unique per process type.
 */
export const ADVISORY_LOCK_IDS = {
  DISCORD_BOT: 741852963,
} as const

export type AdvisoryLockId = (typeof ADVISORY_LOCK_IDS)[keyof typeof ADVISORY_LOCK_IDS]

/**
 * Tries to acquire a PostgreSQL session-level advisory lock.
 *
 * Advisory locks are held until explicitly released or the connection closes.
 * This is useful for leader election - only one instance can hold the lock.
 *
 * @param lockId - The unique lock identifier
 * @returns An object with `acquired` boolean and the `connection` if acquired.
 *          The connection must be kept alive to maintain the lock.
 *          Close the connection to release the lock.
 */
export async function tryAcquireAdvisoryLock(lockId: AdvisoryLockId): Promise<{
  acquired: boolean
  connection: postgres.Sql | null
}> {
  // Create a dedicated connection for this lock
  // This connection must stay open to maintain the lock
  const connection = postgres(env.DATABASE_URL, {
    max: 1, // Single connection for the lock
    idle_timeout: 0, // Never timeout - keep connection alive
    connect_timeout: 10, // 10 second connection timeout
  })

  try {
    const result = await connection`SELECT pg_try_advisory_lock(${lockId}) as acquired`
    const acquired = result[0]?.acquired === true

    if (acquired) {
      return { acquired: true, connection }
    } else {
      // Lock not acquired, close the connection
      await connection.end()
      return { acquired: false, connection: null }
    }
  } catch (error) {
    // On error, ensure connection is closed
    await connection.end().catch(() => {})
    throw error
  }
}

/**
 * Releases an advisory lock by closing the connection.
 * The lock is automatically released when the connection closes.
 */
export async function releaseAdvisoryLock(
  connection: postgres.Sql | null,
): Promise<void> {
  if (connection) {
    await connection.end()
  }
}
