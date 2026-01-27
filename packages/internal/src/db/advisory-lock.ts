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

// Diagnostic logging helper with timestamp and process info
function logLock(level: 'info' | 'error' | 'warn', message: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString()
  const pid = process.pid
  const prefix = `[${timestamp}] [PID:${pid}] [advisory-lock]`
  const dataStr = data ? ` ${JSON.stringify(data)}` : ''
  if (level === 'error') {
    console.error(`${prefix} ${message}${dataStr}`)
  } else if (level === 'warn') {
    console.warn(`${prefix} ${message}${dataStr}`)
  } else {
    console.log(`${prefix} ${message}${dataStr}`)
  }
}

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
  logLock('info', 'Attempting to acquire advisory lock', { lockId })
  
  const connection = postgres(env.DATABASE_URL, {
    max: 1,
    idle_timeout: 0,
    connect_timeout: 10,
  })

  try {
    logLock('info', 'Database connection established, attempting pg_try_advisory_lock')
    const result = await connection`SELECT pg_try_advisory_lock(${lockId}) as acquired`
    const acquired = result[0]?.acquired === true

    logLock('info', 'Lock acquisition result', { acquired, lockId })

    if (!acquired) {
      logLock('info', 'Lock not acquired (held by another process), closing connection')
      await connection.end()
      return { acquired: false, handle: null }
    }

    logLock('info', 'Lock acquired successfully, setting up lock handle', { lockId })

    // Create the lock handle
    let lostCallback: (() => void) | null = null
    let isReleased = false
    let healthCheckTimer: ReturnType<typeof setInterval> | null = null
    let healthCheckCount = 0

    const triggerLost = () => {
      if (isReleased) return
      logLock('warn', 'Lock lost detected, triggering lost callback', { lockId, healthCheckCount })
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
      healthCheckCount++
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
          logLock('error', 'Advisory lock health check failed - lock no longer held', { lockId, healthCheckCount })
          triggerLost()
        } else if (healthCheckCount % 6 === 0) {
          // Log every minute (6 * 10s) to confirm we're still running
          logLock('info', 'Advisory lock health check passed', { lockId, healthCheckCount, uptimeMinutes: healthCheckCount / 6 })
        }
      } catch (error) {
        logLock('error', 'Advisory lock health check failed - connection lost', { lockId, healthCheckCount, error: String(error) })
        triggerLost()
      }
    }, HEALTH_CHECK_INTERVAL_MS)

    const handle: LockHandle = {
      onLost(callback: () => void) {
        lostCallback = callback
      },
      async release() {
        if (isReleased) {
          logLock('info', 'Lock release called but already released', { lockId })
          return
        }
        logLock('info', 'Releasing advisory lock', { lockId, healthCheckCount })
        isReleased = true
        if (healthCheckTimer) {
          clearInterval(healthCheckTimer)
          healthCheckTimer = null
        }
        try {
          // Explicitly release the advisory lock before closing connection
          logLock('info', 'Calling pg_advisory_unlock', { lockId })
          await connection`SELECT pg_advisory_unlock(${lockId})`
          logLock('info', 'Advisory lock released via pg_advisory_unlock', { lockId })
        } catch (error) {
          logLock('error', 'Error during pg_advisory_unlock (continuing to close connection)', { lockId, error: String(error) })
        }
        try {
          await connection.end()
          logLock('info', 'Database connection closed', { lockId })
        } catch (error) {
          logLock('error', 'Error closing database connection', { lockId, error: String(error) })
        }
      },
    }

    return { acquired: true, handle }
  } catch (error) {
    logLock('error', 'Error during lock acquisition', { lockId, error: String(error) })
    await connection.end().catch(() => {})
    throw error
  }
}
