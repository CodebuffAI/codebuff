import React, { useEffect, useState } from 'react'

import { ShimmerText } from './shimmer-text'
import { ScrollToBottomButton } from './scroll-to-bottom-button'
import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { formatElapsedTime } from '../utils/format-elapsed-time'

import type { StreamStatus } from '../hooks/use-message-queue'

const SHIMMER_INTERVAL_MS = 160

interface StatusBarProps {
  clipboardMessage: string | null
  streamStatus: StreamStatus
  timerStartTime: number | null
  nextCtrlCWillExit: boolean
  isConnected: boolean
  isAtBottom: boolean
  scrollToLatest: () => void
  pendingRetryCount: number
  retryPendingMessages: () => Promise<void>
}

export const StatusBar = ({
  clipboardMessage,
  streamStatus,
  timerStartTime,
  nextCtrlCWillExit,
  isConnected,
  isAtBottom,
  scrollToLatest,
  pendingRetryCount,
  retryPendingMessages,
}: StatusBarProps) => {
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

  const renderShimmer = (
    shimmerProps: React.ComponentProps<typeof ShimmerText>,
  ) => (
    <text style={{ wrapMode: 'none' }}>
      <ShimmerText {...shimmerProps} />
    </text>
  )

  const renderStatusIndicator = () => {
    if (nextCtrlCWillExit) {
      return (
        <text fg={theme.secondary} style={{ wrapMode: 'none' }}>
          Press Ctrl-C again to exit
        </text>
      )
    }

    if (clipboardMessage) {
      return (
        <text fg={theme.primary} style={{ wrapMode: 'none' }}>
          {clipboardMessage}
        </text>
      )
    }

    if (!isConnected) {
      return renderShimmer({ text: 'connecting...' })
    }

    if (streamStatus === 'waiting') {
      return renderShimmer({
        text: 'thinking...',
        interval: SHIMMER_INTERVAL_MS,
        primaryColor: theme.secondary,
      })
    }

    if (streamStatus === 'streaming') {
      return renderShimmer({
        text: 'working...',
        interval: SHIMMER_INTERVAL_MS,
        primaryColor: theme.secondary,
      })
    }

    return null
  }

  const renderElapsedTime = () => {
    if (!shouldShowTimer || elapsedSeconds === 0) {
      return null
    }

    return (
      <text fg={theme.secondary} style={{ wrapMode: 'none' }}>
        {formatElapsedTime(elapsedSeconds)}
      </text>
    )
  }

  const statusIndicatorContent = renderStatusIndicator()
  const elapsedTimeContent = renderElapsedTime()
  const hasPendingRetries = pendingRetryCount > 0
  const pendingRetryMessage =
    pendingRetryCount === 1
      ? 'Message send interrupted'
      : `${pendingRetryCount} messages interrupted`
  const handleRetryClick = () => {
    void retryPendingMessages()
  }
  const pendingRetryContent = hasPendingRetries ? (
    <box
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <text fg={theme.primary} style={{ wrapMode: 'none' }}>
        {pendingRetryMessage}
      </text>
      <Button
        style={{
          borderStyle: 'round',
          borderColor: theme.primary,
          paddingLeft: 1,
          paddingRight: 1,
        }}
        onClick={handleRetryClick}
      >
        <text fg={theme.primary} style={{ wrapMode: 'none' }}>
          Retry now
        </text>
      </Button>
    </box>
  ) : null

  // Only show gray background when there's status indicator or timer content
  const hasContent =
    hasPendingRetries || statusIndicatorContent || elapsedTimeContent

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 1,
        paddingRight: 1,
        gap: 1,
        backgroundColor: hasContent ? theme.surface : 'transparent',
      }}
    >
      <box
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
        }}
      >
        {pendingRetryContent ?? statusIndicatorContent}
      </box>

      <box style={{ flexShrink: 0 }}>
        {!isAtBottom && <ScrollToBottomButton onClick={scrollToLatest} />}
      </box>

      <box
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          flexDirection: 'row',
          justifyContent: 'flex-end',
        }}
      >
        {elapsedTimeContent}
      </box>
    </box>
  )
}
