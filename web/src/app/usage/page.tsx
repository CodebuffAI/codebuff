'use server'

import { getServerSession } from 'next-auth'
import { authOptions } from '../api/auth/[...nextauth]/auth-options'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { getQuotaManager } from 'common/src/billing/quota-manager'
import { getNextQuotaReset } from 'common/util/dates'
import { UsageData } from 'common/src/types/usage'
import { OVERAGE_RATE_PRO } from 'common/constants'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { stripeServer } from 'common/src/util/stripe'

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

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8">
      <CardHeader>
        <CardTitle>Usage</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {creditsUsed > totalQuota && subscriptionActive && (
            <div className="p-4 mb-4 bg-yellow-100 dark:bg-blue-900 rounded-md space-y-2">
              {data.overageRate ? (
                <>
                  <p>
                    You have exceeded your monthly quota, but you can continue
                    using Codebuff. You will be charged an overage fee of $
                    {data.overageRate.toFixed(2)} per 100 additional credits.
                  </p>
                  <p className="mt-2">
                    Current overage bill:{' '}
                    <b>
                      $
                      {(
                        ((creditsUsed - totalQuota) / 100) *
                        data.overageRate
                      ).toFixed(2)}
                    </b>
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
            <span className="font-semibold">Quota resets:</span>
            <p>{nextQuotaReset.toDateString()}</p>
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

  // Get user's subscription from Stripe
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, session.user.id),
    columns: {
      stripe_customer_id: true,
      stripe_price_id: true,
    },
  })

  let overageRate: number | null = null
  if (user?.stripe_customer_id && user?.stripe_price_id) {
    const subscriptions = await stripeServer.subscriptions.list({
      customer: user.stripe_customer_id,
      status: 'active',
      limit: 1,
    })

    if (subscriptions.data[0]?.id) {
      const subscription = await stripeServer.subscriptions.retrieve(
        subscriptions.data[0].id,
        {
          expand: ['items.data.price.tiers'],
        }
      )

      // Get the metered price item which contains our overage rate
      const meteredPrice = subscription.items.data.find(
        (item) => item.price.recurring?.usage_type === 'metered'
      )

      if (meteredPrice?.price.tiers) {
        for (const tier of meteredPrice.price.tiers) {
          if (tier.up_to === null || q.creditsUsed <= tier.up_to) {
            if (tier.unit_amount_decimal) {
              overageRate = parseFloat(tier.unit_amount_decimal)
              break
            }
          }
        }
      }
    }
  }

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
