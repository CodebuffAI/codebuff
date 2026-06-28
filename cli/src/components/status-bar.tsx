import { TextAttributes } from '@opentui/core'
import React, { useEffect, useState } from 'react'

import { Button } from './button'
import { ScrollToBottomButton } from './scroll-to-bottom-button'
import { ShimmerText } from './shimmer-text'

import { useTheme } from '../hooks/use-theme'
import { formatElapsedTime } from '../utils/format-elapsed-time'
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
  contextWindowUsage?: { used: number; max: number } | null
  /** Session-accumulated cost in cents (1 dollar = 100 cents). */
  sessionCostCents?: number | null
  /** Resolved model id for the active agent mode (short display string). */
  modelName?: string | null
  /** Git working-tree diff stats (modified/added/deleted counts). */
  diffStats?: { modified: number; added: number; deleted: number } | null
  onStop?: () => void
}

export const StatusBar = ({
  timerStartTime,
  isAtBottom,
  scrollToLatest,
  statusIndicatorState,
  contextWindowUsage,
  sessionCostCents,
  modelName,
  diffStats,
  onStop,
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
            text={statusIndicatorState.phaseLabel || 'thinking...'}
            interval={SHIMMER_INTERVAL_MS}
            primaryColor={theme.secondary}
          />
        )

      case 'streaming':
        return (
          <ShimmerText
            text={statusIndicatorState.phaseLabel || 'working...'}
            interval={SHIMMER_INTERVAL_MS}
            primaryColor={theme.secondary}
          />
        )

      case 'paused':
        return null

      case 'idle':
        return null
    }
  }

  const renderElapsedTime = () => {
    if (!shouldShowTimer || elapsedSeconds === 0) {
      return null
    }

    return <span fg={theme.secondary}>{formatElapsedTime(elapsedSeconds)}</span>
  }

  const renderContextWindowUsage = () => {
    if (!contextWindowUsage) {
      return null
    }

    const pct = Math.round(
      (contextWindowUsage.used / contextWindowUsage.max) * 100,
    )
    // Color-code: warning when approaching context limit (>= 70%)
    const fg = pct >= 70 ? theme.warning : theme.secondary

    return <span fg={fg}>{`ctx ${pct}%`}</span>
  }

  const renderSessionCost = () => {
    if (sessionCostCents == null || sessionCostCents === 0) {
      return null
    }
    const dollars = sessionCostCents / 100
    const formatted =
      dollars < 0.01 ? `$${(sessionCostCents / 100).toFixed(4)}` : `$${dollars.toFixed(2)}`
    return <span fg={theme.secondary}>{`cost ${formatted}`}</span>
  }

  const renderModelName = () => {
    if (!modelName) {
      return null
    }
    // Shorten common provider prefixes for compactness
    const short = modelName.replace(/^(openai|anthropic|google|openrouter)\//, '')
    return <span fg={theme.secondary}>{short}</span>
  }

  const renderDiffStats = () => {
    if (!diffStats) {
      return null
    }
    const { modified, added, deleted } = diffStats
    const total = modified + added + deleted
    if (total === 0) {
      return null
    }
    const parts: string[] = []
    if (modified > 0) parts.push(`~${modified}`)
    if (added > 0) parts.push(`+${added}`)
    if (deleted > 0) parts.push(`-${deleted}`)
    return <span fg={theme.secondary}>{`git ${parts.join(' ')}`}</span>
  }

  const statusIndicatorContent = renderStatusIndicator()
  const elapsedTimeContent = renderElapsedTime()
  const contextWindowContent = renderContextWindowUsage()
  const sessionCostContent = renderSessionCost()
  const modelNameContent = renderModelName()
  const diffStatsContent = renderDiffStats()

  const hasContent =
    statusIndicatorContent ||
    elapsedTimeContent ||
    contextWindowContent ||
    sessionCostContent ||
    modelNameContent ||
    diffStatsContent

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
          alignItems: 'center',
          gap: 1,
        }}
      >
        <text style={{ wrapMode: 'none' }}>{contextWindowContent}</text>
        <text style={{ wrapMode: 'none' }}>{sessionCostContent}</text>
        <text style={{ wrapMode: 'none' }}>{diffStatsContent}</text>
        <text style={{ wrapMode: 'none' }}>{modelNameContent}</text>
        <text style={{ wrapMode: 'none' }}>{elapsedTimeContent}</text>
        {onStop &&
          (statusIndicatorState.kind === 'waiting' ||
            statusIndicatorState.kind === 'streaming') && (
            <StatusActionButton onClick={onStop}>■ Esc</StatusActionButton>
          )}
      </box>
    </box>
  )
}
