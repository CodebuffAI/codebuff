import { UserState, getUserState } from '@codebuff/common/old-constants'
import { useQuery } from '@tanstack/react-query'
import React, { useEffect, useRef, useState } from 'react'

import { BannerWrapper } from './banner-wrapper'
import { useTheme } from '../hooks/use-theme'
import { usageQueryKeys, useUsageQuery } from '../hooks/use-usage-query'
import { useChatStore } from '../state/chat-store'
import { getAuthToken } from '../utils/auth'

const HIGH_CREDITS_THRESHOLD = 1000
const MEDIUM_CREDITS_THRESHOLD = 100

const MANUAL_SHOW_TIMEOUT = 60 * 1000 // 1 minute
const AUTO_SHOW_TIMEOUT = 5 * 60 * 1000 // 5 minutes

export const UsageBanner = () => {
  const theme = useTheme()
  const sessionCreditsUsed = useChatStore((state) => state.sessionCreditsUsed)
  const isChainInProgress = useChatStore((state) => state.isChainInProgress)
  const setInputMode = useChatStore((state) => state.setInputMode)

  const [isAutoShown, setIsAutoShown] = useState(false)
  const lastWarnedStateRef = useRef<UserState | null>(null)

  const { data: apiData } = useUsageQuery({ enabled: true })

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
    if (isChainInProgress) return
    const authToken = getAuthToken()
    if (!authToken) return
    if (!cachedUsageData || cachedUsageData.remainingBalance === null) return

    const credits = cachedUsageData.remainingBalance
    const userState = getUserState(true, credits)

    if (userState === UserState.GOOD_STANDING) {
      lastWarnedStateRef.current = null
      return
    }

    if (
      lastWarnedStateRef.current !== userState &&
      (userState === UserState.ATTENTION_NEEDED ||
        userState === UserState.CRITICAL ||
        userState === UserState.DEPLETED)
    ) {
      lastWarnedStateRef.current = userState
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
  if (!activeData) return null

  const balance = activeData.remainingBalance
  let color = theme.warning

  if (balance === null) {
    color = theme.warning
  } else if (balance >= HIGH_CREDITS_THRESHOLD) {
    color = theme.success
  } else if (balance >= MEDIUM_CREDITS_THRESHOLD) {
    color = theme.warning
  } else {
    color = theme.error
  }

  let text = `Session usage: ${sessionCreditsUsed.toLocaleString()}`

  if (activeData.remainingBalance !== null) {
    text += `. Credits remaining: ${activeData.remainingBalance.toLocaleString()}`
  }

  if (activeData.next_quota_reset) {
    const resetDate = new Date(activeData.next_quota_reset)
    const today = new Date()
    const isToday = resetDate.toDateString() === today.toDateString()

    const dateDisplay = isToday
      ? resetDate.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : resetDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })

    text += `. Free credits renew ${dateDisplay}`
  }

  return (
    <BannerWrapper
      color={color}
      text={text}
      onClose={() => setInputMode('default')}
    />
  )
}
