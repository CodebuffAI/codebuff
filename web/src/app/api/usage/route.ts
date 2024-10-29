import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/auth-options'
import { getQuotaManager } from 'common/src/billing/quota-manager'
import { UsageData } from 'common/src/types/usage'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const quotaManager = getQuotaManager('authenticated', userId)

  try {
    const { creditsUsed, quota, endDate, subscription_active } =
      await quotaManager.checkQuota()

    const usageData: UsageData = {
      creditsUsed,
      totalQuota: quota,
      remainingCredits: Math.max(0, quota - creditsUsed),
      billingCycleEnd: endDate,
      subscriptionActive: subscription_active,
    }

    return NextResponse.json(usageData)
  } catch (error) {
    console.error('Error fetching usage data:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
