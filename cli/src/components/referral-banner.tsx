import { WEBSITE_URL } from '@codebuff/sdk'
import React from 'react'

import { BottomBanner } from './bottom-banner'
import { useChatStore } from '../state/chat-store'

export const ReferralBanner = () => {
  const setInputMode = useChatStore((state) => state.setInputMode)

  const referralUrl = `${WEBSITE_URL}/referrals`

  return (
    <BottomBanner
      borderColorKey="warning"
      text={`Refer your friends: ${referralUrl}`}
      onClose={() => setInputMode('default')}
    />
  )
}
