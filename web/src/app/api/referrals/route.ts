import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod/v4'

import { redeemReferralCode } from './helpers'
import { authOptions } from '../auth/[...nextauth]/auth-options'

import type { NextRequest } from 'next/server'

import { extractApiKeyFromHeader } from '@/util/auth'


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
  referralCode: string
  referrals: Referral[]
  referredBy?: Referral
  referralLimit: number
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
        `No referral code found for user with id ${session.user.id}`,
      )
    }

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
      referralLimit: user.referral_limit,
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

export async function POST(request: NextRequest) {
  try {
    // First try to get the session (web flow)
    const session = await getServerSession(authOptions)
    if (session?.user?.id) {
      const { referralCode } = await request.json()
      if (!referralCode) {
        return NextResponse.json(
          { error: 'Missing referral code' },
          { status: 400 },
        )
      }
      return redeemReferralCode(referralCode, session.user.id)
    }
  } catch (error) {
    console.error('Error processing referral:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }

  // Fall back to auth token (CLI flow)
  // Prefer Authorization header, fall back to body authToken for backwards compatibility
  const reqJson = await request.json()
  const parsedJson = z
    .object({
      referralCode: z.string(),
      // DEPRECATED: authToken in body is for backwards compatibility with older CLI versions.
      // New clients should use the Authorization header instead.
      authToken: z.string().optional(),
    })
    .safeParse(reqJson)

  if (!parsedJson.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { referralCode, authToken: bodyAuthToken } = parsedJson.data

  // Prefer Authorization header, fall back to body authToken for backwards compatibility
  const authToken = extractApiKeyFromHeader(request) ?? bodyAuthToken

  if (!authToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await db.query.session.findFirst({
    where: eq(schema.session.sessionToken, authToken),
    columns: {
      userId: true,
    },
  })

  if (!user?.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return redeemReferralCode(referralCode, user.userId)
}
