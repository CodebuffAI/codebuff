import { isClaudeOAuthValid } from '@codebuff/sdk'
import open from 'open'
import React, { useEffect } from 'react'

import { BottomBanner } from './bottom-banner'
import { Button } from './button'
import { ProgressBar } from './progress-bar'
import { getActivityQueryData } from '../hooks/use-activity-query'
import { useClaudeQuotaQuery } from '../hooks/use-claude-quota-query'
import { useTheme } from '../hooks/use-theme'
import { usageQueryKeys, useUsageQuery } from '../hooks/use-usage-query'
import { WEBSITE_URL } from '../login/constants'
import { useChatStore } from '../state/chat-store'
import { formatResetTime } from '../utils/time-format'
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
  const sessionCreditsUsed = useChatStore((state) => state.sessionCreditsUsed)
  const setInputMode = useChatStore((state) => state.setInputMode)

  // Check if Claude OAuth is connected
  const isClaudeConnected = isClaudeOAuthValid()

  // Fetch Claude quota data if connected
  const { data: claudeQuota, isLoading: isClaudeLoading } = useClaudeQuotaQuery({
    enabled: isClaudeConnected,
    refetchInterval: 30 * 1000, // Refresh every 30 seconds when banner is open
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
  const adCredits = activeData.balanceBreakdown?.ad
  const renewalDate = activeData.next_quota_reset ? formatRenewalDate(activeData.next_quota_reset) : null

  return (
    <BottomBanner
      borderColorKey={isLoadingData ? 'muted' : colorLevel}
      onClose={() => setInputMode('default')}
    >
      <box style={{ flexDirection: 'column', gap: 0 }}>
        {/* Codebuff credits section - structured layout */}
        <Button
          onClick={() => {
            open(WEBSITE_URL + '/usage')
          }}
        >
          <box style={{ flexDirection: 'column', gap: 0 }}>
            {/* Main stats row */}
            <box style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 1 }}>
              <text style={{ fg: theme.muted }}>Session:</text>
              <text style={{ fg: theme.foreground }}>{sessionCreditsUsed.toLocaleString()}</text>
              <text style={{ fg: theme.muted }}>·</text>
              <text style={{ fg: theme.muted }}>Remaining:</text>
              {isLoadingData ? (
                <text style={{ fg: theme.muted }}>...</text>
              ) : (
                <text style={{ fg: theme.foreground }}>
                  {activeData.remainingBalance?.toLocaleString() ?? '?'}
                </text>
              )}
              {adCredits != null && adCredits > 0 && (
                <text style={{ fg: theme.muted }}>{`(${adCredits} from ads)`}</text>
              )}
              {renewalDate && (
                <>
                  <text style={{ fg: theme.muted }}>· Renews:</text>
                  <text style={{ fg: theme.foreground }}>{renewalDate}</text>
                </>
              )}
            </box>
            {/* See more link */}
            <text style={{ fg: theme.muted }}>↗ See more on {WEBSITE_URL}</text>
          </box>
        </Button>

        {/* Claude subscription section - only show if connected */}
        {isClaudeConnected && (
          <box style={{ flexDirection: 'column', marginTop: 1 }}>
            <text style={{ fg: theme.muted }}>Claude subscription</text>
            {isClaudeLoading ? (
              <text style={{ fg: theme.muted }}>Loading quota...</text>
            ) : claudeQuota ? (
              <box style={{ flexDirection: 'column', gap: 0 }}>
                <box style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                  <text style={{ fg: theme.muted }}>5-hour:</text>
                  <ProgressBar value={claudeQuota.fiveHourRemaining} width={15} />
                  {claudeQuota.fiveHourResetsAt && (
                    <text style={{ fg: theme.muted }}>
                      (resets in {formatResetTime(claudeQuota.fiveHourResetsAt)})
                    </text>
                  )}
                </box>
                {/* Only show 7-day bar if the user has a 7-day limit */}
                {claudeQuota.sevenDayResetsAt && (
                  <box style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
                    <text style={{ fg: theme.muted }}>7-day: </text>
                    <ProgressBar value={claudeQuota.sevenDayRemaining} width={15} />
                    <text style={{ fg: theme.muted }}>
                      (resets in {formatResetTime(claudeQuota.sevenDayResetsAt)})
                    </text>
                  </box>
                )}
              </box>
            ) : (
              <text style={{ fg: theme.muted }}>Unable to fetch quota</text>
            )}
          </box>
        )}
      </box>
    </BottomBanner>
  )
}
