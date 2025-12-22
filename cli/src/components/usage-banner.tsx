import { useQuery, useQueryClient } from '@tanstack/react-query'
import React, { useEffect } from 'react'
import open from 'open'

import { BottomBanner } from './bottom-banner'
import { usageQueryKeys, useUsageQuery } from '../hooks/use-usage-query'
import { useChatStore } from '../state/chat-store'
import {
  getBannerColorLevel,
  generateUsageBannerText,
  generateLoadingBannerText,
} from '../utils/usage-banner-state'
import { WEBSITE_URL } from '../login/constants'
import { useTheme } from '../hooks/use-theme'
import { Button } from './button'

const MANUAL_SHOW_TIMEOUT = 60 * 1000 // 1 minute
const USAGE_POLL_INTERVAL = 30 * 1000 // 30 seconds

export const UsageBanner = ({ showTime }: { showTime: number }) => {
  const queryClient = useQueryClient()
  const sessionCreditsUsed = useChatStore((state) => state.sessionCreditsUsed)
  const setInputMode = useChatStore((state) => state.setInputMode)

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
    balanceBreakdown?: { free: number; paid: number }
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
      })

  return (
    <BottomBanner
      borderColorKey={isLoadingData ? 'muted' : colorLevel}
      onClose={() => setInputMode('default')}
    >
      <Button
        onClick={() => {
          open(WEBSITE_URL + '/usage')
        }}
      >
        <text style={{ fg: theme.foreground }}>{text}</text>
      </Button>
    </BottomBanner>
  )
}
