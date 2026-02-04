import React from 'react'

import { useTheme } from '../hooks/use-theme'
import { formatResetTime } from '../utils/time-format'

import type { ClaudeQuotaData } from '../hooks/use-claude-quota-query'

interface BottomStatusLineProps {
  /** Whether Claude OAuth is connected */
  isClaudeConnected: boolean
  /** Whether Claude is actively being used (streaming/waiting) */
  isClaudeActive: boolean
  /** Quota data from Anthropic API */
  claudeQuota?: ClaudeQuotaData | null
}

/**
 * Bottom status line component - shows below the input box
 * Currently displays Claude subscription status when connected
 */
export const BottomStatusLine: React.FC<BottomStatusLineProps> = ({
  isClaudeConnected,
  isClaudeActive,
  claudeQuota,
}) => {
  const theme = useTheme()

  // Don't render if there's nothing to show
  if (!isClaudeConnected) {
    return null
  }

  // Use the more restrictive of the two quotas (5-hour window is usually the limiting factor)
  const displayRemaining = claudeQuota
    ? Math.min(claudeQuota.fiveHourRemaining, claudeQuota.sevenDayRemaining)
    : null

  // Check if quota is exhausted (0%)
  const isExhausted = displayRemaining !== null && displayRemaining <= 0

  // Get the reset time for the limiting quota window
  const resetTime = claudeQuota
    ? claudeQuota.fiveHourRemaining <= claudeQuota.sevenDayRemaining
      ? claudeQuota.fiveHourResetsAt
      : claudeQuota.sevenDayResetsAt
    : null

  // Determine dot color: red if exhausted, green if active, muted otherwise
  const dotColor = isExhausted
    ? theme.error
    : isClaudeActive
      ? theme.success
      : theme.muted

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        paddingRight: 1,
      }}
    >
      <box
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 0,
        }}
      >
        <text style={{ fg: dotColor }}>●</text>
        <text style={{ fg: theme.muted }}> Claude subscription</text>
        {isExhausted && resetTime ? (
          <text style={{ fg: theme.muted }}>{` · resets in ${formatResetTime(resetTime)}`}</text>
        ) : displayRemaining !== null ? (
          <BatteryIndicator value={displayRemaining} theme={theme} />
        ) : null}
      </box>
    </box>
  )
}

/** Battery indicator width in characters */
const BATTERY_WIDTH = 8

/** Compact battery-style progress indicator for the status line */
const BatteryIndicator: React.FC<{
  value: number
  theme: { muted: string; warning: string; error: string }
}> = ({ value, theme }) => {
  const clampedValue = Math.max(0, Math.min(100, value))
  const filledWidth = Math.round((clampedValue / 100) * BATTERY_WIDTH)
  const emptyWidth = BATTERY_WIDTH - filledWidth

  const filledChar = '█'
  const emptyChar = '░'

  const filled = filledChar.repeat(filledWidth)
  const empty = emptyChar.repeat(emptyWidth)

  // Color based on percentage thresholds
  // Use muted color for healthy capacity (>25%) to avoid drawing attention,
  // warning/error colors only when running low
  const barColor =
    clampedValue <= 10
      ? theme.error
      : clampedValue <= 25
        ? theme.warning
        : theme.muted

  return (
    <box style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
      <text style={{ fg: theme.muted }}> [</text>
      <text style={{ fg: barColor }}>{filled}</text>
      <text style={{ fg: theme.muted }}>{empty}]</text>
    </box>
  )
}
