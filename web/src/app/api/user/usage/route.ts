import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import { eq } from 'drizzle-orm'
import * as schema from 'common/db/schema'
import { calculateUsageAndBalance } from 'common/src/billing/balance-calculator'
import {
  getPlanFromPriceId,
  getMonthlyGrantForPlan,
} from 'common/src/billing/plans'
import { triggerMonthlyResetAndGrant } from 'common/src/billing/grant-credits'
import { env } from '@/env.mjs'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    const now = new Date()

    // Check if we need to reset quota and grant new credits
    const effectiveQuotaResetDate = await triggerMonthlyResetAndGrant(userId)

    // Use the canonical balance calculation function with the effective reset date
    const { usageThisCycle, balance } = await calculateUsageAndBalance(
      userId,
      effectiveQuotaResetDate,
      now
    )

    // Fetch user's current plan
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        stripe_price_id: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Calculate next monthly grant
    const currentPlan = getPlanFromPriceId(
      user.stripe_price_id,
      env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID,
      env.NEXT_PUBLIC_STRIPE_MOAR_PRO_PRICE_ID
    )
    const nextMonthlyGrant = await getMonthlyGrantForPlan(currentPlan, userId)

    // Prepare the response data
    const usageData = {
      usageThisCycle,
      balance,
      nextQuotaReset: effectiveQuotaResetDate,
      nextMonthlyGrant,
    }

    return NextResponse.json(usageData)
  } catch (error) {
    console.error('Error fetching usage data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
