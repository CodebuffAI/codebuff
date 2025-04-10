'use client'

import { useEffect, useState } from 'react'
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
import { Info, ChevronDown, ChevronUp } from 'lucide-react'
import { UserProfile } from '@/types/user'
import { useSession } from 'next-auth/react'
import { convertCreditsToUsdCents } from 'common/src/billing/credit-conversion'
import { NeonGradientButton } from '@/components/ui/neon-gradient-button'
import { cn } from '@/lib/utils'

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
}: {
  onPurchase: (credits: number) => void
  onSaveAutoTopupSettings: () => Promise<boolean>
  isAutoTopupEnabled: boolean
  isAutoTopupPending: boolean
  isEnabled: boolean
  onToggle: (value: boolean) => void
  isPending: boolean
}) => {
  const creditOptions = [500, 1000, 2000, 5000, 10000]
  const centsPerCredit = 1
  const [selectedCredits, setSelectedCredits] = useState<number | null>(null)

  const handlePurchaseClick = async () => {
    if (!selectedCredits) return
    
    let canProceed = true
    if (isAutoTopupEnabled) {
      canProceed = await onSaveAutoTopupSettings()
    }
    if (canProceed) {
      onPurchase(selectedCredits)
    }
  }

  const handleCreditSelection = (credits: number) => {
    setSelectedCredits(currentSelected => 
      currentSelected === credits ? null : credits
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {creditOptions.map((credits) => {
          const costInCents = convertCreditsToUsdCents(credits, centsPerCredit)
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
              disabled={isAutoTopupPending}
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={isEnabled}
            onCheckedChange={onToggle}
            disabled={isPending}
          />
          <Label>Auto Top-up</Label>
        </div>
        <NeonGradientButton
          onClick={handlePurchaseClick}
          disabled={!selectedCredits || isAutoTopupPending}
          className={cn(
            "w-auto transition-opacity",
            !selectedCredits && "opacity-50"
          )}
          neonColors={{
            firstColor: '#4F46E5',
            secondColor: '#06B6D4',
          }}
        >
          Buy Credits
        </NeonGradientButton>
      </div>
    </div>
  )
}

const AutoTopupSection = ({
  isEnabled,
  threshold,
  targetBalance,
  onThresholdChange,
  onTargetChange,
  isPending,
}: {
  isEnabled: boolean
  threshold: number
  targetBalance: number
  onThresholdChange: (value: number) => void
  onTargetChange: (value: number) => void
  isPending: boolean
}) => (
  <div className="space-y-4">
    {isEnabled && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div className="space-y-2">
          <Label htmlFor="threshold" className="flex items-center gap-2">
            Low Balance Threshold
            <Info className="h-4 w-4 text-muted-foreground" />
          </Label>
          <Input
            id="threshold"
            type="number"
            value={threshold}
            onChange={(e) => onThresholdChange(Number(e.target.value))}
            placeholder="e.g., 500"
            min="1"
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="targetBalance" className="flex items-center gap-2">
            Target Balance
            <Info className="h-4 w-4 text-muted-foreground" />
          </Label>
          <Input
            id="targetBalance"
            type="number"
            value={targetBalance}
            onChange={(e) => onTargetChange(Number(e.target.value))}
            placeholder="e.g., 2000"
            min="1"
            disabled={isPending}
          />
        </div>
      </div>
    )}
  </div>
)

const ManageCreditsCard = () => {
  const tanstackQueryClient = useTanstackQueryClient()
  const [isEnabled, setIsEnabled] = useState(false)
  const [threshold, setThreshold] = useState(500)
  const [targetBalance, setTargetBalance] = useState(2000)

  const { data: userProfile, isLoading: isLoadingProfile } =
    useQuery<UserProfile>({
      queryKey: ['userProfile'],
      queryFn: async () => {
        const response = await fetch('/api/user/profile')
        if (!response.ok) throw new Error('Failed to fetch profile')
        const data = await response.json()
        return {
          ...data,
          auto_topup_enabled: data.auto_topup_enabled ?? false,
          auto_topup_threshold: data.auto_topup_threshold ?? 500,
          auto_topup_target_balance: data.auto_topup_target_balance ?? 2000,
        }
      },
    })

  useEffect(() => {
    if (userProfile) {
      setIsEnabled(userProfile.auto_topup_enabled ?? false)
      setThreshold(userProfile.auto_topup_threshold ?? 500)
      setTargetBalance(userProfile.auto_topup_target_balance ?? 2000)
    }
  }, [userProfile])

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
      const response = await fetch('/api/user/auto-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Failed to update settings' }))
        throw new Error(errorData.error || 'Failed to update settings')
      }
      return response.json()
    },
    onSuccess: (data, variables) => {
      toast({ title: 'Auto Top-up settings saved successfully!' })
      tanstackQueryClient.setQueryData(
        ['userProfile'],
        (oldData: UserProfile | undefined) =>
          oldData ? { ...oldData, ...variables } : oldData
      )
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving settings',
        description: error.message,
        variant: 'destructive',
      })
      if (userProfile) {
        setIsEnabled(userProfile.auto_topup_enabled ?? false)
        setThreshold(userProfile.auto_topup_threshold ?? 500)
        setTargetBalance(userProfile.auto_topup_target_balance ?? 2000)
      }
    },
  })

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

  const handleSaveAutoTopup = async (): Promise<boolean> => {
    if (!isEnabled) {
      const settingsToUpdate = {
        auto_topup_enabled: false,
        auto_topup_threshold: null,
        auto_topup_target_balance: null,
      }
      if (userProfile?.auto_topup_enabled !== false) {
        try {
          await autoTopupMutation.mutateAsync(settingsToUpdate)
        } catch (e) {
          console.error('Failed to save disabled auto-topup state', e)
        }
      }
      return true
    }

    if (threshold <= 0 || targetBalance <= 0) {
      toast({
        title: 'Invalid Values',
        description: 'Threshold and Target Balance must be positive numbers.',
        variant: 'destructive',
      })
      return false
    }
    if (targetBalance <= threshold) {
      toast({
        title: 'Invalid Values',
        description: 'Target Balance must be greater than the Threshold.',
        variant: 'destructive',
      })
      return false
    }
    const MINIMUM_PURCHASE_CREDITS = 500
    if (targetBalance - threshold < MINIMUM_PURCHASE_CREDITS) {
      toast({
        title: 'Invalid Values',
        description: `The top-up amount (Target - Threshold) must be at least ${MINIMUM_PURCHASE_CREDITS} credits.`,
        variant: 'destructive',
      })
      return false
    }

    const settingsToUpdate = {
      auto_topup_enabled: true,
      auto_topup_threshold: threshold,
      auto_topup_target_balance: targetBalance,
    }

    if (
      userProfile?.auto_topup_enabled !== true ||
      userProfile?.auto_topup_threshold !== threshold ||
      userProfile?.auto_topup_target_balance !== targetBalance
    ) {
      try {
        await autoTopupMutation.mutateAsync(settingsToUpdate)
        return true
      } catch (error) {
        return false
      }
    } else {
      return true
    }
  }

  if (isLoadingProfile) {
    return (
      <Card className="w-full max-w-2xl mx-auto mb-8 animate-pulse">
        <CardContent className="space-y-6 pt-6">
          <div className="h-8 bg-muted rounded w-3/4"></div>
          <div className="h-20 bg-muted rounded"></div>
        </CardContent>
      </Card>
    )
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
              className="text-sm text-muted-foreground hover:text-primary"
            >
              Billing Portal →
            </Link>
          </div>
          <CreditPurchaseSection
            onPurchase={(credits) => buyCreditsMutation.mutate(credits)}
            onSaveAutoTopupSettings={handleSaveAutoTopup}
            isAutoTopupEnabled={isEnabled}
            isAutoTopupPending={autoTopupMutation.isPending}
            isEnabled={isEnabled}
            onToggle={setIsEnabled}
            isPending={autoTopupMutation.isPending}
          />
          <AutoTopupSection
            isEnabled={isEnabled}
            threshold={threshold}
            targetBalance={targetBalance}
            onThresholdChange={setThreshold}
            onTargetChange={setTargetBalance}
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
    return (
      <div className="container mx-auto py-10 text-center">
        Loading session...
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <SignInCard />
  }

  return (
    <div className="space-y-8 container mx-auto py-6 px-4 sm:py-10 sm:px-6">
      {isLoadingUsage && (
        <Card className="w-full max-w-2xl mx-auto animate-pulse">
          <CardHeader>
            <div className="h-6 bg-muted rounded w-1/2"></div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-full"></div>
            <div className="h-10 bg-muted rounded"></div>
            <div className="h-10 bg-muted rounded"></div>
          </CardContent>
        </Card>
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
      {usageData && !isLoadingUsage && !isUsageError && (
        <UsageDisplay {...usageData} />
      )}
      <ManageCreditsCard />
    </div>
  )
}

export default UsagePage
