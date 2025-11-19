import { useEffect, useState } from 'react'

import { getCodebuffClient } from '../utils/codebuff-client'
import { logger } from '../utils/logger'

// Adaptive health check interval configuration
// Progressively increases polling interval based on consecutive successful checks
export const HEALTH_CHECK_CONFIG = {
  // Initial interval after startup or failure (ms)
  INITIAL_INTERVAL: 10_000, // 10 seconds
  // Interval thresholds based on consecutive successful checks
  INTERVALS: [
    { successCount: 3, interval: 30_000 }, // 30 seconds after 3 successes
    { successCount: 6, interval: 60_000 }, // 1 minute after 6 successes
    { successCount: 10, interval: 120_000 }, // 2 minutes after 10 successes
    { successCount: 15, interval: 300_000 }, // 5 minutes after 15 successes
    { successCount: 20, interval: 600_000 }, // 10 minutes after 20 successes
  ],
} as const

/**
 * Calculates the next health check interval based on consecutive successful checks
 * Exported for testing purposes
 */
export function getNextInterval(consecutiveSuccesses: number): number {
  // Find the highest threshold that we've passed
  for (let i = HEALTH_CHECK_CONFIG.INTERVALS.length - 1; i >= 0; i--) {
    const { successCount, interval } = HEALTH_CHECK_CONFIG.INTERVALS[i]
    if (consecutiveSuccesses >= successCount) {
      return interval
    }
  }
  return HEALTH_CHECK_CONFIG.INITIAL_INTERVAL
}

/**
 * Hook to monitor connection status to the Codebuff backend.
 * Uses adaptive exponential backoff to reduce polling frequency when connection is stable.
 */
export const useConnectionStatus = () => {

  const [isConnected, setIsConnected] = useState(true)

  useEffect(() => {
    let isMounted = true
    let timeoutId: NodeJS.Timeout | null = null
    let consecutiveSuccesses = 0
    let currentInterval: number = HEALTH_CHECK_CONFIG.INITIAL_INTERVAL

    const scheduleNextCheck = (interval: number) => {
      if (!isMounted) return
      timeoutId = setTimeout(() => checkConnection(), interval)
    }

    const checkConnection = async () => {
      const client = await getCodebuffClient()
      if (!client) {
        if (isMounted) {
          setIsConnected(false)
          consecutiveSuccesses = 0
          currentInterval = HEALTH_CHECK_CONFIG.INITIAL_INTERVAL
          logger.debug(
            { interval: currentInterval },
            'Health check: No client, reset to initial interval',
          )
          scheduleNextCheck(currentInterval)
        }
        return
      }

      try {
        const connected = await client.checkConnection()
        if (!isMounted) return

        setIsConnected(connected)

        if (connected) {
          consecutiveSuccesses++
          const newInterval = getNextInterval(consecutiveSuccesses)

          // Log when interval changes
          if (newInterval !== currentInterval) {
            logger.debug(
              {
                consecutiveSuccesses,
                oldInterval: currentInterval,
                newInterval,
              },
              'Health check interval increased',
            )
            currentInterval = newInterval
          }

          scheduleNextCheck(currentInterval)
        } else {
          // Reset to fast polling on connection failure
          consecutiveSuccesses = 0
          currentInterval = HEALTH_CHECK_CONFIG.INITIAL_INTERVAL
          logger.debug(
            { interval: currentInterval },
            'Health check failed, reset to initial interval',
          )
          scheduleNextCheck(currentInterval)
        }
      } catch (error) {
        logger.debug({ error }, 'Connection check failed')
        if (isMounted) {
          setIsConnected(false)
          consecutiveSuccesses = 0
          currentInterval = HEALTH_CHECK_CONFIG.INITIAL_INTERVAL
          scheduleNextCheck(currentInterval)
        }
      }
    }

    // Start first check immediately
    checkConnection()

    return () => {
      isMounted = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [])

  return isConnected
}
