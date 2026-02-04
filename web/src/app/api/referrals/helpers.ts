import { grantCreditOperation } from '@codebuff/billing'
import { CREDITS_REFERRAL_BONUS } from '@codebuff/common/old-constants'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { hasMaxedReferrals } from '@/lib/server/referral'
import { logger } from '@/util/logger'

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
        {
          error:
            "You've already been referred by someone. Each user can only be referred once.",
        },
        { status: 409 },
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
            "This referral code doesn't exist! Try again or reach out to support@codebuff.com if the problem persists.",
        },
        {
          status: 404,
        },
      )
    }
    if (referringUser.userId === userId) {
      return NextResponse.json(
        {
          error: "Nice try bud, you can't use your own referral code.",
        },
        {
          status: 400,
        },
      )
    }

    // Check if the user has been referred by someone they were referred by
    const doubleDipping = await db
      .select()
      .from(schema.referral)
      .where(
        and(
          eq(schema.referral.referrer_id, userId),
          eq(schema.referral.referred_id, referringUser.userId),
        ),
      )
      .limit(1)
    if (doubleDipping.length > 0) {
      return NextResponse.json(
        {
          error:
            'You were referred by this user already. No double dipping, refer someone new!',
        },
        { status: 409 },
      )
    }

    // Find the referrer user object
    const referrer = await db.query.user.findFirst({
      where: eq(schema.user.referral_code, referralCode),
      columns: { id: true },
    })
    if (!referrer) {
      logger.warn({ referralCode }, 'Referrer not found.')
      return NextResponse.json(
        { error: 'Invalid referral code.' },
        { status: 400 },
      )
    }

    // Find the referred user object
    const referred = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: { id: true },
    })
    if (!referred) {
      logger.warn(
        { userId },
        'Referred user not found during referral redemption.',
      )
      return NextResponse.json({ error: 'User not found.' }, { status: 404 })
    }

    // Check if the referrer has maxed out their referrals
    const referralStatus = await hasMaxedReferrals(referrer.id)
    if (referralStatus.reason) {
      return NextResponse.json(
        { error: referralStatus.details?.msg || referralStatus.reason },
        { status: 400 },
      )
    }

    await db.transaction(async (tx) => {
      // 1. Create the referral record locally (one-time referral, is_legacy: false)
      const now = new Date()
      const referralRecord = await tx
        .insert(schema.referral)
        .values({
          referrer_id: referrer.id,
          referred_id: userId,
          status: 'completed',
          credits: CREDITS_REFERRAL_BONUS,
          is_legacy: false,
          created_at: now,
          completed_at: now,
        })
        .returning({
          operation_id: sql<string>`'ref-' || gen_random_uuid()`,
        })

      const operationId = referralRecord[0].operation_id

      // 2. Process and grant credits for both users (one-time, never expires)
      const grantPromises = []

      const grantForUser = (user: { id: string; role: 'referrer' | 'referred' }) =>
        grantCreditOperation({
          userId: user.id,
          amount: CREDITS_REFERRAL_BONUS,
          type: 'referral',
          description: `Referral bonus (${user.role})`,
          expiresAt: null, // One-time referrals never expire
          operationId: `${operationId}-${user.role}`,
          tx,
          logger,
        })
          .then(() => true)
          .catch((error: Error) => {
            logger.error(
              {
                error,
                userId: user.id,
                role: user.role,
                creditsToGrant: CREDITS_REFERRAL_BONUS,
              },
              'Failed to process referral credit grant',
            )
            return false
          })

      grantPromises.push(grantForUser({ id: referrer.id, role: 'referrer' }))
      grantPromises.push(grantForUser({ id: referred.id, role: 'referred' }))

      const results = await Promise.all(grantPromises)

      // Check if any grant creation failed
      if (results.some((result: boolean) => !result)) {
        logger.error(
          { operationId, referrerId: referrer.id, referredId: userId },
          'One or more credit grants failed. Rolling back transaction.',
        )
        throw new Error('Failed to create credit grants for referral.')
      } else {
        logger.info(
          { operationId, referrerId: referrer.id, referredId: userId },
          'Credit grants created successfully for referral.',
        )
      }
    }) // End transaction

    // If transaction succeeded
    return NextResponse.json(
      {
        message: 'Referral applied successfully!',
        credits_redeemed: CREDITS_REFERRAL_BONUS,
      },
      {
        status: 200,
      },
    )
  } catch (error) {
    logger.error(
      { userId, referralCode, error },
      'Error applying referral code',
    )
    const _errorMessage =
      error instanceof Error ? error.message : 'Internal Server Error'
    return NextResponse.json(
      { error: 'Failed to apply referral code. Please try again later.' },
      { status: 500 },
    )
  }
}
