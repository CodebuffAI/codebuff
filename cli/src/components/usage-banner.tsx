import type { UserState } from '@codebuff/common/old-constants'
import { useQuery } from '@tanstack/react-query'
import React, { useEffect, useRef, useState } from 'react'

import { BannerWrapper } from './banner-wrapper'
import { useTheme } from '../hooks/use-theme'
import { usageQueryKeys, useUsageQuery } from '../hooks/use-usage-query'
import { useChatStore } from '../state/chat-store'
import { getAuthToken } from '../utils/auth'
import {
  getBannerColorLevel,
  generateUsageBannerText,
  generateLoadingBannerText,
  shouldAutoShowBanner,
} from '../utils/usage-banner-state'

const MANUAL_SHOW_TIMEOUT = 60 * 1000 // 1 minute
const AUTO_SHOW_TIMEOUT = 5 * 60 * 1000 // 5 minutes

export const UsageBanner = () => {
  const theme = useTheme()
  const sessionCreditsUsed = useChatStore((state) => state.sessionCreditsUsed)
  const isChainInProgress = useChatStore((state) => state.isChainInProgress)
  const setInputMode = useChatStore((state) => state.setInputMode)

  const [isAutoShown, setIsAutoShown] = useState(false)
  const lastWarnedStateRef = useRef<UserState | null>(null)

  const { data: apiData, isLoading, isFetching } = useUsageQuery({ enabled: true })

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

  // Credit warning monitoring logic
  useEffect(() => {
    const authToken = getAuthToken()
    const decision = shouldAutoShowBanner(
      isChainInProgress,
      !!authToken,
      cachedUsageData?.remainingBalance ?? null,
      lastWarnedStateRef.current,
    )

    if (decision.newWarningState !== lastWarnedStateRef.current) {
      lastWarnedStateRef.current = decision.newWarningState
    }

    if (decision.shouldShow) {
      setIsAutoShown(true)
    }
  }, [isChainInProgress, cachedUsageData])

  // Auto-hide effect
  useEffect(() => {
    const timeout = isAutoShown ? AUTO_SHOW_TIMEOUT : MANUAL_SHOW_TIMEOUT
    const timer = setTimeout(() => {
      setInputMode('default')
      setIsAutoShown(false)
    }, timeout)
    return () => clearTimeout(timer)
  }, [isAutoShown, setInputMode])

  const activeData = apiData || cachedUsageData
  const isLoadingData = isLoading || isFetching

  // Show loading state immediately when banner is opened but data isn't ready
  if (!activeData) {
    return (
      <BannerWrapper
        color={theme.muted}
        text={generateLoadingBannerText(sessionCreditsUsed)}
        onClose={() => setInputMode('default')}
      />
    )
  }

  const colorLevel = getBannerColorLevel(activeData.remainingBalance)
  const color = theme[colorLevel]

  // Show loading indicator if refreshing data
  const text = isLoadingData
    ? generateLoadingBannerText(sessionCreditsUsed)
    : generateUsageBannerText({
        sessionCreditsUsed,
        remainingBalance: activeData.remainingBalance,
        next_quota_reset: activeData.next_quota_reset,
      })

  return (
    <BannerWrapper
      color={isLoadingData ? theme.muted : color}
      text={text}
      onClose={() => setInputMode('default')}
    />
  )
}
