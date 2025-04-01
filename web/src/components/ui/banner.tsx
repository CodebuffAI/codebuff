'use client'

import { Button } from './button'
import { X, Gift, Sparkles } from 'lucide-react'
import { Suspense, useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { CREDITS_REFERRAL_BONUS } from 'common/constants'
import { useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { sponseeConfig } from '@/lib/constant'

function BannerContent() {
  const [isVisible, setIsVisible] = useState(true)
  const searchParams = useSearchParams()
  const utmSource = searchParams.get('utm_source')
  const referrer = searchParams.get('referrer')
  const { data: session } = useSession()

  if (!isVisible || !session?.user) return null

  const isYouTubeReferral =
    utmSource === 'youtube' && referrer && referrer in sponseeConfig

  return (
    <div className="w-full bg-[#7CFF3F] text-black relative z-20">
      <div className="container mx-auto flex items-center justify-between px-4 py-0.5">
        <div className="w-8" />
        <div className="flex items-center gap-1.5 text-center flex-1 justify-center">
          <Gift className="hidden md:block h-3.5 w-3.5 flex-shrink-0" />
          <p className="text-sm md:whitespace-nowrap">
            {isYouTubeReferral ? (
              <>
                {sponseeConfig[referrer as keyof typeof sponseeConfig].name} got
                you an extra {CREDITS_REFERRAL_BONUS} credits per month!
              </>
            ) : (
              <>
                Refer a friend, and earn {CREDITS_REFERRAL_BONUS} credits per
                month for both of you!
              </>
            )}{' '}
            <Link
              href={
                isYouTubeReferral
                  ? `/referrals/${sponseeConfig[referrer as keyof typeof sponseeConfig].referralCode}`
                  : '/referrals'
              }
              className="underline hover:text-black/80"
              onClick={() => {
                posthog.capture('referral_banner.clicked', {
                  type: isYouTubeReferral ? 'youtube' : 'general',
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

function AprilFoolsBannerContent() {
  const [isVisible, setIsVisible] = useState(true)
  const [isAprilFools, setIsAprilFools] = useState(false)

  useEffect(() => {
    // Always show the banner for our April Fool's makeover
    setIsAprilFools(true)

    // Uncomment this to actually check the date in production
    // const today = new Date()
    // const isApril1st = today.getMonth() === 3 && today.getDate() === 1
    // setIsAprilFools(isApril1st)
  }, [])

  if (!isVisible || !isAprilFools) return null

  return (
    <div className="w-full bg-[#F6FF4A] text-black relative z-20 animate-pulse">
      <div className="container mx-auto flex items-center justify-between px-4 py-2">
        <div className="w-8" />
        <div className="flex items-center gap-2 text-center flex-1 justify-center">
          <Sparkles className="hidden md:block h-5 w-5 flex-shrink-0" />
          <p className="text-sm font-medium md:whitespace-nowrap">
            ClaudeCodeBuff's unicorns worked overtime to bring you this magical
            website experience! 🪄
          </p>
          <Sparkles className="hidden md:block h-5 w-5 flex-shrink-0" />
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
      <AprilFoolsBannerContent />
      {/* <BannerContent /> */}
    </Suspense>
  )
}
