import React from 'react'

import { BannerWrapper } from './banner-wrapper'
import { useTheme } from '../hooks/use-theme'
import { useUserDetailsQuery } from '../hooks/use-user-details-query'
import { useChatStore } from '../state/chat-store'

export const ReferralBanner = () => {
  const theme = useTheme()
  const setInputMode = useChatStore((state) => state.setInputMode)

  const { data: userDetails, isLoading, isError, error } = useUserDetailsQuery({
    fields: ['referral_link'] as const,
    enabled: true,
  })

  const referralLink = userDetails?.referral_link ?? null
  const isAuthError = error?.message?.includes('401')

  let text = ''
  if (isLoading) text = 'Loading your referral link...'
  else if (isAuthError) text = 'Session expired. Please log in again to view your referral link.'
  else if (isError) text = 'Failed to load your referral link. Please try again later.'
  else if (!referralLink) text = 'Your referral link is not available yet'
  else text = `Share this link with friends:\n${referralLink}`

  return (
    <BannerWrapper
      color={theme.warning}
      text={text}
      onClose={() => setInputMode('default')}
    />
  )
}
