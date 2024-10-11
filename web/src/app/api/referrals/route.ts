import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, sql, or } from 'drizzle-orm'
import { CREDITS_REFERRAL_BONUS } from 'common/constants'
import { z } from 'zod'
import { hasMaxedReferrals, MAX_REFERRALS } from 'common/util/server/referral'

type Referral = Pick<typeof schema.user.$inferSelect, 'id' | 'name' | 'email'> &
  Pick<typeof schema.referral.$inferSelect, 'credits'>
const ReferralSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  credits: z.coerce.number(),
})

export type ReferralData = {
  referralCode: string
  referrals: Referral[]
  referredBy?: Referral
  limitReached: boolean
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

    // Who did this user refer?
    const referralsQuery = db
      .select({
        id: schema.referral.referred_id,
        credits: schema.referral.credits,
        // credits: sql`SUM(${schema.referral.credits})`.as('credits'),
      })
      .from(schema.referral)
      .where(eq(schema.referral.referrer_id, session.user.id))
      // .groupBy(schema.referral.referred_id)
      .as('referralsQuery')
    const referrals = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        credits: referralsQuery.credits,
      })
      .from(referralsQuery)
      .leftJoin(schema.user, eq(schema.user.id, referralsQuery.id))

    // Who referred this user?
    const referredByIdQuery = db
      .select({
        id: schema.referral.referrer_id,
        credits: schema.referral.credits,
        // credits: sql`SUM(${schema.referral.credits})`.as('credits'),
      })
      .from(schema.referral)
      .where(eq(schema.referral.referred_id, session.user.id))
      // .groupBy(schema.referral.referrer_id)
      .limit(1)
      .as('referredByIdQuery')
    const referredBy = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        credits: referredByIdQuery.credits,
      })
      .from(referredByIdQuery)
      .leftJoin(schema.user, eq(schema.user.id, referredByIdQuery.id))
      .limit(1)
      .then((users) => {
        if (users.length !== 1) {
          return
        }
        return ReferralSchema.parse(users[0])
      })

    const referralData: ReferralData = {
      referralCode,
      referrals: referrals.reduce((acc, referral) => {
        const result = ReferralSchema.safeParse(referral)
        if (result.success) {
          acc.push(result.data)
        }
        return acc
      }, [] as Referral[]),
      referredBy,
      limitReached: referrals.length >= MAX_REFERRALS,
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
  const userId = session?.user?.id
  if (!session || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { referralCode } = await request.json()
  try {
    // Check if the user has already used a referral code
    const existingReferral = await db
      .select()
      .from(schema.referral)
      .where(eq(schema.referral.referred_id, userId))
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
      .where(eq(schema.user.id, userId))
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
    const referrers = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.referral_code, referralCode))
      .limit(1)

    if (referrers.length !== 1) {
      return NextResponse.json(
        { error: 'Invalid referral code' },
        { status: 400 }
      )
    }
    const referrer = referrers[0]

    // Check if the referrer has maxed out their referrals
    const referralStatus = await hasMaxedReferrals(referrer.id)
    if (referralStatus.reason) {
      return NextResponse.json(
        { error: referralStatus.reason },
        { status: 400 }
      )
    }

    await db.transaction(async (tx) => {
      // Create the referral
      await tx.insert(schema.referral).values({
        referrer_id: referrer.id,
        referred_id: userId,
        status: 'completed',
        credits: CREDITS_REFERRAL_BONUS,
        created_at: new Date(),
        completed_at: new Date(),
      })

      // Update both users' quota
      await tx
        .update(schema.user)
        .set({
          quota: sql<number>`${schema.user.quota} + ${CREDITS_REFERRAL_BONUS}`,
        })
        .where(or(eq(schema.user.id, referrer.id), eq(schema.user.id, userId)))
    })

    return NextResponse.json(
      {
        credits_redeemed: CREDITS_REFERRAL_BONUS,
      },
      {
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error applying referral code:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
