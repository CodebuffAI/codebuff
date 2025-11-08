import { useCallback, useEffect, useMemo, useState } from 'react'

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
 * const timer = useElapsedTime()
 * timer.start() // Start timing
 * timer.stop()  // Stop and reset
 *
 * // Pass the timer object to components that need to display elapsed time
 * <StatusIndicator timer={timer} />
 * <MessageBlock timer={timer} />
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

  const timer = useMemo(
    () => ({ start, stop, elapsedSeconds, startTime }),
    [start, stop, elapsedSeconds, startTime],
  )

  return timer
}
