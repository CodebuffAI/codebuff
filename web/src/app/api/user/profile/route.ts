import { validateAutoTopupStatus } from '@codebuff/billing'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import type { UserProfile } from '@/types/user'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, session.user.id),
      columns: {
        handle: true,
        referral_code: true,
        auto_topup_enabled: true,
        auto_topup_threshold: true,
        auto_topup_amount: true,
        created_at: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { blockedReason: auto_topup_blocked_reason } =
      await validateAutoTopupStatus({ userId: session.user.id, logger })

    const response: Partial<UserProfile> = {
      handle: user.handle,
      referral_code: user.referral_code,
      auto_topup_enabled: user.auto_topup_enabled && !auto_topup_blocked_reason,
      auto_topup_threshold: user.auto_topup_threshold ?? 500,
      auto_topup_amount: user.auto_topup_amount ?? 2000,
      auto_topup_blocked_reason,
      created_at: user.created_at,
    }

    return NextResponse.json(response)
  } catch (error) {
    logger.error(
      { error, userId: session.user.id },
      'Error fetching user profile'
    )
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
