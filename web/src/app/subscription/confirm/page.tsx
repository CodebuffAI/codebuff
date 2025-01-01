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
import { PlanName } from 'common/src/types/plan'
import { match, P } from 'ts-pattern'

const ConfirmSubscriptionPage = () => {
  const searchParams = useSearchParams()
  const targetPlan = searchParams.get('plan') as PlanName

  const {
    data: preview,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['subscriptionPreview', targetPlan],
    queryFn: async () => {
      const response = await fetch(
        `/api/stripe/subscription/preview?targetPlan=${targetPlan}`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch subscription preview')
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

  const content = match({
    targetPlan,
    isLoading,
    error,
    preview,
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
          <div className="border-t border-b py-4">
            <h2 className="text-xl font-semibold mb-2">What You'll Get</h2>
            <ul className="space-y-2">
              <li>• {newCredits.toLocaleString()} credits per month</li>
              <li>• Priority support over email and Discord</li>
              <li>
                • Overage allowed ($
                {targetPlan === 'Pro'
                  ? OVERAGE_RATE_PRO.toFixed(2)
                  : OVERAGE_RATE_MOAR_PRO.toFixed(2)}{' '}
                per 100 credits)
              </li>
            </ul>
          </div>

          <div className="border-b pb-6">
            <h2 className="text-2xl font-bold mb-4">Billing Summary</h2>
            <div className="space-y-4">
              {preview.currentMonthlyRate > 0 && (
                <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Current Plan Credit</h3>
                  <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex justify-between">
                      <span>
                        Pro Plan (${preview.currentMonthlyRate}/month)
                      </span>
                      <span>
                        -$
                        {(
                          (preview.currentMonthlyRate *
                            preview.daysRemainingInBillingPeriod) /
                          30
                        ).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs">
                      Credit for {preview.daysRemainingInBillingPeriod} days
                      remaining in billing period
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">New Plan Charge</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>
                      {targetPlan} Plan (${preview.newMonthlyRate}/month)
                    </span>
                    <span>
                      $
                      {(
                        (preview.newMonthlyRate *
                          preview.daysRemainingInBillingPeriod) /
                        30
                      ).toFixed(2)}
                    </span>
                  </div>
                  {preview.daysRemainingInBillingPeriod > 0 && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Prorated for {preview.daysRemainingInBillingPeriod} days
                      remaining in billing period
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold">Total due today</span>
                  <span className="text-2xl font-bold">
                    $
                    {(
                      ((preview.newMonthlyRate - preview.currentMonthlyRate) *
                        preview.daysRemainingInBillingPeriod) /
                      30
                    ).toFixed(2)}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Your next full monthly charge of ${preview.newMonthlyRate}{' '}
                  will be on{' '}
                  {new Date(preview.prorationDate * 1000).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => window.history.back()}>
            Cancel
          </Button>
          <NeonGradientButton
            onClick={() => handleCreateCheckoutSession()}
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
