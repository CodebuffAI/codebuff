'use client'

import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { NeonGradientButton } from '@/components/ui/neon-gradient-button'
import { SkeletonLoading } from '@/components/ui/skeleton-loading'
import { handleCreateCheckoutSession } from '@/lib/stripe'
import {
  CREDITS_USAGE_LIMITS,
  OVERAGE_RATE_PRO,
  OVERAGE_RATE_MOAR_PRO,
} from 'common/constants'
import {
  PlanName,
  SubscriptionPreviewResponse,
  InvoiceLineItem,
} from 'common/src/types/plan'
import { match, P } from 'ts-pattern'
import { InvoiceLineItems } from './components/invoice-line-items'
import { Separator } from '@/components/ui/separator'

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

  const newCredits =
    CREDITS_USAGE_LIMITS[targetPlan === 'Pro' ? 'PRO' : 'MOAR_PRO']

  type MatchState = {
    targetPlan: PlanName | null
    isLoading: boolean
    error: Error | null
    preview: SubscriptionPreviewResponse | null
  }

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
            {preview.overageCredits > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <div className="space-y-2 text-md">
                  <div className="flex justify-between">
                    <span>Base plan rate</span>
                    <div>
                      <span className="line-through text-gray-400">
                        ${preview.currentMonthlyRate}
                      </span>
                      <span className="ml-2">${preview.newMonthlyRate}</span>
                    </div>
                  </div>
                  <div className="flex justify-between text-amber-600 dark:text-amber-400">
                    <div>
                      <span>Overage</span>
                      <div className="text-xs text-gray-500">
                        {preview.overageCredits.toLocaleString()} credits over
                        current plan limit
                      </div>
                    </div>
                    <div className="text-right">
                      <div>
                        <span className="line-through text-gray-400">
                          ${preview.currentOverageAmount.toFixed(2)}
                        </span>
                        <span className="ml-2">
                          ${preview.newOverageAmount.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        <span className="line-through text-gray-400">
                          ${preview.currentOverageRate.toFixed(2)}
                        </span>
                        <span className="ml-2">
                          ${preview.newOverageRate.toFixed(2)}
                        </span>{' '}
                        per 100
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mb-3 text-xs text-gray-500 italic">
                  Overage charges are billed at the end of each billing period
                  based on final usage
                </p>
                <div className="flex justify-between font-medium">
                  <div>
                    <span>Final Estimate</span>
                    <div className="text-xs text-gray-500">
                      starting{' '}
                      {new Date(
                        preview.prorationDate * 1000
                      ).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div>
                      <span className="line-through text-gray-400">
                        $
                        {(
                          preview.currentMonthlyRate +
                          preview.currentOverageAmount
                        ).toFixed(2)}
                      </span>
                      <span className="ml-2">
                        $
                        {(
                          preview.newMonthlyRate + preview.newOverageAmount
                        ).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">per month</div>
                  </div>
                </div>
              </div>
            )}
            <div className="pt-4">
              <h2 className="text-xl font-semibold mb-4">
                Billing Adjustment Details
              </h2>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg space-y-2">
                <div className="space-y-1 text-sm">
                  <InvoiceLineItems
                    items={preview.lineItems}
                    targetPlan={targetPlan}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-2xl font-bold">Due today</span>
              <span className="text-2xl font-bold">
                $
                {preview.lineItems
                  .reduce((total, item) => total + item.amount, 0)
                  .toFixed(2)}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Prorated charge for remaining{' '}
              {preview.daysRemainingInBillingPeriod} days of current billing
              period, excluding overage charges.
            </p>
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
    <div className="overflow-hidden">
      <BackgroundBeams />
      <main className="container mx-auto px-4 py-20 relative z-10">
        <Card className="max-w-2xl mx-auto">{content}</Card>
      </main>
    </div>
  )
}

export default ConfirmSubscriptionPage
