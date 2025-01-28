'use client'

import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useUserPlan } from '@/hooks/use-user-plan'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NeonGradientButton } from '@/components/ui/neon-gradient-button'
import { SkeletonLoading } from '@/components/ui/skeleton-loading'
import { useRouter } from 'next/navigation'
import posthog from 'posthog-js'
import { SubscriptionPreviewResponse } from 'common/src/types/plan'
import { UsageLimits, PLAN_CONFIGS } from 'common/constants'
import { match, P } from 'ts-pattern'
import { NewPlanSummary } from './components/new-plan-summary'
import { BillingAdjustments } from './components/billing-adjustments'
import { Toaster } from '@/components/ui/toaster'
import { useToast } from '@/components/ui/use-toast'
import { env } from '@/env.mjs'
import { changeOrUpgrade } from '@/lib/utils'
import { capitalize } from 'common/util/string'
import { loadStripe } from '@stripe/stripe-js'
import { Icons } from '@/components/icons'

const useUpgradeSubscription = (
  currentPlan: UsageLimits | null | undefined,
  targetPlan: UsageLimits
) => {
  const router = useRouter()
  const { toast } = useToast()

  return useMutation({
    mutationFn: async (targetPlan: UsageLimits) => {
      const response = await fetch('/api/stripe/subscription/change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetPlan }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(
          error.message ||
            `Failed to change subscription. Please reach out to support at ${env.NEXT_PUBLIC_SUPPORT_EMAIL}.`
        )
      }

      return response.json()
    },
    onSuccess: async (data) => {
      posthog.capture('subscription.upgrade_started', {
        current_plan: currentPlan,
        target_plan: targetPlan,
      })

      if (data?.session) {
        // Server wants us to redirect to Stripe
        const stripe = await loadStripe(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
        if (!stripe) {
          throw new Error('Stripe not loaded')
        }
        console.log('Redirecting to Stripe checkout session:', data.session.id)

        await stripe.redirectToCheckout({
          sessionId: data.session.id,
        })
        return
      }

      const modification = changeOrUpgrade(currentPlan, targetPlan)
      router.push('/payment-change?modification=' + modification)
    },
    onError: async (error: any) => {
      console.error('Error upgrading subscription:', error)

      // Try to get the error message from the API response
      let errorMessage = error.message
      if (error instanceof Error && 'cause' in error) {
        try {
          const response = error.cause as Response
          if (response?.json) {
            const data = await response.json()
            errorMessage = data.error?.message || errorMessage
          }
        } catch (e) {
          console.error('Failed to parse error response:', e)
        }
      }

      toast({
        variant: 'destructive',
        title: `Error updating subscription`,
        description: errorMessage,
      })
    },
  })
}

const ConfirmSubscriptionPage = () => {
  const searchParams = useSearchParams()
  const planParam = searchParams.get('plan')
  const targetPlan = planParam as UsageLimits
  const session = useSession()
  const { data: currentPlan } = useUserPlan(
    session.data?.user?.stripe_customer_id
  )
  const upgradeMutation = useUpgradeSubscription(currentPlan, targetPlan)
  const modification = changeOrUpgrade(currentPlan, targetPlan)

  const {
    data: preview,
    isLoading,
    error,
  } = useQuery<SubscriptionPreviewResponse, Error>({
    queryKey: ['subscriptionPreview', targetPlan],
    queryFn: async () => {
      const response = await fetch(
        `/api/stripe/subscription/change?targetPlan=${targetPlan}`
      )
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(
          errorData.message || 'Failed to fetch subscription preview'
        )
      }
      return response.json()
    },
    enabled: !!targetPlan,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const content = match({
    currentPlan,
    targetPlan,
    isLoading,
    error,
    preview: preview || null,
  })
    .with({ targetPlan: P.nullish }, () => (
      <CardContent>
        <h1 className="text-3xl font-bold text-red-500">Invalid Request</h1>
        <p className="text-gray-500">No plan was selected for upgrade.</p>
      </CardContent>
    ))
    .with({ isLoading: true }, () => <SkeletonLoading />)
    .with({ error: P.not(P.nullish) }, ({ error }) => (
      <>
        <CardHeader>
          <h1 className="text-3xl font-bold text-red-500">Error</h1>
          <p className="text-gray-500">
            {error?.message || 'An error occurred'}
          </p>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </CardFooter>
      </>
    ))
    .with(
      { preview: P.not(P.nullish), currentPlan: P.not(P.nullish) },
      ({ preview, currentPlan }) => (
        <>
          <CardHeader>
            <h1 className="text-3xl font-bold">
              Confirm Your {capitalize(modification)}
            </h1>
            <p className="text-gray-500">
              You're about to {modification} to{' '}
              {PLAN_CONFIGS[targetPlan as UsageLimits].displayName}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <h2 className="text-xl font-bold mb-4">New Plan Summary</h2>
            <div className="space-y-4">
              <NewPlanSummary
                preview={preview}
                targetPlan={targetPlan}
                currentPlan={currentPlan}
              />
              <BillingAdjustments preview={preview} targetPlan={targetPlan} />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={() => window.history.back()}>
              Cancel
            </Button>
            <NeonGradientButton
              onClick={() => upgradeMutation.mutate(targetPlan as UsageLimits)}
              disabled={upgradeMutation.isPending}
              neonColors={{
                firstColor: '#4F46E5',
                secondColor: '#06B6D4',
              }}
              className="font-semibold text-sm"
            >
              {upgradeMutation.isPending && (
                <Icons.loader className="mr-2 size-4 animate-spin" />
              )}
              Confirm {capitalize(modification)}
            </NeonGradientButton>
          </CardFooter>
        </>
      )
    )
    .otherwise(() => (
      <CardContent>
        <h1 className="text-3xl font-bold text-red-500">Unexpected Error</h1>
        <p className="text-gray-500">
          Something went wrong. Please try again later.
        </p>
      </CardContent>
    ))

  return (
    <main className="container mx-auto p-4 relative z-10">
      <Card className="max-w-2xl mx-auto">{content}</Card>
      <Toaster />
    </main>
  )
}

export default ConfirmSubscriptionPage
