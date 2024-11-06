import { eq, sql, or, and } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { CREDITS_REFERRAL_BONUS } from 'common/constants'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { hasMaxedReferrals } from 'common/util/server/referral'

export async function redeemReferralCode(referralCode: string, userId: string) {
  try {
    // Check if the user has already used this referral code
    const alreadyUsed = await db
      .select()
      .from(schema.referral)
      .where(eq(schema.referral.referred_id, userId))
      .limit(1)

    if (alreadyUsed.length > 0) {
      return NextResponse.json(
        { error: 'You have already used this referral code.' },
        { status: 429 }
      )
    }

    // Check if the user is trying to use their own referral code
    const referringUser = await db
      .select({ userId: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.referral_code, referralCode))
      .limit(1)
      .then((users) => {
        if (users.length === 1) {
          return users[0]
        }
        return
      })

    if (!referringUser) {
      return NextResponse.json(
        {
          error:
            "This referral code doesn't exist! Try again or reach out to support@manicode.ai if the problem persists.",
        },
        {
          status: 404,
        }
      )
    }
    if (referringUser.userId === userId) {
      return NextResponse.json(
        {
          error: "Nice try bud, you can't use your own referral code.",
        },
        {
          status: 400,
        }
      )
    }

    // Check if the user has been referred by someone they were referred by
    const doubleDipping = await db
      .select()
      .from(schema.referral)
      .where(
        and(
          eq(schema.referral.referrer_id, userId),
          eq(schema.referral.referred_id, referringUser.userId)
        )
      )
      .limit(1)
    if (doubleDipping.length > 0) {
      return NextResponse.json(
        {
          error:
            'You were referred by this user already. No double dipping, refer someone new!',
        },
        { status: 429 }
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
          quota_exceeded: false,
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
