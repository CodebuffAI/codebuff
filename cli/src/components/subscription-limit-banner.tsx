import { SUBSCRIPTION_TIERS } from '@codebuff/common/constants/subscription-plans'
import open from 'open'
import React from 'react'

import { Button } from './button'
import { ProgressBar } from './progress-bar'
import { useSubscriptionQuery } from '../hooks/use-subscription-query'
import { useTheme } from '../hooks/use-theme'
import { useUpdatePreference } from '../hooks/use-update-preference'
import { useUsageQuery } from '../hooks/use-usage-query'
import { WEBSITE_URL } from '../login/constants'
import { useChatStore } from '../state/chat-store'
import { formatResetTime } from '../utils/time-format'
import { BORDER_CHARS } from '../utils/ui-constants'

export const SubscriptionLimitBanner = () => {
  const setInputMode = useChatStore((state) => state.setInputMode)
  const theme = useTheme()

  const { data: subscriptionData } = useSubscriptionQuery({
    refetchInterval: 15 * 1000,
  })

  const { data: usageData } = useUsageQuery({
    enabled: true,
    refetchInterval: 30 * 1000,
  })

  const rateLimit = subscriptionData?.hasSubscription ? subscriptionData.rateLimit : undefined
  const remainingBalance = usageData?.remainingBalance ?? 0
  const hasAlaCarteCredits = remainingBalance > 0

  // Determine if user can upgrade (not on highest tier)
  const maxTier = Math.max(...Object.keys(SUBSCRIPTION_TIERS).map(Number))
  const currentTier = subscriptionData?.hasSubscription ? subscriptionData.subscription.tier : 0
  const canUpgrade = currentTier < maxTier

  const fallbackToALaCarte = subscriptionData?.fallbackToALaCarte ?? false
  const updatePreference = useUpdatePreference()

  const handleToggleFallbackToALaCarte = () => {
    updatePreference.mutate({ fallbackToALaCarte: !fallbackToALaCarte })
  }

  if (!subscriptionData || !rateLimit?.limited) {
    return null
  }

  const { reason, weeklyPercentUsed, weeklyResetsAt: weeklyResetsAtStr, blockResetsAt: blockResetsAtStr } = rateLimit
  const isWeeklyLimit = reason === 'weekly_limit'
  const isBlockExhausted = reason === 'block_exhausted'
  const weeklyRemaining = 100 - weeklyPercentUsed
  const weeklyResetsAt = weeklyResetsAtStr ? new Date(weeklyResetsAtStr) : null
  const blockResetsAt = blockResetsAtStr ? new Date(blockResetsAtStr) : null

  const handleContinueWithCredits = () => {
    setInputMode('default')
  }

  const handleBuyCredits = () => {
    open(WEBSITE_URL + '/usage')
  }

  const handleUpgrade = () => {
    open(WEBSITE_URL + '/pricing')
  }

  const borderColor = isWeeklyLimit ? theme.error : theme.warning

  return (
    <box
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        flexDirection: 'column',
        gap: 0,
      }}
    >
      <box
        style={{
          flexDirection: 'column',
          justifyContent: 'center',
          minHeight: 3,
          gap: 0,
        }}
      >
        {isWeeklyLimit ? (
          <>
            <text style={{ fg: theme.error, marginBottom: 1 }}>
              🛑 Weekly limit reached
            </text>
            <text style={{ fg: theme.muted }}>
              You've used all {rateLimit.weeklyLimit.toLocaleString()} credits for this week.
            </text>
            {weeklyResetsAt && (
              <text style={{ fg: theme.muted }}>
                Weekly usage resets in {formatResetTime(weeklyResetsAt)}
              </text>
            )}
          </>
        ) : isBlockExhausted ? (
          <>
            <text style={{ fg: theme.warning, marginBottom: 1 }}>
              5 hour limit reached
            </text>
            {blockResetsAt && (
              <text style={{ fg: theme.muted }}>
                New session starts in {formatResetTime(blockResetsAt)}
              </text>
            )}
          </>
        ) : (
          <text style={{ fg: theme.warning }}>
            Subscription limit reached
          </text>
        )}

        <box style={{ flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 0 }}>
          <text style={{ fg: theme.muted }}>Weekly:</text>
          <ProgressBar value={weeklyRemaining} width={12} showPercentage={false} />
          <text style={{ fg: theme.muted }}>{weeklyPercentUsed}% used</text>
        </box>

        {hasAlaCarteCredits && (
          <Button onClick={handleToggleFallbackToALaCarte} disabled={updatePreference.isPending}>
            <text style={{ fg: theme.muted }}>
              {updatePreference.isPending ? '[...]' : fallbackToALaCarte ? '[x]' : '[ ]'} always use credits if subscription limit is reached
            </text>
          </Button>
        )}

        <box style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
          {hasAlaCarteCredits ? (
            <>
              <Button onClick={handleContinueWithCredits}>
                <text style={{ fg: theme.background, bg: theme.foreground }}>
                  {' '}Continue with credits ({remainingBalance.toLocaleString()}){' '}
                </text>
              </Button>
              {canUpgrade ? (
                <Button onClick={handleUpgrade}>
                  <text style={{ fg: theme.background, bg: theme.foreground }}>{' '}Upgrade Plan ↗{' '}</text>
                </Button>
              ) : (
                <Button onClick={handleBuyCredits}>
                  <text style={{ fg: theme.background, bg: theme.muted }}>{' '}Buy Credits ↗{' '}</text>
                </Button>
              )}
            </>
          ) : (
            <>
              <text style={{ fg: theme.muted }}>No a-la-carte credits available.</text>
              {canUpgrade ? (
                <Button onClick={handleUpgrade}>
                  <text style={{ fg: theme.background, bg: theme.muted }}>{' '}Upgrade Plan ↗{' '}</text>
                </Button>
              ) : (
                <Button onClick={handleBuyCredits}>
                  <text style={{ fg: theme.background, bg: theme.muted }}>{' '}Buy Credits ↗{' '}</text>
                </Button>
              )}
            </>
          )}
        </box>
      </box>
    </box>
  )
}
