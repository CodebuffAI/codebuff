import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, count } from 'drizzle-orm'

type Referral = Pick<typeof schema.user.$inferSelect, 'id' | 'name' | 'email'> &
  Pick<typeof schema.referral.$inferSelect, 'status'>

export type ReferralData = {
  referralCode: string
  referrals: Referral[]
  referredBy?: Referral
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, session.user.id),
    })

    const referralCode = user?.referral_code
    if (!referralCode) {
      throw new Error(
        `No referral code found for user with id ${session.user.id}`
      )
    }

    // who did this user refer?
    const referrals = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        status: schema.referral.status,
      })
      .from(schema.referral)
      .leftJoin(schema.user, eq(schema.referral.referrer_id, schema.user.id))
      .where(and(eq(schema.referral.referrer_id, session.user.id)))

    // who referrred this user?
    const referredBy = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        status: schema.referral.status,
      })
      .from(schema.referral)
      .leftJoin(schema.user, eq(schema.referral.referred_id, schema.user.id))
      .where(and(eq(schema.referral.referrer_id, session.user.id)))
      .limit(1)
      .then((referreds) => {
        if (referreds.length !== 1) {
          return
        }
        return referreds[0]
      })

    const referralData: ReferralData = {
      referralCode,
      referrals: referrals.reduce((acc, referrals) => {
        if (referrals) {
          acc.push(...referrals)
        }
        return acc
      }, [] as Referral[]),
      referredBy,
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

    // Check if the user is trying to use their own referral code
    const currentUser = await db
      .select({ referral_code: schema.user.referral_code })
      .from(schema.user)
      .where(eq(schema.user.id, session.user.id))
      .limit(1)

    if (currentUser[0]?.referral_code === referralCode) {
      return NextResponse.json(
        {
          error: "Nice try bud, you can't use your own referral code",
        },
        {
          status: 400,
        }
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

    // Check if the referral code has been used 5 times already
    const referralCount = await db
      .select({ value: count() })
      .from(schema.referral)
      .where(eq(schema.referral.referrer_id, session.user.id))

    if (referralCount[0].value >= 5) {
      return NextResponse.json(
        { error: 'Your referral code has reached its usage limit' },
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
