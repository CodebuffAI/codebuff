import React, { useEffect, useState } from 'react'

import { ShimmerText } from './shimmer-text'
import { getCodebuffClient } from '../utils/codebuff-client'

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
}: {
  isProcessing: boolean
  theme: ChatTheme
  clipboardMessage?: string | null
}) => {
  const isConnected = useConnectionStatus()

  if (clipboardMessage) {
    return <span fg={theme.statusAccent}>{clipboardMessage}</span>
  }

  const hasStatus = isConnected === false || isProcessing

  if (!hasStatus) {
    return null
  }

  if (isConnected === false) {
    return <ShimmerText text="connecting..." />
  }

  if (isProcessing) {
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
): boolean => {
  const isConnected = useConnectionStatus()
  return isConnected === false || isProcessing || !!clipboardMessage
}
