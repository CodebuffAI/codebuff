'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { UsageData, usageDataSchema } from 'common/src/types/usage'
import { match, P } from 'ts-pattern'

const UsagePage = () => {
  const queryResult = useQuery<UsageData>({
    queryKey: ['usage'],
    queryFn: async () => {
      const response = await fetch('/api/usage')
      if (!response.ok) {
        throw new Error('Failed to fetch usage data')
      }

      const responseData = await response.json()
      return usageDataSchema.parse(responseData)
    },
  })

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8">
      <CardHeader>
        <CardTitle>Usage</CardTitle>
      </CardHeader>
      <CardContent>
        {match(queryResult)
          .with(
            {
              error: P.nonNullable,
            },
            ({ error }) => {
              return <div>An error occurred: {error.message}</div>
            }
          )
          .with(
            {
              isLoading: true,
              data: P.nullish,
            },
            () => (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
            )
          )
          .with(
            {
              data: P.nonNullable,
              error: P.nullish,
            },
            ({
              data: {
                creditsUsed,
                totalQuota,
                remainingCredits,
                billingCycleEnd,
                subscriptionActive,
              },
            }) => {
              return (
                <div className="space-y-4">
                  {creditsUsed > totalQuota && subscriptionActive && (
                    <div className="p-4 mb-4 bg-blue-100 dark:bg-blue-900 rounded-md">
                      <p>
                        You have exceeded your monthly quota, but you can
                        continue using Manicode. You will be charged an overage
                        fee of $0.90 per 100 additional credits.
                      </p>
                      <p className="mt-2">
                        Current overage: $
                        {(
                          Math.ceil((creditsUsed - totalQuota) / 100) * 0.9
                        ).toFixed(2)}
                      </p>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Remaining credits:</span>
                    <span>
                      <b>{remainingCredits.toLocaleString('en-US')}</b>
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Credits used:</span>
                    <span>{creditsUsed.toLocaleString('en-US')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Quota:</span>
                    <span>{totalQuota.toLocaleString('en-US')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Billing cycle end:</span>
                    <span>{billingCycleEnd.toLocaleDateString()}</span>
                  </div>
                </div>
              )
            }
          )
          .otherwise(() => (
            <></>
          ))}
      </CardContent>
    </Card>
  )
}

export default UsagePage
