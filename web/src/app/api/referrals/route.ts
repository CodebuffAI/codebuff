import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, session.user.id),
      columns: {
        referral_code: true,
      },
    })

    const referrals = await db.query.referral.findMany({
      where: eq(schema.referral.referrer_id, session.user.id),
    })

    return NextResponse.json({
      referralCode: user?.referral_code,
      referrals: referrals,
    })
  } catch (error) {
    console.error('Error fetching referral data:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
