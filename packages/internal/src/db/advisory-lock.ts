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

const HEALTH_CHECK_INTERVAL_MS = 10_000 // 10 seconds

export interface LockHandle {
  /** Register a callback to be called if the lock is lost (connection dies) */
  onLost(callback: () => void): void
  /** Release the lock and clean up resources */
  release(): Promise<void>
}

/**
 * Tries to acquire a PostgreSQL session-level advisory lock.
 *
 * @param lockId - The unique lock identifier
 * @returns An object with `acquired` boolean and a `handle` if acquired.
 *          Use handle.onLost() to detect connection failures.
 *          Use handle.release() to release the lock.
 */
export async function tryAcquireAdvisoryLock(lockId: AdvisoryLockId): Promise<{
  acquired: boolean
  handle: LockHandle | null
}> {
  const connection = postgres(env.DATABASE_URL, {
    max: 1,
    idle_timeout: 0,
    connect_timeout: 10,
  })

  try {
    const result = await connection`SELECT pg_try_advisory_lock(${lockId}) as acquired`
    const acquired = result[0]?.acquired === true

    if (!acquired) {
      await connection.end()
      return { acquired: false, handle: null }
    }

    // Create the lock handle
    let lostCallback: (() => void) | null = null
    let isReleased = false
    let healthCheckTimer: ReturnType<typeof setInterval> | null = null

    const triggerLost = () => {
      if (isReleased) return
      if (healthCheckTimer) {
        clearInterval(healthCheckTimer)
        healthCheckTimer = null
      }
      // Close the connection before marking as released
      connection.end().catch(() => {})
      isReleased = true
      if (lostCallback) {
        lostCallback()
      }
    }

    // Start health check interval - verify we still hold the lock, not just connection liveness
    healthCheckTimer = setInterval(async () => {
      if (isReleased) return
      try {
        // Query pg_locks to verify we still hold this specific advisory lock
        // This catches cases where the lock was lost but connection stayed alive
        const result = await connection`
          SELECT EXISTS (
            SELECT 1 FROM pg_locks 
            WHERE locktype = 'advisory' 
            AND classid = 0
            AND objid = ${lockId}
            AND pid = pg_backend_pid()
            AND granted = true
          ) as held
        `
        const stillHeld = result[0]?.held === true
        if (!stillHeld) {
          console.error('Advisory lock health check failed - lock no longer held')
          triggerLost()
        }
      } catch {
        console.error('Advisory lock health check failed - connection lost')
        triggerLost()
      }
    }, HEALTH_CHECK_INTERVAL_MS)

    const handle: LockHandle = {
      onLost(callback: () => void) {
        lostCallback = callback
      },
      async release() {
        if (isReleased) return
        isReleased = true
        if (healthCheckTimer) {
          clearInterval(healthCheckTimer)
          healthCheckTimer = null
        }
        try {
          await connection.end()
        } catch (error) {
          console.error('Error releasing advisory lock:', error)
        }
      },
    }

    return { acquired: true, handle }
  } catch (error) {
    await connection.end().catch(() => {})
    throw error
  }
}
