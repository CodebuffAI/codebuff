import React, { useEffect, useState } from 'react'

import { ShimmerText } from './shimmer-text'
import { useElapsedTimeFrom } from '../hooks/use-elapsed-time'
import { getCodebuffClient } from '../utils/codebuff-client'
import { logger } from '../utils/logger'

import type { ChatTheme } from '../utils/theme-system'

const useConnectionStatus = () => {
  const [isConnected, setIsConnected] = useState<boolean | null>(null)

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
  streamStartTime,
}: {
  theme: ChatTheme
  clipboardMessage?: string | null
  isActive?: boolean
  streamStartTime?: number | null
}) => {
  const isConnected = useConnectionStatus()
  // Use declarative hook to isolate re-renders to this component
  const elapsedSeconds = useElapsedTimeFrom(streamStartTime)

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
      return (
        <span fg={theme.statusSecondary}>
          {elapsedSeconds}s
        </span>
      )
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
  streamStartTime?: number | null,
): boolean => {
  const isConnected = useConnectionStatus()
  return (
    isConnected === false ||
    isActive ||
    !!clipboardMessage ||
    !!streamStartTime
  )
}
