import React, { useEffect, useState } from 'react'

import { ShimmerText } from './shimmer-text'
import { getCodebuffClient } from '../utils/codebuff-client'

import type { ElapsedTimeTracker } from '../hooks/use-elapsed-time'
import type { ChatTheme } from '../types/theme-system'

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
  theme,
  clipboardMessage,
  isActive = false,
  timer,
}: {
  theme: ChatTheme
  clipboardMessage?: string | null
  isActive?: boolean
  timer: ElapsedTimeTracker
}) => {
  const isConnected = useConnectionStatus()
  const elapsedSeconds = timer.elapsedSeconds

  if (clipboardMessage) {
    return <span fg={theme.statusAccent}>{clipboardMessage}</span>
  }

  const hasStatus = isConnected === false || isActive

  if (!hasStatus) {
    return null
  }

  if (isConnected === false) {
    return <ShimmerText text="connecting..." />
  }

  if (isActive) {
    // If we have elapsed time > 0, show it
    if (elapsedSeconds > 0) {
      return <span fg={theme.statusSecondary}>{elapsedSeconds}s</span>
    }

    // Otherwise show thinking...
    return (
      <ShimmerText
        text="thinking..."
        interval={160}
        primaryColor={theme.statusSecondary}
      />
    )
  }

  return null
}

export const useHasStatus = (
  isActive: boolean,
  clipboardMessage?: string | null,
  timer?: ElapsedTimeTracker,
): boolean => {
  const isConnected = useConnectionStatus()
  return (
    isConnected === false ||
    isActive ||
    Boolean(clipboardMessage) ||
    Boolean(timer?.startTime)
  )
}
