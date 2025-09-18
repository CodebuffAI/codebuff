'use client'

import { useEffect } from 'react'
import Link from 'next/link'

import CardWithBeams from '@/components/card-with-beams'
import { Button } from '@/components/ui/button'
import { GitHubSignInButton } from '@/components/referral/github-signin-button'

import type { ReferralCodeResponse } from '../../api/referrals/[code]/route'

interface ReferralClientProps {
  code: string
  session: any
  referralData: ReferralCodeResponse
  referrerDisplayName: string
  referrerName?: string
}

export default function ReferralClient({
  code,
  session,
  referralData,
  referrerDisplayName,
  referrerName,
}: ReferralClientProps) {
  // Always store referral code in localStorage when landing on referral page
  // This overwrites any previously stored referral code
  useEffect(() => {
    if (typeof window !== 'undefined' && code) {
      localStorage.setItem('referral_code', code)
    }
  }, [code])

  return (
    <CardWithBeams
      title={`${referrerDisplayName} invited you to Codebuff!`}
      description="You're eligible for bonus credits when you complete the referral."
      content={
        <>
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">
              Welcome! Complete your referral to get bonus credits.
            </p>

            <div className="flex justify-center">
              {!session && (
                <GitHubSignInButton
                  referralCode={code}
                  referrerName={referrerName}
                />
              )}
            </div>

            {/* Complete Referral button for logged-in users */}
            {session && !referralData.isSameUser && (
              <div className="flex justify-end mt-6">
                <Button asChild>
                  <Link href={`/onboard?referral_code=${code}`}>
                    Complete Referral
                  </Link>
                </Button>
              </div>
            )}

            {/* Warning for user's own referral link */}
            {session && referralData.isSameUser && (
              <div className="mt-6 p-3 bg-red-800 border border-red-900 rounded-md">
                <p className="text-white text-sm font-medium">
                  ⚠️ This is your own referral link. You will not be able to
                  redeem your own code.
                </p>
              </div>
            )}
          </div>
        </>
      }
    />
  )
}