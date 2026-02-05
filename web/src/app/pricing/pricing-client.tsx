'use client'

import { DEFAULT_FREE_CREDITS_GRANT } from '@codebuff/common/old-constants'
import {
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_DISPLAY_NAME,
  type SubscriptionTierPrice,
} from '@codebuff/common/constants/subscription-plans'
import { env } from '@codebuff/common/env'
import { loadStripe } from '@stripe/stripe-js'
import { motion } from 'framer-motion'
import { Gift, Shield, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'

import { BlockColor } from '@/components/ui/decorative-blocks'
import { Section } from '@/components/ui/section'
import { SECTION_THEMES } from '@/components/ui/landing/constants'
import { FeatureSection } from '@/components/ui/landing/feature'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

import type { SubscriptionResponse } from '@codebuff/common/types/subscription'

const USAGE_MULTIPLIER: Record<number, string> = {
  100: '1×',
  200: '3×',
  500: '8×',
}

type ButtonAction = 'subscribe' | 'current' | 'upgrade' | 'downgrade'

function getButtonAction(tierPrice: number, currentTier: number | null): ButtonAction {
  if (currentTier === null) return 'subscribe'
  if (tierPrice === currentTier) return 'current'
  if (tierPrice > currentTier) return 'upgrade'
  return 'downgrade'
}

function getButtonLabel(action: ButtonAction): string {
  switch (action) {
    case 'current':
      return 'Current Plan'
    case 'upgrade':
      return 'Upgrade'
    case 'downgrade':
      return 'Downgrade'
    default:
      return 'Subscribe'
  }
}

function SubscribeButton({
  className,
  tier,
  currentTier,
  subscriptionId,
  isHighlighted,
}: {
  className?: string
  tier: number
  currentTier: number | null
  subscriptionId: string | null
  isHighlighted: boolean
}) {
  const { status } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const action = getButtonAction(tier, currentTier)
  const isCurrent = action === 'current'

  // Mutation to open billing portal for upgrades/downgrades
  const billingPortalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/user/billing-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to open billing portal')
      }
      return res.json()
    },
    onSuccess: (data: { url: string }) => {
      window.location.href = data.url
    },
    onError: (err: Error) => {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      })
    },
  })

  const handleClick = async () => {
    if (status !== 'authenticated') {
      router.push('/login?callbackUrl=/pricing')
      return
    }

    if (isCurrent) return

    // If user has a subscription, redirect to billing portal for confirmation
    if (currentTier !== null && subscriptionId) {
      billingPortalMutation.mutate()
      return
    }

    // Otherwise, create new subscription
    setIsLoading(true)
    try {
      const res = await fetch('/api/stripe/create-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to start checkout')
      }
      const { sessionId } = await res.json()
      const stripe = await loadStripe(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
      if (!stripe) throw new Error('Stripe failed to load')
      const { error } = await stripe.redirectToCheckout({ sessionId })
      if (error) throw new Error(error.message)
    } catch (err) {
      toast({
        title: 'Error',
        description:
          err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const isLoadingState = isLoading || billingPortalMutation.isPending

  return (
    <button
      onClick={handleClick}
      disabled={isLoadingState || isCurrent}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 sm:px-10 sm:py-3.5 text-xs sm:text-base font-semibold transition-all duration-200',
        isCurrent
          ? 'bg-white/10 text-white/60 border border-white/20 cursor-default'
          : isHighlighted
            ? 'bg-acid-green text-black hover:bg-acid-green/90 shadow-[0_0_30px_rgba(0,255,149,0.2)] hover:shadow-[0_0_50px_rgba(0,255,149,0.3)]'
            : 'bg-acid-green/10 text-acid-green border border-acid-green/30 hover:bg-acid-green/20 shadow-none hover:shadow-none',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        isCurrent && 'disabled:opacity-100',
        className,
      )}
    >
      {isLoadingState ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <>{getButtonLabel(action)}</>
      )}
    </button>
  )
}

function PricingCardsGrid() {
  const { status } = useSession()

  const { data: subscriptionData } = useQuery<SubscriptionResponse>({
    queryKey: ['subscription'],
    queryFn: async () => {
      const res = await fetch('/api/user/subscription')
      if (!res.ok) throw new Error('Failed to fetch subscription')
      return res.json()
    },
    enabled: status === 'authenticated',
    staleTime: 30_000,
  })

  const currentTier = subscriptionData?.hasSubscription
    ? subscriptionData.subscription.tier
    : null

  const subscriptionId = subscriptionData?.hasSubscription
    ? subscriptionData.subscription.id
    : null

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 1.1 }}
    >
      <div className="grid grid-cols-3 gap-3 sm:gap-6">
        {Object.entries(SUBSCRIPTION_TIERS).map(([key, tier]) => {
          const price = Number(key) as SubscriptionTierPrice
          const isCurrentPlan = currentTier === price
          const isHighlighted = currentTier === null ? price === 200 : isCurrentPlan

          return (
            <div
              key={price}
              className={cn(
                'relative rounded-xl p-3 sm:p-8 backdrop-blur-sm border flex flex-col items-center transition-all duration-300',
                'hover:scale-[1.02]',
                isCurrentPlan
                  ? 'border-acid-green/60 bg-acid-green/[0.08] shadow-[0_0_50px_rgba(0,255,149,0.18)] ring-1 ring-acid-green/30'
                  : isHighlighted
                    ? 'border-acid-green/40 bg-acid-green/[0.06] shadow-[0_0_40px_rgba(0,255,149,0.12)] hover:shadow-[0_0_60px_rgba(0,255,149,0.2)]'
                    : 'border-acid-green/15 bg-black/40 hover:border-acid-green/30 hover:bg-black/60',
              )}
            >
              {isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center rounded-full bg-acid-green px-2.5 py-0.5 text-xs font-semibold text-black">
                    Your Plan
                  </span>
                </div>
              )}
              <div className="flex items-baseline justify-center gap-1 mb-1">
                <span className="text-xl sm:text-5xl font-bold text-white tracking-tight">
                  ${tier.monthlyPrice}
                </span>
                <span className="text-xs sm:text-sm text-white/30">
                  /mo
                </span>
              </div>

              <p className="text-sm sm:text-base font-medium text-white/60 mb-3 sm:mb-6">
                {USAGE_MULTIPLIER[price]} usage
              </p>

              <SubscribeButton
                tier={price}
                currentTier={currentTier}
                subscriptionId={subscriptionId}
                isHighlighted={isHighlighted && !isCurrentPlan}
                className="w-full"
              />
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

function StrongHeroSection() {
  return (
    <Section
      background={SECTION_THEMES.hero.background}
      hero
      fullViewport
      className="overflow-hidden"
    >
      {/* Subtle radial glow behind content */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(0,255,149,0.06) 0%, transparent 70%)',
        }}
      />

      {/* Animated gradient blobs */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <motion.div
          className="absolute -inset-[200px] opacity-70"
          style={{
            background:
              'radial-gradient(circle at 30% 40%, rgba(0,255,149,0.1) 0%, transparent 50%)',
            filter: 'blur(40px)',
          }}
          animate={{
            x: [0, 100, -50, 0],
            y: [0, -80, 60, 0],
            scale: [1, 1.1, 0.95, 1],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -inset-[200px] opacity-70"
          style={{
            background:
              'radial-gradient(circle at 70% 60%, rgba(0,255,149,0.07) 0%, transparent 50%)',
            filter: 'blur(40px)',
          }}
          animate={{
            x: [0, -80, 60, 0],
            y: [0, 50, -70, 0],
            scale: [1, 0.95, 1.1, 1],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Giant background text */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center select-none pointer-events-none"
        aria-hidden="true"
        style={{
          fontSize: 'clamp(6rem, 22vw, 20rem)',
          fontWeight: 900,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          color: 'transparent',
          WebkitTextStroke: '1.5px rgba(0,255,149,0.11)',
          background:
            'linear-gradient(180deg, rgba(0,255,149,0.14) 0%, rgba(0,255,149,0.02) 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
        }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
      >
        {SUBSCRIPTION_DISPLAY_NAME.toUpperCase()}
      </motion.div>

      {/* Foreground content */}
      <div className="codebuff-container min-h-[calc(95dvh-64px)] flex flex-col items-center justify-center relative z-10 py-12">
        <div className="flex flex-col items-center text-center max-w-4xl w-full space-y-12">
          <motion.h1
            className="text-4xl sm:text-5xl md:text-5xl font-bold text-white tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7 }}
          >
            Access the strongest coding agent
          </motion.h1>

          <motion.p
            className="hero-subtext text-center mx-auto max-w-xl pb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9 }}
          >
            Subscribe for higher usage limits
          </motion.p>

          {/* Pricing cards grid with decorative blocks */}
          <PricingCardsGrid />

          <motion.p
            className="text-sm text-white/30 tracking-wide"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.6 }}
          >
            Cancel anytime · Applicable taxes not shown · Usage subject to change
          </motion.p>
        </div>
      </div>
    </Section>
  )
}

function CreditVisual() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-green-400 flex items-baseline">
          1¢
          <span className="text-xs sm:text-sm md:text-base text-white/70 ml-2">
            /credit
          </span>
        </div>
        <div className="w-24 h-[1px] bg-gradient-to-r from-transparent via-green-400/40 to-transparent"></div>

        {/* Grid with improved spacing for mobile and desktop */}
        <div className="grid grid-cols-2 gap-x-10 gap-y-6 sm:gap-x-16">
          <div className="flex flex-col items-center group">
            <div className="p-2 rounded-full bg-blue-500/10 mb-2">
              <Gift className="h-5 w-5 text-blue-400" />
            </div>
            <div className="text-lg font-bold text-blue-400">
              {DEFAULT_FREE_CREDITS_GRANT}
            </div>
            <div className="text-xs sm:text-sm text-white/70">Free monthly</div>
          </div>

          <div className="flex flex-col items-center group">
            <div className="p-2 rounded-full bg-purple-500/10 mb-2">
              <Shield className="h-5 w-5 text-purple-400" />
            </div>
            <div className="text-lg font-bold text-white">∞</div>
            <div className="text-xs sm:text-sm text-white/70">Never expire</div>
          </div>
        </div>
      </div>

      <div className="mt-8 text-sm text-white/90 max-w-sm border border-white/20 rounded-md p-3 bg-white/5">
        <span>
          {DEFAULT_FREE_CREDITS_GRANT} credits is typically enough for
        </span>{' '}
        <span>a few hours of coding on a new project</span>
      </div>
    </div>
  )
}

function PricingCard() {
  return (
    <div className="w-full h-full bg-black overflow-hidden flex flex-col">
      <div className="flex-1 p-6 sm:p-8 flex flex-col justify-center">
        <CreditVisual />
      </div>
    </div>
  )
}

function TeamPlanIllustration() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 w-full max-w-screen-lg mx-auto">
      {/* Team plan */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 sm:p-6 flex flex-col h-full shadow-lg">
        <div className="mb-4">
          <h3 className="text-xl font-bold text-gray-900 mb-1">Team</h3>
          <div className="flex items-baseline">
            <span className="text-2xl sm:text-3xl font-bold text-gray-900">
              $19
            </span>
            <span className="text-sm sm:text-base text-gray-500 ml-1">
              /user/month
            </span>
          </div>
        </div>

        <ul className="space-y-2 sm:space-y-3 mb-auto">
          <li className="flex text-gray-700">
            <span className="text-green-600 mr-2">✓</span>
            <span className="text-sm sm:text-base">
              Team management dashboard
            </span>
          </li>
          <li className="flex text-gray-700">
            <span className="text-green-600 mr-2">✓</span>
            <span className="text-sm sm:text-base">Pooled credit usage</span>
          </li>
          <li className="flex text-gray-700">
            <span className="text-green-600 mr-2">✓</span>
            <span className="text-sm sm:text-base">
              Pay-as-you-go at 1¢ per credit
            </span>
          </li>
        </ul>

        <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-gray-200">
          <a
            href="mailto:support@codebuff.com"
            className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm"
          >
            Reach out to support@codebuff.com
          </a>
        </div>
      </div>

      {/* Enterprise plan */}
      <div className="bg-gradient-to-b from-blue-50 to-white border border-blue-200 rounded-lg p-4 sm:p-6 flex flex-col h-full shadow-lg">
        <div className="mb-4">
          <h3 className="text-xl font-bold text-gray-900 mb-1">Enterprise</h3>
          <div className="text-sm sm:text-base text-gray-500">
            Custom Pricing
          </div>
        </div>

        <ul className="space-y-2 sm:space-y-3 mb-auto">
          <li className="flex text-gray-700">
            <span className="text-blue-600 mr-2">✓</span>
            <span className="text-sm sm:text-base">Everything in Team</span>
          </li>
          <li className="flex text-gray-700">
            <span className="text-blue-600 mr-2">✓</span>
            <span className="text-sm sm:text-base">Dedicated support</span>
          </li>
          <li className="flex text-gray-700">
            <span className="text-blue-600 mr-2">✓</span>
            <span className="text-sm sm:text-base">Custom integrations</span>
          </li>
        </ul>

        <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-blue-100">
          <a
            href="mailto:founders@codebuff.com"
            className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm"
          >
            Reach out to founders@codebuff.com
          </a>
        </div>
      </div>
    </div>
  )
}

export default function PricingClient() {
  const { status } = useSession()

  return (
    <>
      <StrongHeroSection />

      {/* Visual divider between hero and feature section */}
      <div className="h-px bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />

      <FeatureSection
        title={<span>Usage-Based Pricing</span>}
        description="Get 500 free credits monthly, then pay just 1¢ per credit. Credits are consumed based on task complexity — simple queries cost less, complex changes more. You'll see how many credits each task consumes."
        backdropColor={SECTION_THEMES.competition.background}
        decorativeColors={[BlockColor.GenerativeGreen, BlockColor.AcidMatrix]}
        textColor="text-white"
        tagline="PAY AS YOU GO"
        highlightText="500 free credits monthly"
        illustration={<PricingCard />}
        learnMoreText={status === 'authenticated' ? 'My Usage' : 'Get Started'}
        learnMoreLink={status === 'authenticated' ? '/usage' : '/login'}
      />
    </>
  )
}
