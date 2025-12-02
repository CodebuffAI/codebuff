import { useEffect, useState } from 'react'

import { useTheme } from '../hooks/use-theme'
import { formatElapsedTime } from '../utils/format-elapsed-time'

interface ElapsedTimerProps {
  startTime: number | null
  suffix?: string
  attributes?: number
}

/**
 * Self-contained timer component that updates every second.
 * Only this component re-renders, not its parents.
 */
export const ElapsedTimer = ({
  startTime,
  suffix = '',
  attributes,
}: ElapsedTimerProps) => {
  const theme = useTheme()
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() =>
    startTime ? Math.floor((Date.now() - startTime) / 1000) : 0,
  )

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

  if (!startTime || elapsedSeconds === 0) {
    return null
  }

  return (
    <span fg={theme.secondary} attributes={attributes}>
      {formatElapsedTime(elapsedSeconds)}{suffix}
    </span>
  )
}
