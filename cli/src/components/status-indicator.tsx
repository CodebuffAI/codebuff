import React, { useEffect, useState } from 'react'

import { ElapsedTimer } from './elapsed-timer'
import { ShimmerText } from './shimmer-text'
import { useTheme } from '../hooks/use-theme'
import { getCodebuffClient } from '../utils/codebuff-client'
import { formatElapsedTime } from '../utils/format-elapsed-time'

const useConnectionStatus = () => {
  const [isConnected, setIsConnected] = useState(true)

  useEffect(() => {
    const checkConnection = async () => {
      const client = getCodebuffClient()
      if (!client) {
        setIsConnected(false)
        return
      }

      try {
        const connected = await client.checkConnection()
        setIsConnected(connected)
      } catch (error) {
        setIsConnected(false)
      }
    }

    checkConnection()

    const interval = setInterval(checkConnection, 30000)

    return () => clearInterval(interval)
  }, [])

  return isConnected
}

export const StatusIndicator = ({
  clipboardMessage,
  isActive = false,
  isWaitingForResponse = false,
  timerStartTime,
  nextCtrlCWillExit,
}: {
  clipboardMessage?: string | null
  isActive?: boolean
  isWaitingForResponse?: boolean
  timerStartTime: number | null
  nextCtrlCWillExit: boolean
}) => {
  const theme = useTheme()
  const isConnected = useConnectionStatus()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!timerStartTime || !isWaitingForResponse) {
      setElapsedSeconds(0)
      return
    }

    const updateElapsed = () => {
      const now = Date.now()
      const elapsed = Math.floor((now - timerStartTime) / 1000)
      setElapsedSeconds(elapsed)
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)

    return () => clearInterval(interval)
  }, [timerStartTime, isWaitingForResponse])

  if (nextCtrlCWillExit) {
    return <span fg={theme.secondary}>Press Ctrl-C again to exit</span>
  }

  if (clipboardMessage) {
    return <span fg={theme.primary}>{clipboardMessage}</span>
  }

  const hasStatus = isConnected === false || isActive

  if (!hasStatus) {
    return null
  }

  if (isConnected === false) {
    return <ShimmerText text="connecting..." />
  }

  if (isActive) {
    if (isWaitingForResponse) {
      return (
        <>
          <ShimmerText
            text="thinking..."
            interval={160}
            primaryColor={theme.secondary}
          />
          {elapsedSeconds > 0 && (
            <>
              <span fg={theme.muted}> </span>
              <span fg={theme.secondary}>{formatElapsedTime(elapsedSeconds)}</span>
            </>
          )}
        </>
      )
    }
    return <ElapsedTimer startTime={timerStartTime} />
  }

  return null
}

export const useHasStatus = (params: {
  isActive: boolean
  clipboardMessage?: string | null
  timerStartTime?: number | null
  nextCtrlCWillExit: boolean
}): boolean => {
  const { isActive, clipboardMessage, timerStartTime, nextCtrlCWillExit } =
    params

  const isConnected = useConnectionStatus()
  return (
    isConnected === false ||
    isActive ||
    Boolean(clipboardMessage) ||
    Boolean(timerStartTime) ||
    nextCtrlCWillExit
  )
}
