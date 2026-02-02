'use client'

import {
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_DISPLAY_NAME,
  type SubscriptionTierPrice,
} from '@codebuff/common/constants/subscription-plans'
import { env } from '@codebuff/common/env'
import { loadStripe } from '@stripe/stripe-js'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useState } from 'react'

import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'

const USAGE_MULTIPLIER: Record<number, string> = {
  100: '1×',
  200: '3×',
  500: '8×',
}

function SubscribeButton({
  className,
  tier,
}: {
  className?: string
  tier?: number
}) {
  const { status } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleSubscribe = async () => {
    if (status !== 'authenticated') {
      router.push('/login?callbackUrl=/strong')
      return
    }

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

  return (
    <button
      onClick={handleSubscribe}
      disabled={isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 sm:px-10 sm:py-3.5 text-xs sm:text-base font-semibold transition-all duration-200',
        'bg-acid-green text-black hover:bg-acid-green/90 shadow-[0_0_30px_rgba(0,255,149,0.2)] hover:shadow-[0_0_50px_rgba(0,255,149,0.3)]',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        className,
      )}
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <>Subscribe</>
      )}
    </button>
  )
}

export default function StrongClient() {
  return (
    <div className="min-h-[calc(100vh-64px)] bg-black flex flex-col items-center justify-center relative overflow-hidden px-4 py-12">
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
      <div className="relative z-10 flex flex-col items-center text-center max-w-4xl">
        <div className="max-w-2xl">
          <motion.p
            className="font-mono text-xs sm:text-sm tracking-[0.3em] text-acid-green/50 uppercase mb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            codebuff
          </motion.p>

          <motion.h1
            className="text-4xl sm:text-5xl md:text-5xl font-bold text-white mb-3 tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7 }}
          >
            The strongest coding agent
          </motion.h1>

          <motion.p
            className="text-base sm:text-lg text-white/50 mb-12 font-light"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.9 }}
          >
            Deep thinking. Multi-agent orchestration. Ship faster.
          </motion.p>
        </div>

        {/* Pricing cards grid */}
        <motion.div
          className="grid grid-cols-3 gap-2 sm:gap-5 mb-10 w-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 1.1 }}
        >
          {Object.entries(SUBSCRIPTION_TIERS).map(([key, tier]) => {
            const price = Number(key) as SubscriptionTierPrice
            const isHighlighted = price === 200

            return (
              <div
                key={price}
                className={cn(
                  'rounded-xl p-3 sm:p-8 backdrop-blur-sm border flex flex-col items-center transition-all duration-300',
                  'hover:scale-[1.02]',
                  isHighlighted
                    ? 'border-acid-green/30 bg-acid-green/[0.04] shadow-[0_0_40px_rgba(0,255,149,0.08)] hover:shadow-[0_0_60px_rgba(0,255,149,0.15)]'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                )}
              >
                <div className="flex items-baseline justify-center gap-1 mb-1">
                  <span className="text-xl sm:text-5xl font-bold text-white tracking-tight">
                    ${tier.monthlyPrice}
                  </span>
                  <span className="text-xs sm:text-sm text-white/30">/mo</span>
                </div>

                <p className="text-xs sm:text-sm text-white/40 mb-3 sm:mb-6">
                  {USAGE_MULTIPLIER[price]} usage
                </p>

                <SubscribeButton
                  tier={price}
                  className={cn(
                    'w-full',
                    !isHighlighted &&
                      'bg-white/10 text-white hover:bg-white/20 shadow-none hover:shadow-none',
                  )}
                />
              </div>
            )
          })}
        </motion.div>

        <motion.p
          className="text-xs text-white/30 tracking-wide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.6 }}
        >
          Cancel anytime · Tax not included · Usage amounts subject to change
        </motion.p>
      </div>
    </div>
  )
}
