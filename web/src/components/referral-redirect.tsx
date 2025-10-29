'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function ReferralRedirect() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    // Only check after session is loaded
    if (status === 'loading') return

    // Only redirect authenticated users
    if (status === 'authenticated' && session?.user) {
      const storedReferralCode = localStorage.getItem('referral_code')
      if (storedReferralCode) {
        console.log(
          '🟠 ReferralRedirect: Found stored referral code, redirecting:',
          storedReferralCode,
        )
        // Clear the stored code and redirect
        localStorage.removeItem('referral_code')
        router.push(`/onboard?referral_code=${storedReferralCode}`)
      }
    }
  }, [session, status, router])

  return null // This component renders nothing
}
