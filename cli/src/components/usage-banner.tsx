import { CHATGPT_OAUTH_ENABLED } from '@codebuff/common/constants/chatgpt-oauth'
import { IS_FREEBUFF } from '../utils/constants'
import { isChatGptOAuthValid } from '@codebuff/sdk'
import { TextAttributes } from '@opentui/core'
import { safeOpen } from '../utils/open-url'
import React, { useEffect, useMemo } from 'react'

import { BottomBanner } from './bottom-banner'
import { Button } from './button'
import { ProgressBar } from './progress-bar'
import { getActivityQueryData } from '../hooks/use-activity-query'
import { useSubscriptionQuery } from '../hooks/use-subscription-query'
import { useTheme } from '../hooks/use-theme'
import { useUpdatePreference } from '../hooks/use-update-preference'
import { usageQueryKeys, useUsageQuery } from '../hooks/use-usage-query'
import { WEBSITE_URL } from '../login/constants'
import { useChatStore } from '../state/chat-store'
import { formatResetTime, formatResetTimeLong } from '../utils/time-format'
import {
  getBannerColorLevel,
  generateLoadingBannerText,
} from '../utils/usage-banner-state'


const MANUAL_SHOW_TIMEOUT = 60 * 1000 // 1 minute
const USAGE_POLL_INTERVAL = 30 * 1000 // 30 seconds

/**
 * Format the renewal date for display
 */
const formatRenewalDate = (dateStr: string | null): string => {
  if (!dateStr) return ''
  const resetDate = new Date(dateStr)
  const today = new Date()
  const isToday = resetDate.toDateString() === today.toDateString()
  return isToday
    ? resetDate.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
    : resetDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
}

export const UsageBanner = ({ showTime }: { showTime: number }) => {
  if (IS_FREEBUFF) return null

  const sessionCreditsUsed = useChatStore((state) => state.sessionCreditsUsed)
  const setInputMode = useChatStore((state) => state.setInputMode)

  // Check if ChatGPT OAuth is connected
  const isChatGptConnected = CHATGPT_OAUTH_ENABLED && isChatGptOAuthValid()

  // Fetch subscription data
  const { data: subscriptionData, isLoading: isSubscriptionLoading } = useSubscriptionQuery({
    refetchInterval: 30 * 1000,
  })

  const {
    data: apiData,
    isLoading,
    isFetching,
  } = useUsageQuery({
    enabled: true,
    refetchInterval: USAGE_POLL_INTERVAL,
  })

  // Get cached data for immediate display
  const cachedUsageData = getActivityQueryData<{
    type: 'usage-response'
    usage: number
    remainingBalance: number | null
    balanceBreakdown?: { free: number; paid: number; ad?: number }
    next_quota_reset: string | null
  }>(usageQueryKeys.current())

  // Auto-hide after timeout
  useEffect(() => {
    const timer = setTimeout(() => {
      setInputMode('default')
    }, MANUAL_SHOW_TIMEOUT)
    return () => clearTimeout(timer)
  }, [showTime, setInputMode])

  const theme = useTheme()

  const activeData = apiData || cachedUsageData
  const isLoadingData = isLoading || isFetching

  // Show loading state immediately when banner is opened but data isn't ready
  if (!activeData) {
    return (
      <BottomBanner
        borderColorKey="muted"
        text={generateLoadingBannerText(sessionCreditsUsed)}
        onClose={() => setInputMode('default')}
      />
    )
  }

  const colorLevel = getBannerColorLevel(activeData.remainingBalance)
  const renewalDate = activeData.next_quota_reset ? formatRenewalDate(activeData.next_quota_reset) : null

  const activeSubscription = subscriptionData?.hasSubscription ? subscriptionData : null
  const { rateLimit, subscription: subscriptionInfo, displayName } = activeSubscription ?? {}

  return (
    <BottomBanner
      borderColorKey={isLoadingData ? 'muted' : colorLevel}
      onClose={() => setInputMode('default')}
    >
      <box style={{ flexDirection: 'column', gap: 0 }}>
        {activeSubscription && (
          <SubscriptionUsageSection
            displayName={displayName}
            subscriptionInfo={subscriptionInfo}
            rateLimit={rateLimit}
            isLoading={isSubscriptionLoading}
            fallbackToALaCarte={activeSubscription.fallbackToALaCarte ?? false}
          />
        )}

        {/* Codebuff credits section - structured layout */}
        <Button
          onClick={() => {
            safeOpen(WEBSITE_URL + '/usage')
          }}
        >
          <box style={{ flexDirection: 'column', gap: 0 }}>
            {/* Main stats row */}
            <box style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1 }}>
              <text style={{ fg: theme.muted }}>Session:</text>
              <text style={{ fg: theme.foreground }}>{sessionCreditsUsed.toLocaleString()} credits</text>
              <text style={{ fg: theme.muted }}>·</text>
              <text style={{ fg: theme.muted }}>Remaining:</text>
              {isLoadingData ? (
                <text style={{ fg: theme.muted }}>...</text>
              ) : (
                <text style={{ fg: theme.foreground }}>
                  {activeData.remainingBalance?.toLocaleString() ?? '?'} credits
                </text>
              )}

              {!activeSubscription && renewalDate && (
                <>
                  <text style={{ fg: theme.muted }}>· Renews:</text>
                  <text style={{ fg: theme.foreground }}>{renewalDate}</text>
                </>
              )}
            </box>
            {/* See more link */}
            <text style={{ fg: theme.muted }}>See more on {WEBSITE_URL} ↗</text>
          </box>
        </Button>

        {isChatGptConnected && (
          <box style={{ flexDirection: 'column', marginTop: 1 }}>
            <text style={{ fg: theme.muted }}>ChatGPT subscription</text>
            <text style={{ fg: theme.muted }}>
              Connected for supported OpenAI streaming models
            </text>
          </box>
        )}
      </box>
    </BottomBanner>
  )
}

interface SubscriptionUsageSectionProps {
  displayName?: string
  subscriptionInfo?: { tier: number }
  rateLimit?: {
    blockLimit?: number
    blockUsed?: number
    blockResetsAt?: string
    weeklyPercentUsed: number
    weeklyResetsAt: string
  }
  isLoading: boolean
  fallbackToALaCarte: boolean
}

const SubscriptionUsageSection: React.FC<SubscriptionUsageSectionProps> = ({
  displayName,
  subscriptionInfo,
  rateLimit,
  isLoading,
  fallbackToALaCarte,
}) => {
  const theme = useTheme()
  const updatePreference = useUpdatePreference()

  const handleToggleFallbackToALaCarte = () => {
    updatePreference.mutate({ fallbackToALaCarte: !fallbackToALaCarte })
  }

  const blockPercent = useMemo(() => {
    if (rateLimit?.blockLimit == null || rateLimit.blockUsed == null) return 100
    return Math.max(0, 100 - Math.round((rateLimit.blockUsed / rateLimit.blockLimit) * 100))
  }, [rateLimit?.blockLimit, rateLimit?.blockUsed])

  const weeklyPercent = rateLimit ? 100 - rateLimit.weeklyPercentUsed : 100

  return (
    <box style={{ flexDirection: 'column', marginBottom: 1 }}>
      <box style={{ flexDirection: 'row', gap: 1 }}>
        <text style={{ fg: theme.foreground }}>
          💪 {displayName ?? 'Strong'} subscription
        </text>
        {subscriptionInfo?.tier && (
          <text style={{ fg: theme.muted }}>${subscriptionInfo.tier}/mo</text>
        )}
      </box>
      {isLoading ? (
        <text style={{ fg: theme.muted }}>Loading subscription data...</text>
      ) : rateLimit ? (
        <box style={{ flexDirection: 'column', gap: 0 }}>
          <box style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
            <text style={{ fg: theme.muted }}>{`5-hour limit ${`${blockPercent}%`.padStart(4)} `}</text>
            <ProgressBar value={blockPercent} width={12} showPercentage={false} />
            <text style={{ fg: theme.muted }}>
              {rateLimit.blockResetsAt
                ? ` resets in ${formatResetTime(new Date(rateLimit.blockResetsAt))}`
                : ''}
            </text>
          </box>
          <box style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
            <text style={{ fg: theme.muted }}>{`Weekly limit ${`${weeklyPercent}%`.padStart(4)} `}</text>
            <ProgressBar value={weeklyPercent} width={12} showPercentage={false} />
            <text style={{ fg: theme.muted }}>
              {` resets in ${formatResetTimeLong(rateLimit.weeklyResetsAt)}`}
            </text>
          </box>
        </box>
      ) : null}
      <box style={{ flexDirection: 'column', gap: 0, marginTop: 1 }}>
        <box style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
          <text style={{ fg: theme.muted }}>Credit spending:</text>
          <text style={{ fg: fallbackToALaCarte ? theme.foreground : theme.warning }}>
            {fallbackToALaCarte ? 'enabled' : 'disabled'}
          </text>
          <Button onClick={handleToggleFallbackToALaCarte} disabled={updatePreference.isPending}>
            <text style={{ fg: theme.muted, attributes: TextAttributes.UNDERLINE }}>
              {updatePreference.isPending ? '[updating...]' : `[${fallbackToALaCarte ? 'disable' : 'enable'}]`}
            </text>
          </Button>
        </box>
        <text style={{ fg: theme.muted }}>
          {fallbackToALaCarte
            ? 'Your credits will be used when subscription limits are reached.'
            : 'Credits will NOT be spent when subscription limits are reached. Enable to use credits.'}
        </text>
      </box>
    </box>
  )
}
