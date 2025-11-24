import React, { useMemo } from 'react'

import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { useUserDetailsQuery } from '../hooks/use-user-details-query'
import { useChatStore } from '../state/chat-store'
import { BORDER_CHARS } from '../utils/ui-constants'

export const ReferralBanner = () => {
  const { terminalWidth } = useTerminalDimensions()
  const theme = useTheme()
  const inputMode = useChatStore((state) => state.inputMode)
  const setInputMode = useChatStore((state) => state.setInputMode)
  const isReferralMode = inputMode === 'referral'
  const [isCloseHovered, setIsCloseHovered] = React.useState(false)

  // Fetch referral link when in referral mode
  const { data: userDetails, isLoading } = useUserDetailsQuery({
    fields: ['referral_link'] as const,
    enabled: isReferralMode,
  })
  const referralLink = userDetails?.referral_link ?? null

  // Memoize the banner text
  const text = useMemo(() => {
    if (isLoading) return 'Loading your referral link...'

    if (!referralLink) {
      return 'Your referral link is not available yet'
    }

    return `Share this link with friends:\n${referralLink}`
  }, [referralLink, isLoading])

  if (!isReferralMode) return null

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
      <Button
        onClick={() => setInputMode('default')}
        onMouseOver={() => setIsCloseHovered(true)}
        onMouseOut={() => setIsCloseHovered(false)}
      >
        <text style={{ fg: isCloseHovered ? theme.error : theme.muted }}>x</text>
      </Button>
    </box>
  )
}
