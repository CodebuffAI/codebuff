import React, { useEffect, useState } from 'react'

import { ShimmerText } from './shimmer-text'
import { ScrollToBottomButton } from './scroll-to-bottom-button'
import { useTheme } from '../hooks/use-theme'
import { formatElapsedTime } from '../utils/format-elapsed-time'

import type { StreamStatus } from '../hooks/use-message-queue'

const SHIMMER_INTERVAL_MS = 160

interface StatusBarProps {
  statusMessage: string | null
  streamStatus: StreamStatus
  timerStartTime: number | null
  nextCtrlCWillExit: boolean
  isConnected: boolean
  isAtBottom: boolean
  scrollToLatest: () => void
}

export const StatusBar = ({
  statusMessage,
  streamStatus,
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

  const renderStatusIndicator = () => {
    if (nextCtrlCWillExit) {
      return <span fg={theme.secondary}>Press Ctrl-C again to exit</span>
    }

    if (statusMessage) {
      // Use green color for feedback success messages
      const isFeedbackSuccess = statusMessage.includes('Feedback sent')
      return <span fg={isFeedbackSuccess ? theme.success : theme.primary}>{statusMessage}</span>
    }

    if (!isConnected) {
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
