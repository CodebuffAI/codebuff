import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import { eq } from 'drizzle-orm'
import * as schema from 'common/db/schema'
import { calculateCurrentBalance } from 'common/src/billing/balance-calculator'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    // Fetch user's usage and quota reset date
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        usage: true,
        next_quota_reset: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Calculate the current balance
    const balance = await calculateCurrentBalance(userId)

    // Prepare the response data
    const usageData = {
      usageThisCycle: user.usage ?? 0, // Default to 0 if null
      balance: balance, // This already has totalRemaining and breakdown
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