import { getFreebuffModel } from '@codebuff/common/constants/freebuff-models'
import { TextAttributes } from '@opentui/core'
import React, { useEffect, useState } from 'react'

import { Button } from './button'
import { ScrollToBottomButton } from './scroll-to-bottom-button'
import { ShimmerText } from './shimmer-text'

import { useFreebuffSessionProgress } from '../hooks/use-freebuff-session-progress'
import { useTheme } from '../hooks/use-theme'
import { formatElapsedTime } from '../utils/format-elapsed-time'
import {
  FREEBUFF_COUNTDOWN_VISIBLE_MS,
  formatFreebuffSessionCountdown,
  formatFreebuffSessionRemaining,
} from '../utils/freebuff-session-display'

import type { FreebuffSessionResponse } from '../types/freebuff-session'
import type { StatusIndicatorState } from '../utils/status-indicator-state'

/** A small status-bar action button with hover-bold styling. */
const StatusActionButton = ({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) => {
  const theme = useTheme()
  const [hovered, setHovered] = useState(false)

  return (
    <Button
      style={{ paddingLeft: 1, paddingRight: 1 }}
      onClick={onClick}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
    >
      <text>
        <span
          fg={theme.secondary}
          attributes={hovered ? TextAttributes.BOLD : TextAttributes.NONE}
        >
          {children}
        </span>
      </text>
    </Button>
  )
}

const SHIMMER_INTERVAL_MS = 160

interface StatusBarProps {
  timerStartTime: number | null
  isAtBottom: boolean
  scrollToLatest: () => void
  statusIndicatorState: StatusIndicatorState
  onStop?: () => void
  onEndSession?: () => void
  freebuffSession: FreebuffSessionResponse | null
}

export const StatusBar = ({
  timerStartTime,
  isAtBottom,
  scrollToLatest,
  statusIndicatorState,
  onStop,
  onEndSession,
  freebuffSession,
}: StatusBarProps) => {
  const theme = useTheme()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // Show timer when actively working (streaming or waiting for response) or paused (ask_user)
  // This uses statusIndicatorState as the single source of truth for "is the LLM working?"
  const shouldShowTimer =
    statusIndicatorState?.kind === 'waiting' ||
    statusIndicatorState?.kind === 'streaming' ||
    statusIndicatorState?.kind === 'paused'

  useEffect(() => {
    if (!timerStartTime || !shouldShowTimer) {
      setElapsedSeconds(0)
      return
    }

    // When paused, don't update the timer - just keep the frozen value
    if (statusIndicatorState?.kind === 'paused') {
      // Calculate current elapsed time once and freeze it
      const now = Date.now()
      const elapsed = Math.floor((now - timerStartTime) / 1000)
      setElapsedSeconds(elapsed)
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
  }, [timerStartTime, shouldShowTimer, statusIndicatorState?.kind])

  const sessionProgress = useFreebuffSessionProgress(freebuffSession)
  const isUnlimited =
    freebuffSession?.status === 'active' && !freebuffSession.rateLimit

  const renderStatusIndicator = () => {
    switch (statusIndicatorState.kind) {
      case 'ctrlC':
        return <span fg={theme.secondary}>Press Ctrl-C again to exit</span>

      case 'clipboard':
        // Use green color for feedback success messages
        const isFeedbackSuccess =
          statusIndicatorState.message.includes('Feedback sent')
        return (
          <span fg={isFeedbackSuccess ? theme.success : theme.primary}>
            {statusIndicatorState.message}
          </span>
        )

      case 'reconnected':
        return <span fg={theme.success}>Reconnected</span>

      case 'retrying':
        return <ShimmerText text="retrying..." primaryColor={theme.warning} />

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

      case 'paused':
        return null

      case 'idle':
        if (sessionProgress !== null) {
          const isUrgent =
            sessionProgress.remainingMs < FREEBUFF_COUNTDOWN_VISIBLE_MS
          const modelName =
            freebuffSession?.status === 'active'
              ? getFreebuffModel(freebuffSession.model).displayName
              : null
          return (
            <span
              fg={
                isUnlimited
                  ? theme.secondary
                  : isUrgent
                    ? theme.warning
                    : theme.secondary
              }
            >
              {modelName ? `${modelName} · ` : ''}
              {isUnlimited
                ? 'unlimited'
                : formatFreebuffSessionRemaining(sessionProgress.remainingMs)}
            </span>
          )
        }
        return null
    }
  }

  const renderElapsedTime = () => {
    if (!shouldShowTimer || elapsedSeconds === 0) {
      return null
    }

    return <span fg={theme.secondary}>{formatElapsedTime(elapsedSeconds)}</span>
  }

  const statusIndicatorContent = renderStatusIndicator()
  const elapsedTimeContent = renderElapsedTime()

  // Show gray background when there's status indicator, timer, or when the
  // freebuff session fill is visible (otherwise the fill would float over
  // transparent space).
  const hasContent =
    statusIndicatorContent || elapsedTimeContent || sessionProgress !== null

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
      {sessionProgress !== null && (
        <box
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            // Fill anchors left and shrinks as time passes — the draining
            // bar is the countdown; no separate numeric readout needed.
            width: `${sessionProgress.fraction * 100}%`,
            backgroundColor: theme.surfaceHover,
          }}
        />
      )}
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
          alignItems: 'center',
          gap: 1,
        }}
      >
        <text style={{ wrapMode: 'none' }}>{elapsedTimeContent}</text>
        {onStop &&
          (statusIndicatorState.kind === 'waiting' ||
            statusIndicatorState.kind === 'streaming') && (
            <StatusActionButton onClick={onStop}>■ Esc</StatusActionButton>
          )}
        {onEndSession &&
          statusIndicatorState.kind === 'idle' &&
          freebuffSession?.status === 'active' && (
            <StatusActionButton onClick={onEndSession}>
              ✕ End session
            </StatusActionButton>
          )}
        {sessionProgress !== null &&
          sessionProgress.remainingMs < FREEBUFF_COUNTDOWN_VISIBLE_MS &&
          statusIndicatorState.kind !== 'idle' &&
          !isUnlimited && (
            <text style={{ wrapMode: 'none' }}>
              <span fg={theme.warning} attributes={TextAttributes.BOLD}>
                {formatFreebuffSessionCountdown(sessionProgress.remainingMs)}
              </span>
            </text>
          )}
      </box>
    </box>
  )
}
