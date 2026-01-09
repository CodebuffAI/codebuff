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
   * Pause tracking, freezing the current elapsed time
   */
  pause: () => void
  /**
   * Resume tracking from the frozen elapsed time
   */
  resume: () => void
  /**
   * Get the current elapsed seconds
   */
  elapsedSeconds: number
  /**
   * Get the start time timestamp (null if not started)
   */
  startTime: number | null
  /**
   * Whether the timer is currently paused
   */
  isPaused: boolean
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
  const [isPaused, setIsPaused] = useState(false)
  // Track accumulated time from previous pause/resume cycles
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0)

  const start = useCallback(() => {
    setStartTime(Date.now())
    setAccumulatedSeconds(0)
    setIsPaused(false)
  }, [])

  const stop = useCallback(() => {
    setStartTime(null)
    setElapsedSeconds(0)
    setAccumulatedSeconds(0)
    setIsPaused(false)
  }, [])

  const pause = useCallback(() => {
    if (startTime && !isPaused) {
      // Capture current elapsed time before pausing
      const currentElapsed = Math.floor((Date.now() - startTime) / 1000)
      setAccumulatedSeconds(currentElapsed)
      setElapsedSeconds(currentElapsed)
      setIsPaused(true)
    }
  }, [startTime, isPaused])

  const resume = useCallback(() => {
    if (isPaused) {
      // Set a new start time adjusted for accumulated time
      setStartTime(Date.now() - accumulatedSeconds * 1000)
      setIsPaused(false)
    }
  }, [isPaused, accumulatedSeconds])

  useEffect(() => {
    if (!startTime || isPaused) {
      // When paused, keep showing the frozen elapsed time (don't reset)
      if (!isPaused && !startTime) {
        setElapsedSeconds(0)
      }
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
  }, [startTime, isPaused])

  const timer = useMemo(
    () => ({ start, stop, pause, resume, elapsedSeconds, startTime, isPaused }),
    [start, stop, pause, resume, elapsedSeconds, startTime, isPaused],
  )

  return timer
}
