import React from 'react'

import { useTheme } from '../hooks/use-theme'

import type { ClaudeQuotaData } from '../hooks/use-claude-quota-query'
import type { ChatTheme } from '../types/theme-system'

interface BottomStatusLineProps {
  /** Whether Claude OAuth is connected */
  isClaudeConnected: boolean
  /** Whether Claude is actively being used (streaming/waiting) */
  isClaudeActive: boolean
  /** Quota data from Anthropic API */
  claudeQuota?: ClaudeQuotaData | null
}

/**
 * Format remaining quota for display
 */
const formatQuota = (remaining: number): string => {
  const rounded = Math.round(remaining)
  return `${rounded}%`
}

/**
 * Get color for quota percentage - only highlight when approaching limit
 */
const getQuotaColor = (remaining: number, theme: ChatTheme): string => {
  if (remaining <= 10) return theme.error
  if (remaining <= 25) return theme.warning
  return theme.muted // Use muted for normal levels - doesn't need to be salient
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
        <text style={{ fg: isClaudeActive ? theme.success : theme.muted }}>●</text>
        <text style={{ fg: isClaudeActive ? theme.primary : theme.muted }}> Claude subscription</text>
        {displayRemaining !== null && (
          <text style={{ fg: getQuotaColor(displayRemaining, theme) }}>
            {' '}{formatQuota(displayRemaining)}
          </text>
        )}
      </box>
    </box>
  )
}
