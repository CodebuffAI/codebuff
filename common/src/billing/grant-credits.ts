import { stripeServer } from '../util/stripe'
import { GRANT_PRIORITIES } from './balance-calculator'
import { logger } from '../util/logger'
import { createStripeMonetaryAmount, getUserCostPerCredit } from './conversion'
import type Stripe from 'stripe'
import db from '../db'
import * as schema from '../db/schema'

/**
 * Helper function to create a Stripe credit grant for a referral.
 * NOTE: stripeAmountObject should already be calculated based on the granting user's rate.
 */
async function grantStripeCredit(
  userId: string, // The user receiving the grant
  stripeCustomerId: string,
  grantType: 'free' | 'referral',
  operationId: string,
  stripeAmountObject: Stripe.Billing.CreditGrantCreateParams.Amount,
  metadata: Record<string, string> = {}
): Promise<Stripe.Billing.CreditGrant | null> {
  try {
    const grant = await stripeServer.billing.creditGrants.create({
      amount: stripeAmountObject,
      customer: stripeCustomerId,
      category: 'promotional',
      applicability_config: {
        scope: {
          price_type: 'metered',
        },
      },
      metadata: {
        type: grantType,
        priority: GRANT_PRIORITIES[grantType].toString(),
        local_operation_id: operationId,
        user_id: userId,
        ...metadata,
      },
    })
    logger.info(
      {
        userId,
        grantType,
        grantId: grant.id,
        stripeAmountObject,
      },
      'Stripe credit grant created successfully'
    )
    return grant
  } catch (e) {
    logger.error(
      { error: e, userId, grantType },
      'Stripe grant creation failed'
    )
    return null
  }
}

/**
 * Processes a credit grant for a user.
 * Creates both local and Stripe grants.
 * Returns a promise that resolves when both operations are complete.
 */
export async function grantCredit(
  userToGrant: { id: string; stripe_customer_id: string | null },
  grantType: 'free' | 'referral',
  creditsToGrant: number,
  operationId: string,
  expiresAt?: Date | null,
  metadata: Record<string, string> = {}
): Promise<void> {
  // Create local grant first
  await db.insert(schema.creditGrants).values({
    operation_id: operationId,
    user_id: userToGrant.id,
    amount: creditsToGrant,
    type: grantType,
    priority: GRANT_PRIORITIES[grantType],
    expires_at: expiresAt,
  })

  // If user has Stripe customer ID, create Stripe grant
  if (userToGrant.stripe_customer_id) {
    // 1. Get user-specific cost per credit
    const centsPerCredit = await getUserCostPerCredit(userToGrant.id)
    if (centsPerCredit <= 0) {
      logger.error(
        { userId: userToGrant.id, grantType, centsPerCredit },
        `Invalid centsPerCredit for ${grantType}, cannot create grant.`
      )
      throw new Error(`Cost per credit is invalid for ${grantType} grant.`)
    }

    // 2. Create Stripe monetary amount object
    const stripeAmountObject = createStripeMonetaryAmount(
      creditsToGrant,
      centsPerCredit
    )
    if (!stripeAmountObject || stripeAmountObject.monetary.value <= 0) {
      logger.error(
        {
          userId: userToGrant.id,
          grantType,
          creditsToGrant,
          centsPerCredit,
          stripeAmountObject,
        },
        `Grant amount resulted in invalid monetary value for ${grantType}, skipping Stripe grant.`
      )
      throw new Error(
        `Invalid grant amount for ${grantType}, cannot create Stripe grant.`
      )
    }

    // 3. Call the grant creation helper
    await grantStripeCredit(
      userToGrant.id,
      userToGrant.stripe_customer_id,
      grantType,
      operationId,
      stripeAmountObject,
      metadata
    )
  }
}
