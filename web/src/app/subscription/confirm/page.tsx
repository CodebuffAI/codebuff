'use client'

import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { NeonGradientButton } from '@/components/ui/neon-gradient-button'
import { SkeletonLoading } from '@/components/ui/skeleton-loading'
import { handleCreateCheckoutSession } from '@/lib/stripe'
import { CREDITS_USAGE_LIMITS } from 'common/constants'
import { PlanName } from 'common/src/types/plan'

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

  if (!targetPlan) {
    return <div>Invalid plan selected</div>
  }

  if (isLoading) {
    return <SkeletonLoading />
  }

  if (error || preview?.error) {
    const errorMessage =
      error?.message || preview?.error?.message || 'An error occurred'
    return (
      <div className="overflow-hidden">
        <BackgroundBeams />
        <main className="container mx-auto px-4 py-20 relative z-10">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <h1 className="text-3xl font-bold text-red-500">Error</h1>
              <p className="text-gray-500">{errorMessage}</p>
            </CardHeader>
            <CardFooter>
              <Button variant="outline" onClick={() => window.history.back()}>
                Go Back
              </Button>
            </CardFooter>
          </Card>
        </main>
      </div>
    )
  }

  if (!preview) {
    return <SkeletonLoading />
  }

  const newCredits =
    CREDITS_USAGE_LIMITS[targetPlan === 'Pro' ? 'PRO' : 'MOAR_PRO']

  return (
    <div className="overflow-hidden">
      <BackgroundBeams />
      <main className="container mx-auto px-4 py-20 relative z-10">
        <Card className="max-w-2xl mx-auto">
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
                <li>• Overage allowed</li>
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
                    <span className="text-lg font-bold">Total due today</span>
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
                    {new Date(
                      preview.prorationDate * 1000
                    ).toLocaleDateString()}
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
              className="font-semibold text-lg"
            >
              Confirm Upgrade
            </NeonGradientButton>
          </CardFooter>
        </Card>
      </main>
    </div>
  )
}

export default ConfirmSubscriptionPage
