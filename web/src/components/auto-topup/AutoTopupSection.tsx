import { env } from '@/env.mjs'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/use-toast'
import { useAutoTopup } from '@/hooks/use-auto-topup'
import { CreditPurchaseSection } from '@/components/credits/CreditPurchaseSection'
import { AutoTopupSettings } from './AutoTopupSettings'
import { AUTO_TOPUP_CONSTANTS } from './constants'

export function AutoTopupSection() {
  const queryClient = useQueryClient()
  const {
    isEnabled,
    threshold,
    topUpAmountDollars,
    isLoadingProfile,
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

      <AutoTopupSettings />
    </div>
  )
}