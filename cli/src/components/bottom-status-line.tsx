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
 * Displays Claude subscription status and/or Codebuff Strong status
 */
export const BottomStatusLine: React.FC<BottomStatusLineProps> = ({
  isClaudeConnected,
  isClaudeActive,
  claudeQuota,
}) => {
  const theme = useTheme()

  // Use the more restrictive of the two quotas (5-hour window is usually the limiting factor)
  const claudeDisplayRemaining = claudeQuota
    ? Math.min(claudeQuota.fiveHourRemaining, claudeQuota.sevenDayRemaining)
    : null

  // Check if Claude quota is exhausted (0%)
  const isClaudeExhausted = claudeDisplayRemaining !== null && claudeDisplayRemaining <= 0

  // Get the reset time for the limiting Claude quota window
  const claudeResetTime = claudeQuota
    ? claudeQuota.fiveHourRemaining <= claudeQuota.sevenDayRemaining
      ? claudeQuota.fiveHourResetsAt
      : claudeQuota.sevenDayResetsAt
    : null

  // Only show when Claude is connected
  if (!isClaudeConnected) {
    return null
  }

  // Determine dot color for Claude: red if exhausted, green if active, muted otherwise
  const claudeDotColor = isClaudeExhausted
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
        gap: 2,
      }}
    >
      {/* Show Claude subscription when connected and not depleted */}
      {!isClaudeExhausted && (
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 0,
          }}
        >
          <text style={{ fg: claudeDotColor }}>●</text>
          <text style={{ fg: theme.muted }}> Claude subscription</text>
          {claudeDisplayRemaining !== null ? (
            <BatteryIndicator value={claudeDisplayRemaining} theme={theme} />
          ) : null}
        </box>
      )}

      {/* Show Claude as depleted when exhausted */}
      {isClaudeExhausted && (
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 0,
          }}
        >
          <text style={{ fg: theme.error }}>●</text>
          <text style={{ fg: theme.muted }}> Claude</text>
          {claudeResetTime && (
            <text style={{ fg: theme.muted }}>{` · resets in ${formatResetTime(claudeResetTime)}`}</text>
          )}
        </box>
      )}
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
