import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import { eq } from 'drizzle-orm'
import * as schema from 'common/db/schema'
import { calculateUsageAndBalance } from 'common/src/billing/balance-calculator'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    // Fetch user's quota reset date
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        next_quota_reset: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Calculate both usage and balance in one operation
    const { usageThisCycle, balance } = await calculateUsageAndBalance(
      userId,
      user.next_quota_reset ?? new Date(0)
    )

    // Prepare the response data
    const usageData = {
      usageThisCycle,
      balance,
      nextQuotaReset: user.next_quota_reset,
    }

    return NextResponse.json(usageData)

  } catch (error) {
    console.error('Error fetching user usage data:', error)
    return NextResponse.json(
      { error: 'Internal Server Error fetching usage data' },
      { status: 500 }
    )
  }
}