import { useQuery, useQueryClient } from '@tanstack/react-query'
import React, { useEffect, useState } from 'react'

import { usageQueryKeys, useUsageQuery } from '../hooks/use-usage-query'
import { useChatStore } from '../state/chat-store'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'
import { ShimmerText } from './shimmer-text'

const CREDIT_POLL_INTERVAL = 5 * 1000 // Poll every 5 seconds

// Track credits restored state globally so keyboard handler can access it
let creditsRestoredGlobal = false

export const areCreditsRestored = () => creditsRestoredGlobal

export const OutOfCreditsBanner = () => {
  const sessionCreditsUsed = useChatStore((state) => state.sessionCreditsUsed)
  const queryClient = useQueryClient()
  const [creditsRestored, setCreditsRestored] = useState(false)

  const { data: apiData } = useUsageQuery({
    enabled: true,
  })

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

  const theme = useTheme()
  const activeData = apiData || cachedUsageData
  const remainingBalance = activeData?.remainingBalance ?? 0

  // Poll for credit updates
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: usageQueryKeys.current() })
    }, CREDIT_POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [queryClient])

  // Track if we've confirmed the zero-balance state to avoid false positives from stale cache
  const [confirmedZeroBalance, setConfirmedZeroBalance] = useState(false)

  // Reset global flag when component mounts (handles re-entry to out-of-credits mode)
  useEffect(() => {
    creditsRestoredGlobal = false
  }, [])

  // Confirm zero balance on first fetch to avoid race condition with cached data
  useEffect(() => {
    if (apiData && !confirmedZeroBalance) {
      if ((apiData.remainingBalance ?? 0) <= 0) {
        setConfirmedZeroBalance(true)
      }
    }
  }, [apiData, confirmedZeroBalance])

  // Check if credits have been restored - show celebratory message
  useEffect(() => {
    // Only check for restoration after we've confirmed zero balance
    if (!confirmedZeroBalance || remainingBalance <= 0 || creditsRestored) {
      return
    }
    
    // Credits restored! Show the success state
    setCreditsRestored(true)
    creditsRestoredGlobal = true
  }, [remainingBalance, creditsRestored, confirmedZeroBalance])

  // Build stats text
  const statsText = activeData
    ? `Session: ${sessionCreditsUsed.toLocaleString()} credits used · Balance: ${remainingBalance.toLocaleString()} credits`
    : `Session: ${sessionCreditsUsed.toLocaleString()} credits used`

  // Show celebratory success state when credits are restored
  if (creditsRestored) {
    return (
      <box
        style={{
          width: '100%',
          borderStyle: 'single',
          borderColor: theme.success,
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
          <text style={{ fg: theme.success }}>
            <ShimmerText 
              text="✨ Credits acquired! ✨" 
              primaryColor={theme.success}
              interval={120}
            />
          </text>
          <text style={{ fg: theme.muted }}>
            Balance: {remainingBalance.toLocaleString()} credits
          </text>
          <text style={{ fg: theme.foreground }}>
            Press Enter to continue
          </text>
        </box>
      </box>
    )
  }

  return (
    <box
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.warning,
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
        <text style={{ fg: theme.warning }}>
          Out of credits
        </text>
        <text style={{ fg: theme.muted }}>
          {statsText}
        </text>
        <text style={{ fg: theme.foreground }}>
          Press Enter to buy more credits
        </text>
      </box>
    </box>
  )
}
