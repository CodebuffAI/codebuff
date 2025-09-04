'use client'

import { useEffect, useState } from 'react'

import { OnboardingFlow } from './onboarding-flow'

interface OnboardClientWrapperProps {
  hasReferralCode: boolean
  children: React.ReactNode
}

export function OnboardClientWrapper({ hasReferralCode, children }: OnboardClientWrapperProps) {
  const [hasStoredReferral, setHasStoredReferral] = useState(false)
  const [onboardingComplete, setOnboardingComplete] = useState(false)

  console.log('🟡 OnboardClientWrapper: Component rendered', {
    hasReferralCode,
    hasStoredReferral,
    onboardingComplete
  })

  useEffect(() => {
    // Always check localStorage for any stored referral codes from previous visits
    const storedReferralCode = localStorage.getItem('referral_code')
    console.log('🟡 OnboardClientWrapper: Checking localStorage', {
      storedReferralCode
    })
    if (storedReferralCode) {
      setHasStoredReferral(true)
      // Clean up localStorage after checking
      localStorage.removeItem('referral_code')
      console.log('🟡 OnboardClientWrapper: Found and removed stored referral code:', storedReferralCode)
    }
  }, [])

  const handleOnboardingComplete = () => {
    setOnboardingComplete(true)
    // Optional: Clear persisted progress from localStorage
    localStorage.removeItem('codebuff_onboarding_progress')
  }

  // Always show onboarding flow if user has a referral code (from URL or localStorage)
  const shouldShowOnboarding = hasReferralCode || hasStoredReferral

  if (shouldShowOnboarding) {
    return (
      <div className="space-y-8">
        {!onboardingComplete ? (
          <OnboardingFlow 
            hasReferralCode={shouldShowOnboarding} 
            onComplete={handleOnboardingComplete}
          />
        ) : (
          children
        )}
      </div>
    )
  }

  return <>{children}</>
}
