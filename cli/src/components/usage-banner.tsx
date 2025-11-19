import React, { useEffect } from 'react'

import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { useChatStore } from '../state/chat-store'
import { BORDER_CHARS } from '../utils/ui-constants'

export const UsageBanner = () => {
  const { terminalWidth } = useTerminalDimensions()
  const theme = useTheme()
  const isUsageVisible = useChatStore((state) => state.isUsageVisible)
  const usageData = useChatStore((state) => state.usageData)
  const setIsUsageVisible = useChatStore((state) => state.setIsUsageVisible)

  useEffect(() => {
    if (isUsageVisible) {
      const timer = setTimeout(() => {
        setIsUsageVisible(false)
      }, 60000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isUsageVisible, setIsUsageVisible])

  if (!isUsageVisible || !usageData) return null

  let text = `Session usage: ${usageData.sessionUsage.toLocaleString()}`
  
  if (usageData.remainingBalance !== null) {
    text += `. Credits remaining: ${usageData.remainingBalance.toLocaleString()}`
  }

  if (usageData.nextQuotaReset) {
    const resetDate = new Date(usageData.nextQuotaReset)
    const today = new Date()
    const isToday = resetDate.toDateString() === today.toDateString()

    const dateDisplay = isToday
      ? resetDate.toLocaleString()
      : resetDate.toLocaleDateString()

    text += `. Free credits renew ${dateDisplay}`
  }

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
