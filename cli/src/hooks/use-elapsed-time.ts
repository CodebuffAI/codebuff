import { useCallback, useEffect, useRef, useState } from 'react'

export interface ElapsedTimeTracker {
  /**
   * Start tracking elapsed time from now
   */
  start: () => void
  /**
   * Stop tracking and reset to 0
   */
  stop: () => void
  /**
   * Get the current elapsed seconds
   */
  elapsedSeconds: number
  /**
   * Get the start time timestamp (null if not started)
   */
  startTime: number | null
}

/**
 * Hook to track elapsed time with manual start/stop control
 * Updates every second while active
 *
 * @returns ElapsedTimeTracker - Object with start/stop methods and current elapsed time
 *
 * @example
 * // Imperative API - for components that control timing
 * const timer = useElapsedTime()
 * timer.start() // Start timing
 * timer.stop()  // Stop and reset
 *
 * // Can also pass timer to useSendMessage
 * useSendMessage({ mainAgentTimer: timer, ... })
 *
 * @example
 * // Declarative API - for components that just display
 * const timer = useElapsedTime()
 * useEffect(() => {
 *   if (streamStartTime) timer.start()
 *   else timer.stop()
 * }, [streamStartTime])
 */
export const useElapsedTime = (): ElapsedTimeTracker => {
  const [startTime, setStartTime] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0)

  const start = useCallback(() => {
    setStartTime(Date.now())
  }, [])

  const stop = useCallback(() => {
    setStartTime(null)
    setElapsedSeconds(0)
  }, [])

  useEffect(() => {
    if (!startTime) {
      setElapsedSeconds(0)
      return
    }

    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      setElapsedSeconds(elapsed)
    }

    // Update immediately
    updateElapsed()

    // Then update every second
    const interval = setInterval(updateElapsed, 1000)

    return () => clearInterval(interval)
  }, [startTime])

  return { start, stop, elapsedSeconds, startTime }
}

/**
 * Declarative hook that tracks elapsed time when a start time is provided
 * Useful for components that don't control the timing themselves
 *
 * @param externalStartTime - Timestamp when timing should start, or null to stop
 * @returns elapsedSeconds - Number of seconds elapsed since startTime
 */
export const useElapsedTimeFrom = (externalStartTime: number | null | undefined): number => {
  const timer = useElapsedTime()

  useEffect(() => {
    if (externalStartTime) {
      timer.start()
    } else {
      timer.stop()
    }
  }, [externalStartTime, timer])

  return timer.elapsedSeconds
}
