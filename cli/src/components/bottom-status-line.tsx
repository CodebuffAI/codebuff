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
          <text
            style={{
              fg:
                displayRemaining <= 10
                  ? theme.error
                  : displayRemaining <= 25
                    ? theme.warning
                    : theme.muted,
            }}
          >{` ${Math.round(displayRemaining)}%`}</text>
        ) : null}
      </box>
    </box>
  )
}
