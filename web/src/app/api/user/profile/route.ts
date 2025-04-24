import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import { eq } from 'drizzle-orm'
import * as schema from 'common/db/schema'
import { logger } from '@/util/logger'
import { UserProfile } from '@/types/user'
import { validateAutoTopupStatus } from '@codebuff/billing'
import { env } from '@/env.mjs'

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
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { blockedReason: auto_topup_blocked_reason } = await validateAutoTopupStatus(
      session.user.id,
      env.NEXT_PUBLIC_APP_URL
    )

    const response: Partial<UserProfile> = {
      handle: user.handle,
      referral_code: user.referral_code,
      auto_topup_enabled: user.auto_topup_enabled && !auto_topup_blocked_reason,
      auto_topup_threshold: user.auto_topup_threshold ?? 500,
      auto_topup_amount: user.auto_topup_amount ?? 2000,
      auto_topup_blocked_reason,
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