import React from 'react'

import { BannerWrapper } from './banner-wrapper'
import { useTheme } from '../hooks/use-theme'
import { useChatStore } from '../state/chat-store'
import { WEBSITE_URL } from '@codebuff/sdk'

export const ReferralBanner = () => {
  const theme = useTheme()
  const setInputMode = useChatStore((state) => state.setInputMode)

  const referralUrl = `${WEBSITE_URL}/referrals`

  return (
    <BannerWrapper
      color={theme.warning}
      text={`Refer your friends: ${referralUrl}`}
      onClose={() => setInputMode('default')}
    />
  )
}
