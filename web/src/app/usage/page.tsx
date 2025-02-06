import { getServerSession } from 'next-auth'
import { authOptions } from '../api/auth/[...nextauth]/auth-options'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { AuthenticatedQuotaManager } from 'common/src/billing/quota-manager'
import { getNextQuotaReset } from 'common/util/dates'
import { UsageData } from 'common/src/types/usage'
import { cn } from '@/lib/utils'

const SignInCard = () => (
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

const UsageDisplay = ({ data }: { data: UsageData }) => {
  const { creditsUsed, totalQuota, nextQuotaReset, subscriptionActive } = data
  const remainingCredits = Math.max(0, totalQuota - creditsUsed)
  const usagePercentage = Math.min(100, (creditsUsed / totalQuota) * 100)

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Usage Statistics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Usage Bar */}
        <div className="space-y-2">
          <div className="h-4 bg-secondary rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all duration-500",
                usagePercentage > 90 ? "bg-red-500" :
                usagePercentage > 75 ? "bg-yellow-500" :
                "bg-blue-500"
              )}
              style={{ width: `${usagePercentage}%` }}
            />
          </div>
          <p className="text-sm text-muted-foreground text-right">
            {usagePercentage.toFixed(1)}% used
          </p>
        </div>

        {creditsUsed > totalQuota && subscriptionActive && (
          <div className="p-4 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 space-y-2">
            {data.overageRate ? (
              <>
                <p>
                  You have exceeded your monthly quota, but you can continue
                  using Codebuff. You will be charged an overage fee of $
                  {data.overageRate.toFixed(2)} per 100 additional credits.
                </p>
                <p className="font-semibold">
                  Current overage bill:{' '}
                  <span className="text-yellow-700 dark:text-yellow-400">
                    ${(((creditsUsed - totalQuota) / 100) * data.overageRate).toFixed(2)}
                  </span>
                </p>
              </>
            ) : (
              <p>
                You have exceeded your monthly quota, but you can continue
                using Codebuff.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4">
          <div className="flex justify-between items-center p-4 rounded-lg bg-card/50">
            <span className="font-medium">Remaining credits</span>
            <span className="text-xl font-bold">
              {remainingCredits.toLocaleString('en-US')}
            </span>
          </div>

          <div className="flex justify-between items-center p-4 rounded-lg bg-card/50">
            <span className="font-medium">Credits used</span>
            <span className="text-xl">
              {creditsUsed.toLocaleString('en-US')}
            </span>
          </div>

          <div className="flex justify-between items-center p-4 rounded-lg bg-card/50">
            <span className="font-medium">Total quota</span>
            <span className="text-xl">
              {totalQuota.toLocaleString('en-US')}
            </span>
          </div>

          <div className="flex justify-between items-center p-4 rounded-lg bg-card/50">
            <span className="font-medium">Quota resets</span>
            <span>{nextQuotaReset.toLocaleDateString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const UsagePage = async () => {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return <SignInCard />
  }

  const quotaManager = new AuthenticatedQuotaManager()
  let q = await quotaManager.checkQuota(session.user.id)
  if (q.endDate < new Date()) {
    const nextQuotaReset = getNextQuotaReset(q.endDate)
    await quotaManager.setNextQuota(session.user.id, false, nextQuotaReset)
    q = await quotaManager.checkQuota(session.user.id)
  }
  const { overageRate } = await quotaManager.getStripeSubscriptionQuota(
    session.user.id
  )

  const usageData: UsageData = {
    creditsUsed: q.creditsUsed,
    totalQuota: q.quota,
    remainingCredits: q.quota - q.creditsUsed,
    nextQuotaReset: q.endDate,
    subscriptionActive: q.subscription_active,
    overageRate,
  }

  return <UsageDisplay data={usageData} />
}

export default UsagePage
