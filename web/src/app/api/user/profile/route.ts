import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import { eq } from 'drizzle-orm'
import * as schema from 'common/db/schema'
import { logger } from '@/util/logger'
import { UserProfile } from '@/types/user'
import { checkAutoTopupAllowed } from 'common/src/billing/check-auto-topup'

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
        auto_topup_target_balance: true,
        stripe_customer_id: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { blockedReason: auto_topup_blocked_reason } = await checkAutoTopupAllowed(
      session.user.id,
      user.stripe_customer_id
    )

    // If auto top-up is enabled but blocked, disable it
    if (user.auto_topup_enabled && auto_topup_blocked_reason) {
      await db
        .update(schema.user)
        .set({ auto_topup_enabled: false })
        .where(eq(schema.user.id, session.user.id))
      
      logger.info(
        { userId: session.user.id, reason: auto_topup_blocked_reason },
        'Disabled auto top-up due to invalid payment method'
      )
    }

    const response: Partial<UserProfile> = {
      handle: user.handle,
      referral_code: user.referral_code,
      auto_topup_enabled: user.auto_topup_enabled && !auto_topup_blocked_reason, // Only show as enabled if not blocked
      auto_topup_threshold: user.auto_topup_threshold ?? 500,
      auto_topup_target_balance: user.auto_topup_target_balance ?? 2000,
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