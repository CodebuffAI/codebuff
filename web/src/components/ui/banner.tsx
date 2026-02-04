'use client'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { CREDITS_REFERRAL_BONUS } from '@codebuff/common/old-constants'
import { capitalize } from '@codebuff/common/util/string'
import { X, Gift } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import posthog from 'posthog-js'
import { Suspense, useState } from 'react'

import { Button } from './button'

import { useUserProfile } from '@/hooks/use-user-profile'

function BannerContent() {
  const [isVisible, setIsVisible] = useState(true)
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const referrer = searchParams.get('referrer')
  const { data: session } = useSession()

  const { data: userProfile } = useUserProfile()

  if (!isVisible || !session?.user || !userProfile) return null

  // Check if account is less than a week old
  const isNewAccount = userProfile.created_at
    ? new Date().getTime() - new Date(userProfile.created_at).getTime() <
      7 * 24 * 60 * 60 * 1000
    : false

  // Only show banner for new accounts (less than a week old)
  if (!isNewAccount) return null

  const isPersonalReferral = !!referrer

  return (
    <div className="w-full bg-[#7CFF3F] text-black relative z-20">
      <div className="container mx-auto flex items-center justify-between px-4 py-0.5">
        <div className="w-8" />
        <div className="flex items-center gap-1.5 text-center flex-1 justify-center">
          <Gift className="hidden md:block h-3.5 w-3.5 flex-shrink-0" />
          <p className="text-sm md:whitespace-nowrap">
            {isPersonalReferral ? (
              <>
                {capitalize(referrer)} got you an extra {CREDITS_REFERRAL_BONUS}{' '}
                bonus credits!
              </>
            ) : (
              <>
                Refer a friend, and earn {CREDITS_REFERRAL_BONUS} bonus credits
                for both of you!
              </>
            )}{' '}
            <Link
              href={'/referrals'}
              className="underline hover:text-black/80"
              onClick={() => {
                posthog.capture(AnalyticsEvent.REFERRAL_BANNER_CLICKED, {
                  type: isPersonalReferral ? 'personal_referral' : 'general',
                  source: referrer || undefined,
                })
              }}
            >
              Learn more
            </Link>
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-black hover:bg-transparent"
          onClick={() => setIsVisible(false)}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close banner</span>
        </Button>
      </div>
    </div>
  )
}

export function Banner() {
  return (
    <Suspense>
      <BannerContent />
    </Suspense>
  )
}
