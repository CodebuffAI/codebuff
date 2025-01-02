'use client'

import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { NeonGradientButton } from '@/components/ui/neon-gradient-button'
import { SkeletonLoading } from '@/components/ui/skeleton-loading'
import { handleCreateCheckoutSession } from '@/lib/stripe'
import { PlanName, SubscriptionPreviewResponse } from 'common/src/types/plan'
import { match, P } from 'ts-pattern'
import { NewPlanSummary } from './components/new-plan-summary'
import { BillingAdjustments } from './components/billing-adjustments'

type MatchState = {
  targetPlan: PlanName | null
  isLoading: boolean
  error: Error | null
  preview: SubscriptionPreviewResponse | null
}

const ConfirmSubscriptionPage = () => {
  const searchParams = useSearchParams()
  const targetPlan = searchParams.get('plan') as PlanName

  const {
    data: preview,
    isLoading,
    error,
  } = useQuery<SubscriptionPreviewResponse, Error>({
    queryKey: ['subscriptionPreview', targetPlan],
    queryFn: async () => {
      const response = await fetch(
        `/api/stripe/subscription?targetPlan=${targetPlan}`
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

  const content = match<MatchState>({
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
    .with({ preview: P.not(P.nullish) }, ({ preview }) => (
      <>
        <CardHeader>
          <h1 className="text-3xl font-bold">Confirm Your Upgrade</h1>
          <p className="text-gray-500">
            You're about to upgrade to {targetPlan}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <h2 className="text-xl font-bold mb-4">New Plan Summary</h2>
          <div className="space-y-4">
            <NewPlanSummary preview={preview} targetPlan={targetPlan} />
            <BillingAdjustments
              preview={preview}
              targetPlan={targetPlan}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => window.history.back()}>
            Cancel
          </Button>
          <NeonGradientButton
            onClick={() => handleCreateCheckoutSession(targetPlan)}
            neonColors={{
              firstColor: '#4F46E5',
              secondColor: '#06B6D4',
            }}
            className="font-semibold text-sm"
          >
            Confirm Upgrade
          </NeonGradientButton>
        </CardFooter>
      </>
    ))
    .otherwise(() => (
      <CardContent>
        <h1 className="text-3xl font-bold text-red-500">Unexpected Error</h1>
        <p className="text-gray-500">
          Something went wrong. Please try again later.
        </p>
      </CardContent>
    ))

  return (
    <main className="container mx-auto px-4 relative z-10">
      <Card className="max-w-2xl mx-auto">{content}</Card>
    </main>
  )
}

export default ConfirmSubscriptionPage
