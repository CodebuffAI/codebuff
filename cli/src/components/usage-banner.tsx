import React, { useEffect, useMemo } from 'react'

import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { useUsageQuery } from '../hooks/use-usage-query'
import { useChatStore } from '../state/chat-store'
import { BORDER_CHARS } from '../utils/ui-constants'

// Credit level thresholds for banner color
const HIGH_CREDITS_THRESHOLD = 1000
const MEDIUM_CREDITS_THRESHOLD = 100

export const UsageBanner = () => {
  const { terminalWidth } = useTerminalDimensions()
  const theme = useTheme()
  const isUsageVisible = useChatStore((state) => state.isUsageVisible)
  const sessionCreditsUsed = useChatStore((state) => state.sessionCreditsUsed)
  const setIsUsageVisible = useChatStore((state) => state.setIsUsageVisible)
  const [isCloseHovered, setIsCloseHovered] = React.useState(false)

  // Fetch usage data when banner is visible
  const { data: apiData } = useUsageQuery({ enabled: isUsageVisible })

  // Transform API data to usage data format
  const usageData = apiData
    ? {
        sessionUsage: sessionCreditsUsed,
        remainingBalance: apiData.remainingBalance,
        nextQuotaReset: apiData.next_quota_reset,
      }
    : null

  // Auto-hide banner after 60 seconds
  useEffect(() => {
    if (isUsageVisible) {
      const timer = setTimeout(() => {
        setIsUsageVisible(false)
      }, 60000)
      return () => clearTimeout(timer)
    } else {
      // Reset hover state when banner closes
      setIsCloseHovered(false)
    }
    return undefined
  }, [isUsageVisible, setIsUsageVisible])

  // Memoize the banner text computation
  const text = useMemo(() => {
    if (!usageData) return ''

    let result = `Session usage: ${usageData.sessionUsage.toLocaleString()}`

    if (usageData.remainingBalance !== null) {
      result += `. Credits remaining: ${usageData.remainingBalance.toLocaleString()}`
    }

    if (usageData.nextQuotaReset) {
      const resetDate = new Date(usageData.nextQuotaReset)
      const today = new Date()
      const isToday = resetDate.toDateString() === today.toDateString()

      // Format date without slashes to prevent mid-date line breaks
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

      result += `. Free credits renew ${dateDisplay}`
    }

    return result
  }, [usageData])

  const bannerColor = useMemo(() => {
    // Default color
    if (!usageData || usageData.remainingBalance === null) {
      return theme.warning
    }

    const balance = usageData.remainingBalance

    if (balance >= HIGH_CREDITS_THRESHOLD) {
      return theme.success
    }

    if (balance >= MEDIUM_CREDITS_THRESHOLD) {
      return theme.warning
    }

    return theme.error
  }, [usageData, theme])

  if (!isUsageVisible || !usageData) return null

  return (
    <box
      key={terminalWidth}
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: bannerColor,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingLeft: 1,
        paddingRight: 1,
        marginTop: 0,
        marginBottom: 0,
      }}
      border={['bottom', 'left', 'right']}
      customBorderChars={BORDER_CHARS}
    >
      <text
        style={{
          fg: bannerColor,
          wrapMode: 'word',
          flexShrink: 1,
          marginRight: 3,
        }}
      >
        {text}
      </text>
      <Button
        onClick={() => setIsUsageVisible(false)}
        onMouseOver={() => setIsCloseHovered(true)}
        onMouseOut={() => setIsCloseHovered(false)}
      >
        <text style={{ fg: isCloseHovered ? theme.error : theme.muted }}>x</text>
      </Button>
    </box>
  )
}
