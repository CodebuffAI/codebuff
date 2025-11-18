import React, { useEffect, useState } from 'react'

import { ShimmerText } from './shimmer-text'
import { ScrollToBottomButton } from './scroll-to-bottom-button'
import { useTheme } from '../hooks/use-theme'
import { formatElapsedTime } from '../utils/format-elapsed-time'

import type { StreamStatus } from '../hooks/use-message-queue'
import type { StatusIndicatorState } from '../utils/status-indicator-state'

const SHIMMER_INTERVAL_MS = 160

interface StatusBarProps {
  statusMessage: string | null
  streamStatus: StreamStatus
  statusIndicatorState: StatusIndicatorState
  timerStartTime: number | null
  nextCtrlCWillExit: boolean
  isConnected: boolean
  isAtBottom: boolean
  scrollToLatest: () => void
}

export const StatusBar = ({
  statusMessage,
  streamStatus,
  statusIndicatorState,
  timerStartTime,
  nextCtrlCWillExit,
  isConnected,
  isAtBottom,
  scrollToLatest,
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
    switch (statusIndicatorState.kind) {
      case 'ctrlC':
        return (
          <text fg={theme.secondary} style={{ wrapMode: 'none' }}>
            Press Ctrl-C again to exit
          </text>
        )

      case 'reconnected':
        return (
          <text fg={theme.success || theme.primary} style={{ wrapMode: 'none' }}>
            ✓ Reconnected
          </text>
        )

      case 'clipboard':
        // Use green color for feedback success messages
        const isFeedbackSuccess = statusIndicatorState.message.includes('Feedback sent')
        return (
          <text fg={isFeedbackSuccess ? theme.success : theme.primary} style={{ wrapMode: 'none' }}>
            {statusIndicatorState.message}
          </text>
        )

      case 'connecting':
        return renderShimmer({ text: 'connecting...' })

      case 'waiting':
        return renderShimmer({
          text: 'thinking...',
          interval: SHIMMER_INTERVAL_MS,
          primaryColor: theme.secondary,
        })

      case 'streaming':
        return renderShimmer({
          text: 'working...',
          interval: SHIMMER_INTERVAL_MS,
          primaryColor: theme.secondary,
        })

      case 'idle':
      default:
        return null
    }
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

  // Only show gray background when there's status indicator or timer content
  const hasContent = statusIndicatorContent || elapsedTimeContent

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
        {statusIndicatorContent}
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
