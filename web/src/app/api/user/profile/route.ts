import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import { eq } from 'drizzle-orm'
import * as schema from 'common/db/schema'

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
      },
    })

    if (!user) {
      // Should not happen if session is valid, but good practice
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      handle: user.handle,
      referralCode: user.referral_code,
      auto_topup_enabled: user.auto_topup_enabled ?? false,
      auto_topup_threshold: user.auto_topup_threshold ?? 500,
      auto_topup_target_balance: user.auto_topup_target_balance ?? 2000,
    })
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}