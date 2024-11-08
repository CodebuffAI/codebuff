'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '../api/auth/[...nextauth]/auth-options'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { getQuotaManager } from 'common/src/billing/quota-manager'
import { getNextQuotaReset } from 'common/util/dates'

type UsageData = {
  creditsUsed: number
  totalQuota: number
  endDate: Date
  subscriptionActive: boolean
}

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
  const { creditsUsed, totalQuota, endDate, subscriptionActive } = data
  const remainingCredits = Math.max(0, totalQuota - creditsUsed)

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8">
      <CardHeader>
        <CardTitle>Usage</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {creditsUsed > totalQuota && subscriptionActive && (
            <div className="p-4 mb-4 bg-yellow-100 dark:bg-blue-900 rounded-md space-y-2">
              <p>
                You have exceeded your monthly quota, but you can continue using
                Manicode.
              </p>
              <p>
                You will be charged an overage fee of $0.90 per 100 additional
                credits.
              </p>
              <p className="mt-2">
                Current overage:{' '}
                <b>
                  $
                  {(Math.ceil((creditsUsed - totalQuota) / 100) * 0.9).toFixed(
                    2
                  )}
                </b>
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
            <p>{endDate.toDateString()}</p>
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

  const quotaManager = getQuotaManager('authenticated', session.user.id)
  let q = await quotaManager.checkQuota()
  if (q.endDate < new Date()) {
    // endDate is in the past, so reset the quota
    const nextQuotaReset = getNextQuotaReset(q.endDate)
    await quotaManager.setNextQuota(false, nextQuotaReset)

    // get their newly updated info
    q = await quotaManager.checkQuota()
  }

  const usageData: UsageData = {
    creditsUsed: q.creditsUsed,
    totalQuota: q.quota,
    endDate: q.endDate,
    subscriptionActive: q.subscription_active,
  }

  return <UsageDisplay data={usageData} />
}

export default UsagePage
