import React, { useEffect, useState } from 'react'

import { ScrollToBottomButton } from './scroll-to-bottom-button'
import { ShimmerText } from './shimmer-text'
import { useTheme } from '../hooks/use-theme'
import { formatElapsedTime } from '../utils/format-elapsed-time'

import type { StreamStatus } from '../hooks/use-message-queue'
import type { AuthStatus, StatusIndicatorState } from '../utils/status-indicator-state'


const SHIMMER_INTERVAL_MS = 160

interface StatusBarProps {
  statusMessage: string | null
  streamStatus: StreamStatus
  timerStartTime: number | null
  nextCtrlCWillExit: boolean
  isConnected: boolean
  authStatus: AuthStatus
  isAtBottom: boolean
  scrollToLatest: () => void
  statusIndicatorState?: StatusIndicatorState
}

export const StatusBar = ({
  statusMessage,
  streamStatus,
  timerStartTime,
  nextCtrlCWillExit,
  isConnected,
  authStatus,
  isAtBottom,
  scrollToLatest,
  statusIndicatorState,
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

  const renderStatusIndicator = () => {
    // Use the unified status indicator state if provided
    if (statusIndicatorState) {
      switch (statusIndicatorState.kind) {
        case 'ctrlC':
          return <span fg={theme.secondary}>Press Ctrl-C again to exit</span>
        
        case 'clipboard':
          // Use green color for feedback success messages
          const isFeedbackSuccess = statusIndicatorState.message.includes('Feedback sent')
          return (
            <span fg={isFeedbackSuccess ? theme.success : theme.primary}>
              {statusIndicatorState.message}
            </span>
          )
        
        case 'reconnected':
          return <span fg={theme.success}>Reconnected</span>
        
        case 'retrying':
          return (
            <ShimmerText
              text="retrying..."
              primaryColor={theme.warning}
            />
          )
        
        case 'connecting':
          return <ShimmerText text="connecting..." />
        
        case 'waiting':
          return (
            <ShimmerText
              text="thinking..."
              interval={SHIMMER_INTERVAL_MS}
              primaryColor={theme.secondary}
            />
          )
        
        case 'streaming':
          return (
            <ShimmerText
              text="working..."
              interval={SHIMMER_INTERVAL_MS}
              primaryColor={theme.secondary}
            />
          )
        
        case 'idle':
          return null
      }
    }

    // Fallback to old logic if statusIndicatorState not provided
    if (nextCtrlCWillExit) {
      return <span fg={theme.secondary}>Press Ctrl-C again to exit</span>
    }

    if (statusMessage) {
      const isFeedbackSuccess = statusMessage.includes('Feedback sent')
      return (
        <span fg={isFeedbackSuccess ? theme.success : theme.primary}>
          {statusMessage}
        </span>
      )
    }

    if (authStatus === 'retrying') {
      return (
        <ShimmerText
          text="retrying..."
          primaryColor={theme.warning}
        />
      )
    }

    if (!isConnected || authStatus === 'unreachable') {
      return <ShimmerText text="connecting..." />
    }

    if (streamStatus === 'waiting') {
      return (
        <ShimmerText
          text="thinking..."
          interval={SHIMMER_INTERVAL_MS}
          primaryColor={theme.secondary}
        />
      )
    }

    if (streamStatus === 'streaming') {
      return (
        <ShimmerText
          text="working..."
          interval={SHIMMER_INTERVAL_MS}
          primaryColor={theme.secondary}
        />
      )
    }

    return null
  }

  const renderElapsedTime = () => {
    if (!shouldShowTimer || elapsedSeconds === 0) {
      return null
    }

    return <span fg={theme.secondary}>{formatElapsedTime(elapsedSeconds)}</span>
  }

  const statusIndicatorContent = renderStatusIndicator()
  const elapsedTimeContent = renderElapsedTime()

  // Only show gray background when there's status indicator or timer
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
        <text style={{ wrapMode: 'none' }}>{statusIndicatorContent}</text>
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
        <text style={{ wrapMode: 'none' }}>{elapsedTimeContent}</text>
      </box>
    </box>
  )
}
