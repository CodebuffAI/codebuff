import open from 'open'
import React from 'react'

import { Button } from './button'
import { ProgressBar } from './progress-bar'
import { useSubscriptionQuery } from '../hooks/use-subscription-query'
import { useTheme } from '../hooks/use-theme'
import { useUsageQuery } from '../hooks/use-usage-query'
import { WEBSITE_URL } from '../login/constants'
import { useChatStore } from '../state/chat-store'
import {
  getAlwaysUseALaCarte,
  setAlwaysUseALaCarte,
} from '../utils/settings'
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

  const [alwaysALaCarte, setAlwaysALaCarteState] = React.useState(
    () => getAlwaysUseALaCarte(),
  )

  const handleToggleAlwaysALaCarte = () => {
    const newValue = !alwaysALaCarte
    setAlwaysALaCarteState(newValue)
    setAlwaysUseALaCarte(newValue)
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

  const handleWait = () => {
    setInputMode('default')
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
            <text style={{ fg: theme.error }}>
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
            <text style={{ fg: theme.warning }}>
              ⏱️  5 hour limit reached
            </text>
            {blockResetsAt && (
              <text style={{ fg: theme.muted }}>
                New block starts in {formatResetTime(blockResetsAt)}
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
          <Button onClick={handleToggleAlwaysALaCarte}>
            <text style={{ fg: theme.muted }}>
              {alwaysALaCarte ? '[x]' : '[ ]'} always use a-la-carte if subscription limit is reached
            </text>
          </Button>
        )}

        <box style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
          {hasAlaCarteCredits ? (
            <>
              <Button onClick={handleContinueWithCredits}>
                <text style={{ fg: theme.background, bg: theme.foreground }}>
                  {' '}Continue with a-la-carte{' '}
                </text>
                <text style={{ fg: theme.muted }}>
                  {' '}({remainingBalance.toLocaleString()} credits)
                </text>
              </Button>
              {isWeeklyLimit ? (
                <Button onClick={handleBuyCredits}>
                  <text style={{ fg: theme.background, bg: theme.muted }}>{' '}Buy Credits{' '}</text>
                </Button>
              ) : (
                <Button onClick={handleWait}>
                  <text style={{ fg: theme.background, bg: theme.muted }}>{' '}Wait for new block{' '}</text>
                </Button>
              )}
            </>
          ) : (
            <>
              <text style={{ fg: theme.muted }}>No a-la-carte credits available.</text>
              <Button onClick={handleBuyCredits}>
                <text style={{ fg: theme.background, bg: theme.foreground }}>{' '}Buy Credits{' '}</text>
              </Button>
              <Button onClick={handleWait}>
                <text style={{ fg: theme.background, bg: theme.muted }}>{' '}Wait{' '}</text>
              </Button>
            </>
          )}
        </box>
      </box>
    </box>
  )
}
