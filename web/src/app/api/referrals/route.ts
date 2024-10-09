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
    const referralData = await db
      .select({
        referral_code: schema.user.referral_code,
        referrals: schema.referral,
      })
      .from(schema.user)
      .leftJoin(
        schema.referral,
        eq(schema.user.id, schema.referral.referrer_id)
      )
      .where(eq(schema.user.id, session.user.id))
      .then((result) => {
        if (result.length === 0) {
          throw new Error(`No referral code found for user ${session.user?.id}`)
        }

        return result
      })

    const referrals = referralData.map((data) => data.referrals)

    return NextResponse.json({
      referralCode: referralData[0].referral_code,
      referrals,
    })
  } catch (error) {
    console.error('Error fetching referral data:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
