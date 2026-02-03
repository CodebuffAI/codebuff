'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { OnboardingFlow } from './onboarding-flow'

interface OnboardClientWrapperProps {
  hasReferralCode: boolean
  referralCode?: string
  referrerName?: string
  children: React.ReactNode
}

export function OnboardClientWrapper({
  hasReferralCode,
  referralCode,
  referrerName,
  children,
}: OnboardClientWrapperProps) {
  const [hasStoredReferral, setHasStoredReferral] = useState(false)
  const [storedReferralCode, setStoredReferralCode] = useState<string | null>(
    null,
  )

  useEffect(() => {
    // Always check localStorage for any stored referral codes from previous visits
    const storedCode = localStorage.getItem('referral_code')
    if (storedCode) {
      setHasStoredReferral(true)
      setStoredReferralCode(storedCode)
      // Clean up localStorage after checking
      localStorage.removeItem('referral_code')
    }

    // Also check URL parameters if no referralCode prop was passed
    if (!referralCode && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const urlReferralCode = urlParams.get('referral_code')
      if (urlReferralCode && !storedCode) {
        setStoredReferralCode(urlReferralCode)
        setHasStoredReferral(true)
      }
    }
  }, [referralCode])

  const router = useRouter()

  const handleOnboardingComplete = () => {
    // Clear persisted progress from localStorage
    localStorage.removeItem('codebuff_onboarding_progress')
    // Navigate to onboard page
    router.replace('/onboard')
  }

  // Always show onboarding flow if user has a referral code (from URL or localStorage)
  const shouldShowOnboarding = hasReferralCode || hasStoredReferral
  const actualReferralCode = referralCode || storedReferralCode

  if (shouldShowOnboarding) {
    return (
      <div className="space-y-8">
        <OnboardingFlow
          referralCode={actualReferralCode || undefined}
          referrerName={referrerName}
        />
      </div>
    )
  }

  return <>{children}</>
}
