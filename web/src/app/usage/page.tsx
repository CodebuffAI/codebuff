'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { UsageDisplay, UsageDisplaySkeleton } from './usage-display'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { env } from '@/env.mjs'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/use-toast'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Info, ChevronDown, ChevronUp, Loader2 as Loader } from 'lucide-react'
import { UserProfile } from '@/types/user'
import { useSession } from 'next-auth/react'
import {
  convertCreditsToUsdCents,
  convertStripeGrantAmountToCredits,
} from 'common/util/currency'
import { NeonGradientButton } from '@/components/ui/neon-gradient-button'
import { cn, clamp } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import debounce from 'lodash/debounce'
import { loadStripe } from '@stripe/stripe-js'

import { AutoTopupSettings } from '@/components/auto-topup/AutoTopupSettings'
import { CreditPurchaseSection } from '@/components/credits/CreditPurchaseSection'
import { CreditConfetti } from '@/components/ui/credit-confetti'

type UserProfileKeys =
  | 'handle'
  | 'referral_code'
  | 'auto_topup_enabled'
  | 'auto_topup_threshold'
  | 'auto_topup_amount'
  | 'auto_topup_blocked_reason'

const MIN_THRESHOLD_CREDITS = 100
const MAX_THRESHOLD_CREDITS = 10000
const MIN_TOPUP_DOLLARS = 5.0
const MAX_TOPUP_DOLLARS = 100.0
const CENTS_PER_CREDIT = 1

const UsagePageSkeleton = () => (
  <div className="space-y-8 container mx-auto py-6 px-4 sm:py-10 sm:px-6">
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <Skeleton className="h-8 w-1/2" />
      </CardHeader>
      <CardContent className="space-y-6">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full rounded-full" />
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-18" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  </div>
)

const SignInCard = () => (
  <Card className="w-full max-w-md mx-auto mt-10">
    <CardHeader>
      <CardTitle>Sign in to view usage</CardTitle>
    </CardHeader>
    <CardContent>
      <p>Please sign in to view your usage statistics and manage settings.</p>
    </CardContent>
    <SignInCardFooter />
  </Card>
)

const BuyCreditsSkeleton = () => (
  <Card className="w-full max-w-2xl mx-auto mb-8">
    <CardContent className="space-y-6 pt-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-4 w-1/5" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-10 w-1/3" />
      </div>
    </CardContent>
  </Card>
)

const ManageCreditsCard = () => {
  const { data: session } = useSession()
  const email = encodeURIComponent(session?.user?.email || '')
  const queryClient = useQueryClient()
  const [showConfetti, setShowConfetti] = useState(false)
  const [purchasedAmount, setPurchasedAmount] = useState(0)

  const buyCreditsMutation = useMutation({
    mutationFn: async (credits: number) => {
      setPurchasedAmount(credits)
      const response = await fetch('/api/stripe/buy-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits }),
      })
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Failed to initiate purchase' }))
        throw new Error(errorData.error || 'Failed to initiate purchase')
      }
      return response.json()
    },
    onSuccess: async (data) => {
      if (data.sessionId) {
        const stripePromise = loadStripe(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
        const stripe = await stripePromise
        if (!stripe) {
          toast({
            title: 'Error',
            description: 'Stripe.js failed to load.',
            variant: 'destructive',
          })
          return
        }
        const { error } = await stripe.redirectToCheckout({
          sessionId: data.sessionId,
        })
        if (error) {
          console.error('Stripe redirect error:', error)
          toast({
            title: 'Error',
            description: error.message || 'Failed to redirect to Stripe.',
            variant: 'destructive',
          })
        }
      } else {
        setShowConfetti(true)
        queryClient.invalidateQueries({ queryKey: ['usageData'] })
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Purchase Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  return (
    <Card className="w-full max-w-2xl mx-auto mb-8">
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-8">
          {showConfetti && <CreditConfetti amount={purchasedAmount} />}
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold">Buy Credits</h3>
            <Link
              href={`${env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL}?prefilled_email=${email}`}
              target="_blank"
              className="text-sm text-primary underline underline-offset-4 hover:text-primary/90"
            >
              Billing Portal →
            </Link>
          </div>
          <CreditPurchaseSection
            onPurchase={(credits) => buyCreditsMutation.mutate(credits)}
            onSaveAutoTopupSettings={async () => true}
            isAutoTopupEnabled={false}
            isAutoTopupPending={false}
            isPending={false}
            isPurchasePending={buyCreditsMutation.isPending}
          />
          <div className="border-t border-border" />
          <AutoTopupSettings />
        </div>
      </CardContent>
    </Card>
  )
}

const UsagePage = () => {
  const { data: session, status } = useSession()

  const {
    data: usageData,
    isLoading: isLoadingUsage,
    isError: isUsageError,
  } = useQuery({
    queryKey: ['usageData', session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) throw new Error('User not logged in')
      const response = await fetch('/api/user/usage')
      if (!response.ok) throw new Error('Failed to fetch usage data')
      const data = await response.json()
      return {
        usageThisCycle: data.usageThisCycle,
        balance: data.balance,
        nextQuotaReset: data.nextQuotaReset
          ? new Date(data.nextQuotaReset)
          : null,
      }
    },
    enabled: status === 'authenticated',
  })

  const isUsageOrProfileLoading =
    isLoadingUsage || (status === 'authenticated' && !usageData)

  return (
    <div className="space-y-8 container mx-auto py-6 px-4 sm:py-10 sm:px-6">
      {isUsageOrProfileLoading && (
        <>
          <UsageDisplaySkeleton />
          <BuyCreditsSkeleton />
        </>
      )}
      {isUsageError && (
        <Card className="w-full max-w-2xl mx-auto border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">
              Error Loading Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              Could not load your usage data. Please try refreshing the page.
            </p>
          </CardContent>
        </Card>
      )}
      {status === 'authenticated' &&
        !isUsageOrProfileLoading &&
        !isUsageError &&
        usageData && (
          <>
            <UsageDisplay {...usageData} />
            <ManageCreditsCard />
          </>
        )}
    </div>
  )
}

export default UsagePage
