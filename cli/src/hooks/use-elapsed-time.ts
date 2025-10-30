import { useEffect, useState } from 'react'

/**
 * Hook to track elapsed time from a start timestamp
 * Updates every second while the start time is set
 *
 * @param startTime - Timestamp in milliseconds (Date.now()) when timing started, or null/undefined to reset
 * @returns elapsedSeconds - Number of seconds elapsed since startTime, or 0 if no startTime
 */
export const useElapsedTime = (startTime: number | null | undefined): number => {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0)

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

  return elapsedSeconds
}
