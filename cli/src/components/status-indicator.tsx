import React, { useEffect, useState } from 'react'

import { ShimmerText } from './shimmer-text'
import { useTheme } from '../hooks/use-theme'
import { formatElapsedTime } from '../utils/format-elapsed-time'
import type { StreamStatus } from '../hooks/use-message-queue'

// Shimmer animation interval for status text (milliseconds)
const SHIMMER_INTERVAL_MS = 160

export type StatusIndicatorState =
  | { kind: 'idle' }
  | { kind: 'clipboard'; message: string }
  | { kind: 'ctrlC' }
  | { kind: 'connecting' }
  | { kind: 'waiting' }
  | { kind: 'streaming' }

export type StatusIndicatorStateArgs = {
  clipboardMessage?: string | null
  streamStatus: StreamStatus
  nextCtrlCWillExit: boolean
  isConnected: boolean
}

/**
 * Determines the status indicator state based on current context.
 * 
 * State priority (highest to lowest):
 * 1. nextCtrlCWillExit - User pressed Ctrl+C once, warn about exit
 * 2. clipboardMessage - Temporary feedback for clipboard operations
 * 3. connecting - Not connected to backend
 * 4. waiting - Waiting for AI response to start
 * 5. streaming - AI is actively responding
 * 6. idle - No activity
 * 
 * @param args - Context for determining indicator state
 * @returns The appropriate state indicator
 */
export const getStatusIndicatorState = ({
  clipboardMessage,
  streamStatus,
  nextCtrlCWillExit,
  isConnected,
}: StatusIndicatorStateArgs): StatusIndicatorState => {
  if (nextCtrlCWillExit) {
    return { kind: 'ctrlC' }
  }

  if (clipboardMessage) {
    return { kind: 'clipboard', message: clipboardMessage }
  }

  if (!isConnected) {
    return { kind: 'connecting' }
  }

  if (streamStatus === 'waiting') {
    return { kind: 'waiting' }
  }

  if (streamStatus === 'streaming') {
    return { kind: 'streaming' }
  }

  return { kind: 'idle' }
}

type StatusIndicatorProps = StatusIndicatorStateArgs & {
  timerStartTime: number | null
}

export const StatusIndicator = ({
  clipboardMessage,
  streamStatus,
  timerStartTime,
  nextCtrlCWillExit,
  isConnected,
}: StatusIndicatorProps) => {
  const theme = useTheme()
  const state = getStatusIndicatorState({
    clipboardMessage,
    streamStatus,
    nextCtrlCWillExit,
    isConnected,
  })

  if (state.kind === 'ctrlC') {
    return <span fg={theme.secondary}>Press Ctrl-C again to exit</span>
  }

  if (state.kind === 'clipboard') {
    return <span fg={theme.primary}>{state.message}</span>
  }

  if (state.kind === 'connecting') {
    return <ShimmerText text="connecting..." />
  }

  if (state.kind === 'waiting') {
    return (
      <ShimmerText
        text="thinking..."
        interval={SHIMMER_INTERVAL_MS}
        primaryColor={theme.secondary}
      />
    )
  }

  if (state.kind === 'streaming') {
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
