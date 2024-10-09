import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'

export type ReferralData = {
  referralCode: string
  referrals: (typeof schema.referral.$inferSelect & {
    referred: typeof schema.user.$inferSelect
  })[]
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // const user = await db.query.user.findMany({
    //   where: eq(schema.user.id, session.user.id),
    //   with: {
    //     referrals: {
    //       where: (referrals, { eq }) =>
    //         eq(referrals.referrer_id, session?.user?.id),
    //       with: {
    //         users: true,
    //       },
    //     },
    //   },
    // })
    const referrals = await db.query.referral.findMany({
      where: and(
        eq(schema.referral.referrer_id, session.user.id),
        eq(schema.referral.status, 'completed')
      ),
      with: {
        user: true,
      },
    })

    if (!referrals) {
      throw new Error(`No user found with id ${session.user.id}`)
    }

    const referralData: ReferralData = {
      referralCode: referrals.referral_code || '',
      referrals: referrals.referrals,
    }

    return NextResponse.json(referralData)
  } catch (error) {
    console.error('Error fetching referral data:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { referralCode } = await request.json()

    // Check if the user has already used a referral code
    const existingReferral = await db
      .select()
      .from(schema.referral)
      .where(eq(schema.referral.referred_id, session.user.id))
      .limit(1)

    if (existingReferral.length > 0) {
      return NextResponse.json(
        { error: 'You have already used a referral code' },
        { status: 429 }
      )
    }

    // Find the referrer user
    const referrer = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.referral_code, referralCode))
      .limit(1)

    if (referrer.length === 0) {
      return NextResponse.json(
        { error: 'Invalid referral code' },
        { status: 400 }
      )
    }

    // Create the referral
    await db.insert(schema.referral).values({
      referrer_id: referrer[0].id,
      referred_id: session.user.id,
      status: 'completed',
      created_at: new Date(),
      completed_at: new Date(),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error applying referral code:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
