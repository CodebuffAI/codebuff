import {
  getReferralScore,
  redeemReferralCode,
  REDEEM_REFERRAL_ERROR_MESSAGES,
  REDEEM_REFERRAL_ERROR_STATUS,
} from '@codebuff/billing/referral-program'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod/v4'

import { authOptions } from '../auth/[...nextauth]/auth-options'

import { logger } from '@/util/logger'

type Referral = Pick<typeof schema.user.$inferSelect, 'id' | 'name' | 'email'> &
  Pick<typeof schema.referral.$inferSelect, 'credits' | 'is_legacy'>
const ReferralSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  credits: z.coerce.number(),
  is_legacy: z.boolean().default(false),
})

export type ReferralData = {
  referrals: Referral[]
  referredBy?: Referral
  /** Completed v2 referrals made + 1 if the user was referred (and completed). */
  referralScore: number
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Who did this user refer?
    const referralsQuery = db
      .select({
        id: schema.referral.referred_id,
        credits: schema.referral.credits,
        is_legacy: schema.referral.is_legacy,
      })
      .from(schema.referral)
      .where(eq(schema.referral.referrer_id, session.user.id))
      .as('referralsQuery')
    const referrals = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        credits: referralsQuery.credits,
        is_legacy: referralsQuery.is_legacy,
      })
      .from(referralsQuery)
      .leftJoin(schema.user, eq(schema.user.id, referralsQuery.id))

    // Who referred this user?
    const referredByIdQuery = db
      .select({
        id: schema.referral.referrer_id,
        credits: schema.referral.credits,
        is_legacy: schema.referral.is_legacy,
      })
      .from(schema.referral)
      .where(eq(schema.referral.referred_id, session.user.id))
      .limit(1)
      .as('referredByIdQuery')
    const referredBy = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        credits: referredByIdQuery.credits,
        is_legacy: referredByIdQuery.is_legacy,
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

    const referralScore = await getReferralScore({ userId: session.user.id })

    const referralData: ReferralData = {
      referrals: referrals.reduce((acc, referral) => {
        const result = ReferralSchema.safeParse(referral)
        if (result.success) {
          acc.push(result.data)
        }
        return acc
      }, [] as Referral[]),
      referredBy,
      referralScore,
    }

    return NextResponse.json(referralData)
  } catch (error) {
    console.error('Error fetching referral data:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    )
  }
}

const RedeemBodySchema = z.object({
  referralCode: z.string().min(1).max(100),
})

/**
 * Redeem a referral code for the signed-in user. Creates a PENDING referral —
 * no reward is granted until the referred user passes the qualification +
 * activation gate (evaluated automatically after freebuff usage).
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = RedeemBodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Missing or invalid referralCode' },
      { status: 400 },
    )
  }

  const result = await redeemReferralCode({
    userId: session.user.id,
    referralCode: parsed.data.referralCode,
    logger,
  })

  if (!result.ok) {
    return NextResponse.json(
      {
        error: REDEEM_REFERRAL_ERROR_MESSAGES[result.error],
        code: result.error,
      },
      { status: REDEEM_REFERRAL_ERROR_STATUS[result.error] },
    )
  }
  return NextResponse.json({ status: 'pending', referrerId: result.referrerId })
}
