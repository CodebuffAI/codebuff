import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { calculateUsageAndBalance } from 'common/src/billing/balance-calculator'
import { triggerMonthlyResetAndGrant } from 'common/src/billing/grant-credits'

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

    // Prepare the response data
    const usageData = {
      usageThisCycle,
      balance,
      nextQuotaReset: effectiveQuotaResetDate,
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
