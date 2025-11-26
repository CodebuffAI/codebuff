import { useEffect, useRef } from 'react'

import { getAuthToken } from '../utils/auth'
import { useChatStore } from '../state/chat-store'
import { useUsageQuery } from './use-usage-query'
import { shouldAutoShowBanner } from '../utils/usage-banner-state'

/**
 * Hook that monitors usage data and auto-shows the usage banner
 * when credit thresholds are crossed.
 * 
 * This should be placed in a component that's always mounted (like Chat)
 * so monitoring happens continuously, not just when the banner is visible.
 */
export function useUsageMonitor() {
  const isChainInProgress = useChatStore((state) => state.isChainInProgress)
  const sessionCreditsUsed = useChatStore((state) => state.sessionCreditsUsed)
  const setInputMode = useChatStore((state) => state.setInputMode)
  const lastWarnedThresholdRef = useRef<number | null>(null)

  // Query usage data - this will refetch when invalidated after message completion
  const { data: usageData } = useUsageQuery({ enabled: true })

  useEffect(() => {
    // Only show after user has sent at least one message (to avoid overwhelming on app start)
    if (sessionCreditsUsed === 0) {
      return
    }

    const authToken = getAuthToken()
    const remainingBalance = usageData?.remainingBalance ?? null

    const decision = shouldAutoShowBanner(
      isChainInProgress,
      !!authToken,
      remainingBalance,
      lastWarnedThresholdRef.current,
    )

    // Update the last warned threshold
    if (decision.newWarningThreshold !== lastWarnedThresholdRef.current) {
      lastWarnedThresholdRef.current = decision.newWarningThreshold
    }

    // Show the usage banner if we should
    if (decision.shouldShow) {
      setInputMode('usage')
    }
  }, [isChainInProgress, usageData, sessionCreditsUsed, setInputMode])
}
