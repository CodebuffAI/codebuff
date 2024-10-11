import { eq, sql, or } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { CREDITS_REFERRAL_BONUS } from 'common/constants'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { hasMaxedReferrals } from 'common/util/server/referral'

export async function redeemReferralCode(referralCode: string, userId: string) {
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
