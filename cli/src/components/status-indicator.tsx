import React, { useEffect, useState } from 'react'

import { ShimmerText } from './shimmer-text'
import { useTheme } from '../hooks/use-theme'
import { getCodebuffClient } from '../utils/codebuff-client'
import { formatElapsedTime } from '../utils/format-elapsed-time'
import type { StreamStatus } from '../hooks/use-message-queue'

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
  streamStatus,
  timerStartTime,
  nextCtrlCWillExit,
}: {
  clipboardMessage?: string | null
  streamStatus: StreamStatus
  timerStartTime: number | null
  nextCtrlCWillExit: boolean
}) => {
  const theme = useTheme()
  const isConnected = useConnectionStatus()

  if (nextCtrlCWillExit) {
    return <span fg={theme.secondary}>Press Ctrl-C again to exit</span>
  }

  if (clipboardMessage) {
    return <span fg={theme.primary}>{clipboardMessage}</span>
  }

  const hasStatus = isConnected === false || streamStatus !== 'idle'

  if (!hasStatus) {
    return null
  }

  if (isConnected === false) {
    return <ShimmerText text="connecting..." />
  }

  if (streamStatus === 'waiting') {
    return (
      <ShimmerText
        text="thinking..."
        interval={160}
        primaryColor={theme.secondary}
      />
    )
  }

  if (streamStatus === 'streaming') {
    return (
      <ShimmerText
        text="working..."
        interval={160}
        primaryColor={theme.secondary}
      />
    )
  }

  return null
}

export const StatusElapsedTime = ({
  streamStatus,
  timerStartTime,
}: {
  streamStatus: StreamStatus
  timerStartTime: number | null
}) => {
  const theme = useTheme()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const shouldShowTimer = streamStatus !== 'idle'

  useEffect(() => {
    if (!timerStartTime || !shouldShowTimer) {
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
  }, [timerStartTime, shouldShowTimer])

  if (!shouldShowTimer || elapsedSeconds === 0) {
    return null
  }

  return <span fg={theme.secondary}>{formatElapsedTime(elapsedSeconds)}</span>
}

