import { useQuery, useQueryClient } from '@tanstack/react-query'
import React, { useEffect } from 'react'
import open from 'open'

import { BottomBanner } from './bottom-banner'
import { Button } from './button'
import { ProgressBar } from './progress-bar'
import { useClaudeQuotaQuery } from '../hooks/use-claude-quota-query'
import { usageQueryKeys, useUsageQuery } from '../hooks/use-usage-query'
import { useChatStore } from '../state/chat-store'
import {
  getBannerColorLevel,
  generateUsageBannerText,
  generateLoadingBannerText,
} from '../utils/usage-banner-state'
import { WEBSITE_URL } from '../login/constants'
import { useTheme } from '../hooks/use-theme'
import { isClaudeOAuthValid } from '@codebuff/sdk'

const MANUAL_SHOW_TIMEOUT = 60 * 1000 // 1 minute
const USAGE_POLL_INTERVAL = 30 * 1000 // 30 seconds

/**
 * Format time until reset in human-readable form
 */
const formatResetTime = (resetDate: Date | null): string => {
  if (!resetDate) return ''
  const now = new Date()
  const diffMs = resetDate.getTime() - now.getTime()
  if (diffMs <= 0) return 'now'

  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMins / 60)
  const remainingMins = diffMins % 60

  if (diffHours > 0) {
    return `${diffHours}h ${remainingMins}m`
  }
  return `${diffMins}m`
}

export const UsageBanner = ({ showTime }: { showTime: number }) => {
  const queryClient = useQueryClient()
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
  })

  // Manual polling using setInterval - TanStack Query's refetchInterval doesn't work
  // reliably in terminal environments even with focusManager configuration
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: usageQueryKeys.current() })
    }, USAGE_POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [queryClient])

  const { data: cachedUsageData } = useQuery<{
    type: 'usage-response'
    usage: number
    remainingBalance: number | null
    balanceBreakdown?: { free: number; paid: number; ad?: number }
    next_quota_reset: string | null
  }>({
    queryKey: usageQueryKeys.current(),
    enabled: false,
  })

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

  // Show loading indicator if refreshing data
  const text = isLoadingData
    ? generateLoadingBannerText(sessionCreditsUsed)
    : generateUsageBannerText({
        sessionCreditsUsed,
        remainingBalance: activeData.remainingBalance,
        next_quota_reset: activeData.next_quota_reset,
        adCredits: activeData.balanceBreakdown?.ad,
      })

  return (
    <BottomBanner
      borderColorKey={isLoadingData ? 'muted' : colorLevel}
      onClose={() => setInputMode('default')}
    >
      <box style={{ flexDirection: 'column', gap: 0 }}>
        {/* Codebuff credits section */}
        <Button
          onClick={() => {
            open(WEBSITE_URL + '/usage')
          }}
        >
          <text style={{ fg: theme.foreground }}>{text}</text>
        </Button>

        {/* Claude subscription section - only show if connected */}
        {isClaudeConnected && (
          <box style={{ flexDirection: 'column', marginTop: 1 }}>
            <text style={{ fg: theme.primary }}>Claude subscription</text>
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
