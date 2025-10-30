import React, { useEffect, useState } from 'react'

import { ShimmerText } from './shimmer-text'
import { useElapsedTime } from '../hooks/use-elapsed-time'
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
  isProcessing,
  theme,
  clipboardMessage,
  showThinking = false,
  streamStartTime,
}: {
  isProcessing: boolean
  theme: ChatTheme
  clipboardMessage?: string | null
  showThinking?: boolean
  streamStartTime?: number | null
}) => {
  const isConnected = useConnectionStatus()
  const elapsedSeconds = useElapsedTime(streamStartTime)

  if (clipboardMessage) {
    return <span fg={theme.statusAccent}>{clipboardMessage}</span>
  }

  const hasStatus = isConnected === false || isProcessing || showThinking

  if (!hasStatus) {
    return null
  }

  if (isConnected === false) {
    return <ShimmerText text="connecting..." />
  }

  if (isProcessing || showThinking) {
    // If we have a stream start time and elapsed > 0, show elapsed time
    if (streamStartTime && elapsedSeconds > 0) {
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
  isProcessing: boolean,
  clipboardMessage?: string | null,
  showThinking?: boolean,
  streamStartTime?: number | null,
): boolean => {
  const isConnected = useConnectionStatus()
  return (
    isConnected === false ||
    isProcessing ||
    !!clipboardMessage ||
    !!showThinking ||
    !!streamStartTime
  )
}
