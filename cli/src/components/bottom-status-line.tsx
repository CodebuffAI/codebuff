import React from 'react'

import { useTheme } from '../hooks/use-theme'
import { formatResetTime } from '../utils/time-format'

import type { ClaudeQuotaData } from '../hooks/use-claude-quota-query'
import type { SubscriptionRateLimit } from '../hooks/use-subscription-query'

interface BottomStatusLineProps {
  /** Whether Claude OAuth is connected */
  isClaudeConnected: boolean
  /** Whether Claude is actively being used (streaming/waiting) */
  isClaudeActive: boolean
  /** Quota data from Anthropic API */
  claudeQuota?: ClaudeQuotaData | null
  /** Whether the user has an active Codebuff Strong subscription */
  hasSubscription: boolean
  /** Rate limit data for the subscription */
  subscriptionRateLimit?: SubscriptionRateLimit | null
}

/**
 * Bottom status line component - shows below the input box
 * Displays Claude subscription status and/or Codebuff Strong status
 */
export const BottomStatusLine: React.FC<BottomStatusLineProps> = ({
  isClaudeConnected,
  isClaudeActive,
  claudeQuota,
  hasSubscription,
  subscriptionRateLimit,
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

  // Show Claude when connected and not depleted (takes priority over Strong)
  const showClaude = isClaudeConnected && !isClaudeExhausted
  // Show Strong when subscribed AND (no Claude connected OR Claude depleted)
  const showStrong = hasSubscription && (!isClaudeConnected || isClaudeExhausted)

  // Don't render if there's nothing to show
  if (!showClaude && !showStrong && !(isClaudeConnected && isClaudeExhausted)) {
    return null
  }

  // Determine dot color for Claude: red if exhausted, green if active, muted otherwise
  const claudeDotColor = isClaudeExhausted
    ? theme.error
    : isClaudeActive
      ? theme.success
      : theme.muted

  // Subscription remaining percentage (based on weekly)
  const subscriptionRemaining = subscriptionRateLimit
    ? 100 - subscriptionRateLimit.weeklyPercentUsed
    : null
  const isSubscriptionLimited = subscriptionRateLimit?.limited === true

  // Get subscription reset time
  const subscriptionResetTime = subscriptionRateLimit
    ? subscriptionRateLimit.reason === 'block_exhausted' && subscriptionRateLimit.blockResetsAt
      ? new Date(subscriptionRateLimit.blockResetsAt)
      : subscriptionRateLimit.weeklyResetsAt
        ? new Date(subscriptionRateLimit.weeklyResetsAt)
        : null
    : null

  // Determine dot color for Strong: red if limited, green if has remaining credits, muted otherwise
  const strongDotColor = isSubscriptionLimited
    ? theme.error
    : subscriptionRemaining !== null && subscriptionRemaining > 0
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
      {/* Show Claude subscription when connected (even when depleted, to show reset time) */}
      {isClaudeConnected && !isClaudeExhausted && (
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
      {isClaudeConnected && isClaudeExhausted && (
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

      {/* Show Codebuff Strong when subscribed and Claude not healthy */}
      {showStrong && (
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 0,
          }}
        >
          <text style={{ fg: strongDotColor }}>●</text>
          <text style={{ fg: theme.muted }}> Codebuff Strong</text>
          {isSubscriptionLimited && subscriptionResetTime ? (
            <text style={{ fg: theme.muted }}>{` · resets in ${formatResetTime(subscriptionResetTime)}`}</text>
          ) : subscriptionRemaining !== null ? (
            <BatteryIndicator value={subscriptionRemaining} theme={theme} />
          ) : null}
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
