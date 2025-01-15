'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'

interface ClientAnalyticsProps {
  isFirstTime: boolean
  hasNewCredits: boolean
  referralCode?: string
}

export default function ClientAnalytics({ isFirstTime, hasNewCredits, referralCode }: ClientAnalyticsProps) {
  useEffect(() => {
    // Track onboarding event with proper context
    posthog.capture(isFirstTime ? 'onboard.first_time' : 'onboard.returning', {
      has_new_credits: hasNewCredits,
      referral_code: referralCode || undefined
    })
  }, [isFirstTime, hasNewCredits, referralCode])

  return null
}
