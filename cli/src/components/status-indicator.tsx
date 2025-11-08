import React, { useEffect, useState } from 'react'

import { ElapsedTimer } from './elapsed-timer'
import { ShimmerText } from './shimmer-text'
import { useTheme } from '../hooks/use-theme'
import { getCodebuffClient } from '../utils/codebuff-client'

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
  timerStartTime,
  nextCtrlCWillExit,
}: {
  clipboardMessage?: string | null
  isActive?: boolean
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

  const hasStatus = isConnected === false || isActive

  if (!hasStatus) {
    return null
  }

  if (isConnected === false) {
    return <ShimmerText text="connecting..." />
  }

  if (isActive) {
    if (!timerStartTime || Date.now() - timerStartTime < 1000) {
      return (
        <ShimmerText
          text="thinking..."
          interval={160}
          primaryColor={theme.secondary}
        />
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
