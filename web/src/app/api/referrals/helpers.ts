import { eq, sql, or, and } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { CREDITS_REFERRAL_BONUS } from 'common/src/constants'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { hasMaxedReferrals } from 'common/util/server/referral'
import { stripeServer } from 'common/src/util/stripe'
import { GRANT_PRIORITIES } from 'common/src/billing/balance-calculator'
import { logger } from '@/util/logger'
import {
  createStripeMonetaryAmount,
  getUserCostPerCredit,
} from 'common/src/billing/conversion'
import Stripe from 'stripe'

/**
 * Helper function to create a Stripe credit grant for a referral.
 * NOTE: stripeAmountObject should already be calculated based on the granting user's rate.
 */
async function grantReferralStripeCredit(
  userId: string, // The user receiving the grant
  stripeCustomerId: string,
  role: 'referrer' | 'referred',
  referrerId: string,
  referredId: string,
  localOperationId: string,
  stripeAmountObject: Stripe.Billing.CreditGrantCreateParams.Amount
): Promise<Stripe.Billing.CreditGrant | null> {
  try {
    const grant = await stripeServer.billing.creditGrants.create({
      amount: stripeAmountObject, // Use the provided monetary amount object
      customer: stripeCustomerId,
      category: 'promotional',
      applicability_config: {
        scope: {
          price_type: 'metered',
        },
      },
      metadata: {
        type: 'referral',
        priority: GRANT_PRIORITIES.referral.toString(),
        referrer_user_id: referrerId,
        referred_user_id: referredId,
        local_operation_id: localOperationId,
        // Add the user_id receiving the grant for webhook processing
        user_id: userId,
      },
    })
    logger.info(
      {
        userId,
        role,
        grantId: grant.id,
        stripeAmountObject: stripeAmountObject,
      },
      'Stripe credit grant created successfully for referral'
    )
    return grant
  } catch (e) {
    logger.error({ error: e, userId, role }, 'Stripe grant creation failed')
    return null
  }
}

/**
 * Processes a single user (referrer or referred) for referral credit granting.
 * Fetches cost per credit, calculates monetary amount, and calls Stripe grant creation.
 * Throws errors on validation failures which will rollback the transaction.
 */
async function processAndGrantReferralCredit(
  userToGrant: { id: string; stripe_customer_id: string | null },
  role: 'referrer' | 'referred',
  creditsToGrant: number,
  referrerId: string,
  referredId: string,
  localOperationId: string
): Promise<Stripe.Billing.CreditGrant | null> {
  // 1. Validate user and Stripe customer ID
  if (!userToGrant || !userToGrant.stripe_customer_id) {
    logger.error(
      { userId: userToGrant?.id, role },
      `User not found or missing Stripe customer ID for ${role}.`
    )
    throw new Error(`User setup issue for ${role}.`)
  }

  // 2. Get user-specific cost per credit
  const centsPerCredit = await getUserCostPerCredit(userToGrant.id)
  if (centsPerCredit <= 0) {
    logger.error(
      { userId: userToGrant.id, role, centsPerCredit },
      `Invalid centsPerCredit for ${role}, cannot create grant.`
    )
    throw new Error(`${role} cost per credit is invalid.`)
  }

  // 3. Create Stripe monetary amount object
  const stripeAmountObject = createStripeMonetaryAmount(
    creditsToGrant,
    centsPerCredit
  )
  if (!stripeAmountObject || stripeAmountObject.monetary.value <= 0) {
    logger.error(
      {
        userId: userToGrant.id,
        role,
        creditsToGrant,
        centsPerCredit,
        stripeAmountObject,
      },
      `Referral bonus amount resulted in invalid monetary value for ${role}, skipping Stripe grant.`
    )
    throw new Error(
      `Invalid referral bonus amount for ${role}, cannot create Stripe grant.`
    )
  }

  // 4. Call the grant creation helper
  return grantReferralStripeCredit(
    userToGrant.id,
    userToGrant.stripe_customer_id,
    role,
    referrerId,
    referredId,
    localOperationId,
    stripeAmountObject
  )
}

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
            "This referral code doesn't exist! Try again or reach out to support@codebuff.com if the problem persists.",
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

    // Find the referrer user object (needed for the helper)
    const referrer = await db.query.user.findFirst({
      where: eq(schema.user.referral_code, referralCode),
      columns: { id: true, stripe_customer_id: true },
    })
    // Initial validation (redundant with helper but good for early exit)
    if (!referrer || !referrer.stripe_customer_id) {
      logger.warn(
        { referralCode, referrerId: referrer?.id },
        'Referrer not found or missing Stripe customer ID.'
      )
      return NextResponse.json(
        { error: 'Invalid referral code or referrer setup issue.' },
        { status: 400 }
      )
    }

    // Find the referred user object (needed for the helper)
    const referred = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: { id: true, stripe_customer_id: true },
    })
    // Initial validation (redundant with helper but good for early exit)
    if (!referred || !referred.stripe_customer_id) {
      logger.warn(
        { userId },
        'Referred user not found or missing Stripe customer ID during referral redemption.'
      )
      return NextResponse.json(
        { error: 'User not found or setup issue.' },
        { status: 404 }
      )
    }

    // Check if the referrer has maxed out their referrals
    const referralStatus = await hasMaxedReferrals(referrer.id)
    if (referralStatus.reason) {
      return NextResponse.json(
        { error: referralStatus.details?.msg || referralStatus.reason },
        { status: 400 }
      )
    }

    await db.transaction(async (tx) => {
      // 1. Create the referral record locally
      const now = new Date()
      const referralRecord = await tx
        .insert(schema.referral)
        .values({
          referrer_id: referrer.id,
          referred_id: userId, // userId is referred.id
          status: 'completed',
          credits: CREDITS_REFERRAL_BONUS, // Store internal credit amount locally
          created_at: now,
          completed_at: now,
        })
        .returning({
          operation_id: sql<string>`'local-ref-' || gen_random_uuid()`,
        })

      const localOperationId = referralRecord[0].operation_id

      // 2. Process and grant credits for both users using the new helper
      const grantPromises = []

      // Process Referrer
      grantPromises.push(
        processAndGrantReferralCredit(
          referrer,
          'referrer',
          CREDITS_REFERRAL_BONUS,
          referrer.id,
          referred.id,
          localOperationId
        )
      )

      // Process Referred User
      grantPromises.push(
        processAndGrantReferralCredit(
          referred,
          'referred',
          CREDITS_REFERRAL_BONUS,
          referrer.id,
          referred.id,
          localOperationId
        )
      )

      const results = await Promise.all(grantPromises)

      // Check if any grant creation failed (helper returns null on success/failure, throws on validation error)
      if (results.some((result) => result === null)) {
        logger.error(
          { localOperationId, referrerId: referrer.id, referredId: userId },
          'One or more Stripe credit grants failed (API error). Rolling back transaction.'
        )
        // Error thrown by helper for validation issues already rolled back.
        // This handles Stripe API errors returned as null by grantReferralStripeCredit.
        throw new Error('Failed to create Stripe credit grants for referral.')
      } else {
        logger.info(
          { localOperationId, referrerId: referrer.id, referredId: userId },
          'Stripe credit grants initiated successfully for referral.'
        )
      }
    }) // End transaction

    // If transaction succeeded
    return NextResponse.json(
      {
        message: 'Referral applied successfully!',
        credits_awarded: CREDITS_REFERRAL_BONUS, // Report internal credits awarded
      },
      {
        status: 200,
      }
    )
  } catch (error) {
    logger.error(
      { userId, referralCode, error },
      'Error applying referral code'
    )
    const errorMessage =
      error instanceof Error ? error.message : 'Internal Server Error'
    // Make specific error messages user-facing if they originate from our checks/helpers
    const userFacingError =
      errorMessage.includes('Stripe credit grants') ||
      errorMessage.includes('cost per credit') ||
      errorMessage.includes('bonus amount') ||
      errorMessage.includes('User setup issue')
        ? errorMessage
        : 'Failed to apply referral code. Please try again later.'
    return NextResponse.json({ error: userFacingError }, { status: 500 })
  }
}
