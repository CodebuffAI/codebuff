import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import {
  calculateUsageAndBalance,
  triggerMonthlyResetAndGrant,
  checkAndTriggerAutoTopup,
} from '@codebuff/billing'
import { logger } from '@/util/logger'

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

    // Check if we need to trigger auto top-up
    try {
      await checkAndTriggerAutoTopup(userId)
    } catch (error) {
      logger.error(
        { error, userId },
        'Error during auto top-up check in usage route'
      )
      // Continue execution to return usage data even if auto top-up fails
    }

    // Use the canonical balance calculation function with the effective reset date
    // Pass isPersonalContext: true to exclude organization credits from personal usage
    const { usageThisCycle, balance } = await calculateUsageAndBalance(
      userId,
      effectiveQuotaResetDate,
      now,
      undefined, // Use default db connection
      true // isPersonalContext: true to exclude organization credits
    )

    // Prepare the response data
    const usageData = {
      usageThisCycle,
      balance,
      nextQuotaReset: effectiveQuotaResetDate.toISOString(),
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
