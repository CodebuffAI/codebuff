import { getServerSession } from 'next-auth'
import { authOptions } from '../api/auth/[...nextauth]/auth-options'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { UsageData, usageDataSchema } from 'common/src/types/usage'
import { match, P } from 'ts-pattern'

const UsagePage = async () => {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in to view usage</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Please sign in to view your usage statistics.</p>
        </CardContent>
        <SignInCardFooter />
      </Card>
    )
  }

  const quotaManager = getQuotaManager('authenticated', session.user.id)
  const { creditsUsed, quota: totalQuota, endDate: billingCycleEnd, subscription_active: subscriptionActive } = await quotaManager.checkQuota()
  const remainingCredits = Math.max(0, totalQuota - creditsUsed)
  const data = { creditsUsed, totalQuota, remainingCredits, billingCycleEnd, subscriptionActive }

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8">
      <CardHeader>
        <CardTitle>Usage</CardTitle>
      </CardHeader>
      <CardContent>
        {(() => {
        const {
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
      })()}
      </CardContent>
    </Card>
  )
}

export default UsagePage
