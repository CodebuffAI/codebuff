import React, { useEffect, useMemo } from 'react'

import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { useUsageQuery } from '../hooks/use-usage-query'
import { useChatStore } from '../state/chat-store'
import { BORDER_CHARS } from '../utils/ui-constants'

export const UsageBanner = () => {
  const { terminalWidth } = useTerminalDimensions()
  const theme = useTheme()
  const isUsageVisible = useChatStore((state) => state.isUsageVisible)
  const usageData = useChatStore((state) => state.usageData)
  const setIsUsageVisible = useChatStore((state) => state.setIsUsageVisible)

  // Fetch usage data when banner is visible
  useUsageQuery({ enabled: isUsageVisible })

  // Auto-hide banner after 60 seconds
  useEffect(() => {
    if (isUsageVisible) {
      const timer = setTimeout(() => {
        setIsUsageVisible(false)
      }, 60000)
      return () => clearTimeout(timer)
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

  if (!isUsageVisible || !usageData) return null

  return (
    <box
      key={terminalWidth}
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.warning,
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
          fg: theme.warning,
          wrapMode: 'word',
          flexShrink: 1,
          marginRight: 3,
        }}
      >
        {text}
      </text>
      <Button onClick={() => setIsUsageVisible(false)}>
        <text style={{ fg: theme.error }}>x</text>
      </Button>
    </box>
  )
}
