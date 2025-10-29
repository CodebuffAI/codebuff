import { getUserUsageData } from '@codebuff/billing'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    // Use the new consolidated usage service
    const usageData = await getUserUsageData({ userId, logger })

    return NextResponse.json(usageData)
  } catch (error) {
    console.error('Error fetching usage data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
