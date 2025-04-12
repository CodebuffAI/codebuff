import { env } from '@/env.mjs'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Loader2 as Loader } from 'lucide-react'
import { NeonGradientButton } from '@/components/ui/neon-gradient-button'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { convertCreditsToUsdCents } from 'common/src/billing/credit-conversion'
import { useAutoTopup, AUTO_TOPUP_CONSTANTS } from '@/hooks/use-auto-topup'
import { ConnectedAutoTopupSettings } from './connected-auto-topup-settings'

const { CENTS_PER_CREDIT } = AUTO_TOPUP_CONSTANTS

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

export function AutoTopupSection() {
  const queryClient = useQueryClient()
  const {
    isEnabled,
    threshold,
    topUpAmountDollars,
    isLoadingProfile,
    handleToggleAutoTopup,
    isPending,
  } = useAutoTopup()

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

  const handleSaveSettingsIfNeeded = async (): Promise<boolean> => {
    if (!isEnabled) {
      return true
    }
    if (
      threshold < AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS ||
      threshold > AUTO_TOPUP_CONSTANTS.MAX_THRESHOLD_CREDITS
    ) {
      toast({
        title: 'Invalid Threshold',
        description: `Threshold must be between ${AUTO_TOPUP_CONSTANTS.MIN_THRESHOLD_CREDITS} and ${AUTO_TOPUP_CONSTANTS.MAX_THRESHOLD_CREDITS}.`,
        variant: 'destructive',
      })
      return false
    }
    if (
      topUpAmountDollars < AUTO_TOPUP_CONSTANTS.MIN_TOPUP_DOLLARS ||
      topUpAmountDollars > AUTO_TOPUP_CONSTANTS.MAX_TOPUP_DOLLARS
    ) {
      toast({
        title: 'Invalid Top-up Amount',
        description: `Amount must be between $${AUTO_TOPUP_CONSTANTS.MIN_TOPUP_DOLLARS.toFixed(2)} and $${AUTO_TOPUP_CONSTANTS.MAX_TOPUP_DOLLARS.toFixed(2)}.`,
        variant: 'destructive',
      })
      return false
    }
    return true
  }

  if (isLoadingProfile) {
    return null
  }

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <CreditPurchaseSection
          onPurchase={(credits) => buyCreditsMutation.mutate(credits)}
          onSaveAutoTopupSettings={handleSaveSettingsIfNeeded}
          isAutoTopupEnabled={isEnabled}
          isAutoTopupPending={isPending}
          isPending={isPending}
          isPurchasePending={buyCreditsMutation.isPending}
        />
      </div>

      <div className="border-t border-border" />

      <ConnectedAutoTopupSettings />
    </div>
  )
}
