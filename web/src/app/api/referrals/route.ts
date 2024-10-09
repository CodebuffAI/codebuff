import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'

export type ReferralData = {
  referralCode: string
  referrals: (typeof schema.referral.$inferSelect)[]
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const referralData = await db
      .select({
        referral_code: schema.user.referral_code,
        referral: schema.referral,
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

    let referralCode = ''
    const referrals = referralData.reduce(
      (acc, data) => {
        if (data.referral_code) {
          referralCode = data.referral_code
        }
        if (data.referral) {
          acc.push(data.referral)
        }
        return acc
      },
      [] as ReferralData['referrals']
    )

    return NextResponse.json({
      referralCode,
      referrals,
    } satisfies ReferralData)
  } catch (error) {
    console.error('Error fetching referral data:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
