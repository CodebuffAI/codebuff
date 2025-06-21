'use client'

import { Button } from './button'
import { X, Gift } from 'lucide-react'
import { Suspense, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { CREDITS_REFERRAL_BONUS } from '@codebuff/common/constants'
import { useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { capitalize } from '@codebuff/common/util/string'

function BannerContent() {
  const [isVisible, setIsVisible] = useState(true)
  const searchParams = useSearchParams()
  const referrer = searchParams.get('referrer')
  const { data: session } = useSession()

  if (!isVisible || !session?.user) return null

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
                credits per month!
              </>
            ) : (
              <>
                Refer a friend, and earn {CREDITS_REFERRAL_BONUS} credits per
                month for both of you!
              </>
            )}{' '}
            <Link
              href={'/referrals'}
              className="underline hover:text-black/80"
              onClick={() => {
                posthog.capture('referral_banner.clicked', {
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
