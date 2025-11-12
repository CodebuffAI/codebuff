import { TextAttributes } from '@opentui/core'
import React, { useEffect, useState } from 'react'

import { Button } from './button'
import { ShimmerText } from './shimmer-text'
import { useTheme } from '../hooks/use-theme'
import { formatElapsedTime } from '../utils/format-elapsed-time'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { StreamStatus } from '../hooks/use-message-queue'

const SHIMMER_INTERVAL_MS = 160

interface StatusBarProps {
  clipboardMessage: string | null
  streamStatus: StreamStatus
  timerStartTime: number | null
  nextCtrlCWillExit: boolean
  isConnected: boolean
  isAtBottom: boolean
  separatorWidth: number
  scrollToLatest: () => void
  scrollIndicatorHovered: boolean
  setScrollIndicatorHovered: (hovered: boolean) => void
}

export const StatusBar = ({
  clipboardMessage,
  streamStatus,
  timerStartTime,
  nextCtrlCWillExit,
  isConnected,
  isAtBottom,
  separatorWidth,
  scrollToLatest,
  scrollIndicatorHovered,
  setScrollIndicatorHovered,
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

    if (clipboardMessage) {
      return <span fg={theme.primary}>{clipboardMessage}</span>
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

  return (
    <box style={{ width: '100%' }}>
      <text style={{ wrapMode: 'none' }}>
        <span fg={theme.success}>
          {BORDER_CHARS.topLeft}
          {BORDER_CHARS.horizontal.repeat(Math.max(0, separatorWidth - 2))}
          {BORDER_CHARS.topRight}
        </span>
      </text>
      <box style={{ flexDirection: 'row', alignItems: 'center' }}>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.success}>{BORDER_CHARS.vertical}</span>
        </text>
        <box
          style={{
            flexGrow: 1,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 1,
            paddingRight: 1,
            gap: 1,
          }}
        >
          <box
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 0,
            }}
          >
            <text style={{ wrapMode: 'none' }}>{renderStatusIndicator()}</text>
          </box>

          <box style={{ flexShrink: 0 }}>
            {!isAtBottom && (
              <Button
                style={{ paddingLeft: 2, paddingRight: 2 }}
                onClick={() => scrollToLatest()}
                onMouseOver={() => setScrollIndicatorHovered(true)}
                onMouseOut={() => setScrollIndicatorHovered(false)}
              >
                <text>
                  <span
                    fg={theme.info}
                    attributes={
                      scrollIndicatorHovered
                        ? TextAttributes.BOLD
                        : TextAttributes.DIM
                    }
                  >
                    {scrollIndicatorHovered ? '↓ Scroll to bottom ↓' : '↓'}
                  </span>
                </text>
              </Button>
            )}
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
            <text style={{ wrapMode: 'none' }}>{renderElapsedTime()}</text>
          </box>
        </box>
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.success}>{BORDER_CHARS.vertical}</span>
        </text>
      </box>
    </box>
  )
}
