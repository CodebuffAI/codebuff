'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { UsageDisplay } from './usage-display'
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
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import debounce from 'lodash/debounce'

const MIN_THRESHOLD_CREDITS = 100
const MAX_THRESHOLD_CREDITS = 10000
const MIN_TOPUP_DOLLARS = 5.0
const MAX_TOPUP_DOLLARS = 100.0
const CENTS_PER_CREDIT = 1

// Helper function to clamp numbers
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

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
  isEnabled,
  onToggle,
  isPending,
  isPurchasePending,
}: {
  onPurchase: (credits: number) => void
  onSaveAutoTopupSettings: () => Promise<boolean>
  isAutoTopupEnabled: boolean
  isAutoTopupPending: boolean
  isEnabled: boolean
  onToggle: (checked: boolean) => void
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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Switch
            id="auto-topup-switch"
            checked={isEnabled}
            onCheckedChange={onToggle}
            disabled={isPending || isPurchasePending}
          />
          <Label htmlFor="auto-topup-switch">Auto Top-up</Label>
        </div>
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

const AutoTopupSection = ({
  isEnabled,
  threshold,
  topUpAmountDollars,
  onThresholdChange,
  onTopUpAmountChange,
  isPending,
}: {
  isEnabled: boolean
  threshold: number
  topUpAmountDollars: number
  onThresholdChange: (value: number) => void
  onTopUpAmountChange: (value: number) => void
  isPending: boolean
}) => (
  <TooltipProvider>
    <div className="space-y-4">
      {isEnabled && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="threshold" className="flex items-center gap-1">
                Low Balance Threshold (Credits)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      When your balance falls below this credit amount,
                      <br /> we'll automatically top it up.
                      <br />
                      Min: {MIN_THRESHOLD_CREDITS}, Max: {MAX_THRESHOLD_CREDITS}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="threshold"
                type="number"
                value={threshold}
                onChange={(e) => onThresholdChange(Number(e.target.value))}
                placeholder={`e.g., ${MIN_THRESHOLD_CREDITS}`}
                min={MIN_THRESHOLD_CREDITS}
                max={MAX_THRESHOLD_CREDITS}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="topUpAmount" className="flex items-center gap-1">
                Top-up Amount ($)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      The amount in USD to automatically purchase
                      <br /> when your balance is low.
                      <br />
                      Min: ${MIN_TOPUP_DOLLARS.toFixed(2)}, Max: $
                      {MAX_TOPUP_DOLLARS.toFixed(2)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="topUpAmount"
                type="number"
                step="0.01"
                value={topUpAmountDollars}
                onChange={(e) => onTopUpAmountChange(Number(e.target.value))}
                placeholder={`e.g., ${MIN_TOPUP_DOLLARS.toFixed(2)}`}
                min={MIN_TOPUP_DOLLARS}
                max={MAX_TOPUP_DOLLARS}
              />
            </div>
          </div>
        </>
      )}
    </div>
  </TooltipProvider>
)

const ManageCreditsCard = () => {
  const tanstackQueryClient = useTanstackQueryClient()
  const [isEnabled, setIsEnabled] = useState(false)
  const [threshold, setThreshold] = useState(MIN_THRESHOLD_CREDITS)
  const [topUpAmountDollars, setTopUpAmountDollars] =
    useState(MIN_TOPUP_DOLLARS)
  const isInitialLoad = useRef(true)

  const { data: userProfile, isLoading: isLoadingProfile } = useQuery<
    UserProfile & { initialTopUpDollars?: number }
  >({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const response = await fetch('/api/user/profile')
      if (!response.ok) throw new Error('Failed to fetch profile')
      const data = await response.json()
      const targetBalanceCredits =
        data.auto_topup_target_balance ??
        MIN_THRESHOLD_CREDITS +
          convertStripeGrantAmountToCredits(
            MIN_TOPUP_DOLLARS * 100,
            CENTS_PER_CREDIT
          )
      const thresholdCredits =
        data.auto_topup_threshold ?? MIN_THRESHOLD_CREDITS
      const topUpCredits = Math.max(0, targetBalanceCredits - thresholdCredits)
      const topUpCents = convertCreditsToUsdCents(
        topUpCredits,
        CENTS_PER_CREDIT
      )
      const initialTopUpDollars = topUpCents / 100

      return {
        ...data,
        auto_topup_enabled: data.auto_topup_enabled ?? false,
        auto_topup_threshold: clamp(
          thresholdCredits,
          MIN_THRESHOLD_CREDITS,
          MAX_THRESHOLD_CREDITS
        ),
        initialTopUpDollars: clamp(
          initialTopUpDollars > 0 ? initialTopUpDollars : MIN_TOPUP_DOLLARS,
          MIN_TOPUP_DOLLARS,
          MAX_TOPUP_DOLLARS
        ),
        auto_topup_target_balance: targetBalanceCredits,
      }
    },
  })

  useEffect(() => {
    if (userProfile) {
      setIsEnabled(userProfile.auto_topup_enabled ?? false)
      setThreshold(userProfile.auto_topup_threshold ?? MIN_THRESHOLD_CREDITS)
      setTopUpAmountDollars(
        userProfile.initialTopUpDollars ?? MIN_TOPUP_DOLLARS
      )
      setTimeout(() => {
        isInitialLoad.current = false
      }, 0)
    }
  }, [userProfile])

  const handleThresholdInputChange = (rawValue: number) => {
    const clampedValue = clamp(
      rawValue,
      MIN_THRESHOLD_CREDITS,
      MAX_THRESHOLD_CREDITS
    )
    setThreshold(clampedValue)
  }

  const handleTopUpAmountInputChange = (rawValue: number) => {
    const clampedValue = clamp(rawValue, MIN_TOPUP_DOLLARS, MAX_TOPUP_DOLLARS)
    setTopUpAmountDollars(clampedValue)
  }

  const autoTopupMutation = useMutation({
    mutationFn: async (
      settings: Partial<
        Pick<
          UserProfile,
          | 'auto_topup_enabled'
          | 'auto_topup_threshold'
          | 'auto_topup_target_balance'
        >
      >
    ) => {
      const payload = {
        enabled: settings.auto_topup_enabled,
        threshold: settings.auto_topup_threshold,
        targetBalance: settings.auto_topup_target_balance,
      }

      if (typeof payload.enabled !== 'boolean') {
        console.error(
          "Auto-topup 'enabled' state is not boolean before sending to API:",
          payload.enabled
        )
        throw new Error('Internal error: Auto-topup enabled state is invalid.')
      }

      if (payload.enabled) {
        if (payload.threshold === null || payload.threshold === undefined)
          throw new Error('Threshold is required.')
        if (
          payload.targetBalance === null ||
          payload.targetBalance === undefined
        )
          throw new Error('Target balance is required.')
        if (
          payload.threshold < MIN_THRESHOLD_CREDITS ||
          payload.threshold > MAX_THRESHOLD_CREDITS
        )
          throw new Error('Invalid threshold value.')
        if (payload.targetBalance <= payload.threshold)
          throw new Error('Target balance must exceed threshold.')

        const topUpCredits = payload.targetBalance - payload.threshold
        const minTopUpCredits = convertStripeGrantAmountToCredits(
          MIN_TOPUP_DOLLARS * 100,
          CENTS_PER_CREDIT
        )
        const maxTopUpCredits = convertStripeGrantAmountToCredits(
          MAX_TOPUP_DOLLARS * 100,
          CENTS_PER_CREDIT
        )
        if (topUpCredits < minTopUpCredits || topUpCredits > maxTopUpCredits) {
          throw new Error(
            `Top-up amount must result in between ${minTopUpCredits} and ${maxTopUpCredits} credits.`
          )
        }
      }

      const response = await fetch('/api/user/auto-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Failed to update settings' }))
        let message = errorData.error || 'Failed to update settings'
        if (errorData.issues) {
          message = errorData.issues
            .map((issue: any) => issue.message)
            .join(', ')
        } else if (response.status === 400) {
          message = errorData.error || 'Invalid settings provided.'
        }
        throw new Error(message)
      }
      return response.json()
    },
    onSuccess: (data, variables) => {
      const wasEnabled = variables.auto_topup_enabled
      const savingSettings =
        variables.auto_topup_threshold !== undefined &&
        variables.auto_topup_target_balance !== undefined

      let toastMessage = ''
      if (wasEnabled && savingSettings) {
        toastMessage = 'Auto Top-up settings saved!'
      }

      if (toastMessage) {
        toast({ title: toastMessage })
      }

      tanstackQueryClient.setQueryData(
        ['userProfile'],
        (
          oldData: (UserProfile & { initialTopUpDollars?: number }) | undefined
        ) => {
          if (!oldData) return oldData

          const savedEnabled =
            data?.auto_topup_enabled ?? variables.auto_topup_enabled
          const savedThresholdRaw =
            data?.auto_topup_threshold ?? variables.auto_topup_threshold
          const savedTargetBalanceRaw =
            data?.auto_topup_target_balance ??
            variables.auto_topup_target_balance

          const savedThreshold = savedEnabled
            ? clamp(
                savedThresholdRaw ?? MIN_THRESHOLD_CREDITS,
                MIN_THRESHOLD_CREDITS,
                MAX_THRESHOLD_CREDITS
              )
            : MIN_THRESHOLD_CREDITS

          const savedTargetBalance = savedEnabled
            ? (savedTargetBalanceRaw ??
              savedThreshold +
                convertStripeGrantAmountToCredits(
                  MIN_TOPUP_DOLLARS * 100,
                  CENTS_PER_CREDIT
                ))
            : savedThreshold +
              convertStripeGrantAmountToCredits(
                MIN_TOPUP_DOLLARS * 100,
                CENTS_PER_CREDIT
              )

          const savedTopUpCredits = Math.max(
            0,
            savedTargetBalance - savedThreshold
          )
          const savedTopUpCents = convertCreditsToUsdCents(
            savedTopUpCredits,
            CENTS_PER_CREDIT
          )
          const savedTopUpDollars = clamp(
            savedTopUpCents / 100,
            MIN_TOPUP_DOLLARS,
            MAX_TOPUP_DOLLARS
          )

          const updatedData = {
            ...oldData,
            auto_topup_enabled: savedEnabled,
            auto_topup_threshold: savedEnabled ? savedThreshold : null,
            auto_topup_target_balance: savedEnabled ? savedTargetBalance : null,
            initialTopUpDollars: savedTopUpDollars,
          }

          setIsEnabled(updatedData.auto_topup_enabled ?? false)
          setThreshold(
            updatedData.auto_topup_threshold ?? MIN_THRESHOLD_CREDITS
          )
          setTopUpAmountDollars(
            updatedData.initialTopUpDollars ?? MIN_TOPUP_DOLLARS
          )

          return updatedData
        }
      )
    },
    onError: (error: Error, variables) => {
      toast({
        title: 'Error saving settings',
        description: error.message,
        variant: 'destructive',
      })
      if (userProfile) {
        setIsEnabled(userProfile.auto_topup_enabled ?? false)
        setThreshold(userProfile.auto_topup_threshold ?? MIN_THRESHOLD_CREDITS)
        setTopUpAmountDollars(
          userProfile.initialTopUpDollars ?? MIN_TOPUP_DOLLARS
        )
      }
    },
  })

  const debouncedSaveSettings = useCallback(
    debounce((currentThreshold: number, currentTopUpDollars: number) => {
      if (
        currentThreshold < MIN_THRESHOLD_CREDITS ||
        currentThreshold > MAX_THRESHOLD_CREDITS
      ) {
        console.error(
          'Debounced save called with invalid threshold:',
          currentThreshold
        )
        return
      }
      if (
        currentTopUpDollars < MIN_TOPUP_DOLLARS ||
        currentTopUpDollars > MAX_TOPUP_DOLLARS
      ) {
        console.error(
          'Debounced save called with invalid top-up amount:',
          currentTopUpDollars
        )
        return
      }

      const topUpAmountCents = Math.round(currentTopUpDollars * 100)
      const topUpCredits = convertStripeGrantAmountToCredits(
        topUpAmountCents,
        CENTS_PER_CREDIT
      )
      const targetBalanceCredits = currentThreshold + topUpCredits

      if (
        currentThreshold === userProfile?.auto_topup_threshold &&
        targetBalanceCredits === userProfile?.auto_topup_target_balance &&
        userProfile?.auto_topup_enabled === true
      ) {
        return
      }

      console.log('Debounced save triggered', {
        threshold: currentThreshold,
        targetBalance: targetBalanceCredits,
      })
      autoTopupMutation.mutate({
        auto_topup_enabled: true,
        auto_topup_threshold: currentThreshold,
        auto_topup_target_balance: targetBalanceCredits,
      })
    }, 750),
    [autoTopupMutation, userProfile]
  )

  useEffect(() => {
    if (isInitialLoad.current || !isEnabled || isLoadingProfile) {
      return
    }
    debouncedSaveSettings(threshold, topUpAmountDollars)

    return () => {
      debouncedSaveSettings.cancel()
    }
  }, [
    threshold,
    topUpAmountDollars,
    isEnabled,
    isLoadingProfile,
    debouncedSaveSettings,
  ])

  const buyCreditsMutation = useMutation({
    mutationFn: async (credits: number) => {
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
    onSuccess: (data) => {
      if (data.sessionId) {
        import('@stripe/stripe-js').then(async ({ loadStripe }) => {
          const stripePromise = loadStripe(
            env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
          )
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
        })
      } else {
        tanstackQueryClient.invalidateQueries({ queryKey: ['usageData'] })
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

  const handleSaveSettingsIfNeeded = async (): Promise<boolean> => {
    if (!isEnabled) {
      return true
    }
    if (
      threshold < MIN_THRESHOLD_CREDITS ||
      threshold > MAX_THRESHOLD_CREDITS
    ) {
      toast({
        title: 'Invalid Threshold',
        description: `Threshold must be between ${MIN_THRESHOLD_CREDITS} and ${MAX_THRESHOLD_CREDITS}.`,
        variant: 'destructive',
      })
      return false
    }
    if (
      topUpAmountDollars < MIN_TOPUP_DOLLARS ||
      topUpAmountDollars > MAX_TOPUP_DOLLARS
    ) {
      toast({
        title: 'Invalid Top-up Amount',
        description: `Amount must be between $${MIN_TOPUP_DOLLARS.toFixed(2)} and $${MAX_TOPUP_DOLLARS.toFixed(2)}.`,
        variant: 'destructive',
      })
      return false
    }
    const topUpAmountCents = Math.round(topUpAmountDollars * 100)
    const topUpCredits = convertStripeGrantAmountToCredits(
      topUpAmountCents,
      CENTS_PER_CREDIT
    )
    const targetBalanceCredits = threshold + topUpCredits
    if (targetBalanceCredits <= threshold) {
      toast({
        title: 'Invalid Settings',
        description:
          'Calculated target balance must be greater than the threshold.',
        variant: 'destructive',
      })
      return false
    }
    return true
  }

  const handleToggleAutoTopup = (checked: boolean) => {
    setIsEnabled(checked)
    debouncedSaveSettings.cancel()

    if (checked) {
      if (
        threshold < MIN_THRESHOLD_CREDITS ||
        threshold > MAX_THRESHOLD_CREDITS ||
        topUpAmountDollars < MIN_TOPUP_DOLLARS ||
        topUpAmountDollars > MAX_TOPUP_DOLLARS
      ) {
        toast({
          title: 'Invalid Settings',
          description: `Cannot enable auto top-up with current values. Please ensure they are within limits.`,
          variant: 'destructive',
        })
        setIsEnabled(false)
        return
      }

      const topUpAmountCents = Math.round(topUpAmountDollars * 100)
      const topUpCredits = convertStripeGrantAmountToCredits(
        topUpAmountCents,
        CENTS_PER_CREDIT
      )
      const targetBalanceCredits = threshold + topUpCredits

      if (targetBalanceCredits <= threshold) {
        toast({
          title: 'Invalid Settings',
          description:
            'Cannot enable: Calculated target balance must be greater than the threshold.',
          variant: 'destructive',
        })
        setIsEnabled(false)
        return
      }

      autoTopupMutation.mutate(
        {
          auto_topup_enabled: true,
          auto_topup_threshold: threshold,
          auto_topup_target_balance: targetBalanceCredits,
        },
        {
          onSuccess: () => {
            toast({ title: 'Auto Top-up enabled!' })
          },
          onError: () => {
            setIsEnabled(false)
          },
        }
      )
    } else {
      autoTopupMutation.mutate(
        {
          auto_topup_enabled: false,
          auto_topup_threshold: null,
          auto_topup_target_balance: null,
        },
        {
          onSuccess: () => {
            toast({ title: 'Auto Top-up disabled.' })
          },
          onError: () => {
            setIsEnabled(true)
          },
        }
      )
    }
  }

  if (isLoadingProfile) {
    return <UsagePageSkeleton />
  }

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
          <CreditPurchaseSection
            onPurchase={(credits) => buyCreditsMutation.mutate(credits)}
            onSaveAutoTopupSettings={handleSaveSettingsIfNeeded}
            isAutoTopupEnabled={isEnabled}
            isAutoTopupPending={autoTopupMutation.isPending}
            isEnabled={isEnabled}
            onToggle={handleToggleAutoTopup}
            isPending={autoTopupMutation.isPending}
            isPurchasePending={buyCreditsMutation.isPending}
          />
          <AutoTopupSection
            isEnabled={isEnabled}
            threshold={threshold}
            topUpAmountDollars={topUpAmountDollars}
            onThresholdChange={handleThresholdInputChange}
            onTopUpAmountChange={handleTopUpAmountInputChange}
            isPending={autoTopupMutation.isPending}
          />
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
    return <UsagePageSkeleton />
  }

  if (status === 'unauthenticated') {
    return <SignInCard />
  }

  const isUsageOrProfileLoading =
    isLoadingUsage || (status === 'authenticated' && !usageData)

  return (
    <div className="space-y-8 container mx-auto py-6 px-4 sm:py-10 sm:px-6">
      {isUsageOrProfileLoading && <UsagePageSkeleton />}
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
