'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { UsageDisplay, UsageDisplaySkeleton } from './usage-display'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { env } from '@/env.mjs'
import {
  useQuery,
  useMutation,
  useQueryClient as useTanstackQueryClient,
} from '@tanstack/react-query'
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
} from 'common/src/billing/credit-conversion'
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
import { AutoTopupSection } from '@/components/auto-topup/auto-topup-section'

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

const CreditPurchaseSection = ({
  onPurchase,
  onSaveAutoTopupSettings,
  isAutoTopupEnabled,
  isAutoTopupPending,
  isPending,
  isPurchasePending,
}: {
  onPurchase: (credits: number) => void
  onSaveAutoTopupSettings: () => Promise<boolean>
  isAutoTopupEnabled: boolean
  isAutoTopupPending: boolean
  isPending: boolean
  isPurchasePending: boolean
}) => {
  const creditOptions = [500, 1000, 2000, 5000, 10000]
  const [selectedCredits, setSelectedCredits] = useState<number | null>(null)

  const handlePurchaseClick = async () => {
    if (!selectedCredits || isPurchasePending || isPending) return

    let canProceed = true
    if (isAutoTopupEnabled) {
      canProceed = await onSaveAutoTopupSettings()
    }

    if (canProceed) {
      onPurchase(selectedCredits)
    }
  }

  const handleCreditSelection = (credits: number) => {
    setSelectedCredits((currentSelected) =>
      currentSelected === credits ? null : credits
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {creditOptions.map((credits) => {
          const costInCents = convertCreditsToUsdCents(
            credits,
            CENTS_PER_CREDIT
          )
          const costInDollars = (costInCents / 100).toFixed(2)

          return (
            <Button
              key={credits}
              variant="outline"
              onClick={() => handleCreditSelection(credits)}
              className={cn(
                'flex flex-col p-4 h-auto gap-1 transition-colors',
                selectedCredits === credits
                  ? 'border-primary bg-accent'
                  : 'hover:bg-accent/50'
              )}
              disabled={isPending || isPurchasePending}
            >
              <span className="text-lg font-semibold">
                {credits.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">
                ${costInDollars}
              </span>
            </Button>
          )
        })}
      </div>
      <div className="flex items-center justify-end">
        <NeonGradientButton
          onClick={handlePurchaseClick}
          disabled={!selectedCredits || isPending || isPurchasePending}
          className={cn(
            'w-auto transition-opacity min-w-[120px]',
            (!selectedCredits || isPending || isPurchasePending) && 'opacity-50'
          )}
          neonColors={{
            firstColor: '#4F46E5',
            secondColor: '#06B6D4',
          }}
        >
          {isPurchasePending ? (
            <Loader className="mr-2 size-4 animate-spin" />
          ) : null}
          Buy Credits
        </NeonGradientButton>
      </div>
    </div>
  )
}

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
  return (
    <Card className="w-full max-w-2xl mx-auto mb-8">
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Buy Credits</h3>
            <Link
              href={env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL}
              target="_blank"
              className="text-sm text-primary underline underline-offset-4 hover:text-primary/90"
            >
              Billing Portal →
            </Link>
          </div>
          <AutoTopupSection />
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

  if (status === 'loading') {
    return (
      <div className="space-y-8 container mx-auto py-6 px-4 sm:py-10 sm:px-6">
        <UsageDisplaySkeleton />
        <BuyCreditsSkeleton />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <SignInCard />
  }

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
