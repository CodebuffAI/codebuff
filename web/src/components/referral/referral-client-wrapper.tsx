'use client'

import { useEffect } from 'react'

interface ReferralClientWrapperProps {
  referralCode: string
  children: React.ReactNode
}

export function ReferralClientWrapper({ referralCode, children }: ReferralClientWrapperProps) {
  useEffect(() => {
    // Store referral code in localStorage for use during onboarding
    if (referralCode && typeof window !== 'undefined') {
      localStorage.setItem('referral_code', referralCode)
    }
  }, [referralCode])

  return <>{children}</>
}
