import db from '../db'
import * as schema from '../db/schema'
import { GrantType } from '../db/schema'
import { logger } from '../util/logger'
import {
  convertCreditsToUsdCents,
  createStripeMonetaryAmount,
  getUserCostPerCredit,
} from './conversion'
import { stripeServer } from '../util/stripe'
import { GRANT_PRIORITIES } from '../constants/grant-priorities'
import { eq } from 'drizzle-orm'
import { generateCompactId } from '../util/string'
import Stripe from 'stripe'

type CreditGrantSelect = typeof schema.creditGrants.$inferSelect

/**
 * Processes a credit grant request:
 * 1. Validates the user.
 * 2. Calculates the user's cost per credit.
 * 3. Creates a local grant record immediately.
 * 4. (Optional) Asynchronously creates a corresponding Stripe Billing Credit Grant if applicable.
 *
 * @param userId The ID of the user receiving the grant.
 * @param credits The number of credits to grant (must be positive).
 * @param type The type of grant (e.g., 'free', 'referral', 'purchase', 'admin', 'rollover').
 * @param description Optional description for the grant.
 * @param expiresAt Optional expiration date for the grant. Null means never expires.
 * @param operationId A unique identifier for this grant operation (UUID recommended). If not provided, one will be generated.
 * @param createStripeGrant Whether to attempt creating a corresponding Stripe grant (default: true, set to false for 'rollover').
 * @returns The created local grant record or null if an error occurred.
 */
export async function processAndGrantCredit(
  userId: string,
  credits: number,
  type: GrantType,
  description: string | null = null,
  expiresAt: Date | null = null,
  operationId: string | null = null,
  createStripeGrant: boolean = true
): Promise<CreditGrantSelect | null> {
  const opId = operationId || `${type}-${userId}-${generateCompactId()}`
  const logContext = { userId, credits, type, operationId: opId, expiresAt }

  if (credits <= 0) {
    logger.warn(
      logContext,
      'Attempted to grant non-positive credits. Skipping.'
    )
    return null
  }

  // 1. Validate user exists
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { id: true, stripe_customer_id: true },
  })

  if (!user) {
    logger.error(logContext, 'User not found for credit grant. Skipping.')
    return null
  }

  // 2. Get priority
  const priority = GRANT_PRIORITIES[type]

  // 3. Create local grant record immediately
  let localGrant: CreditGrantSelect | null = null
  try {
    const insertedGrants = await db
      .insert(schema.creditGrants)
      .values({
        operation_id: opId,
        user_id: userId,
        amount: credits,
        type: type,
        priority: priority,
        description: description,
        expires_at: expiresAt,
        stripe_grant_id: null, // Initially null, updated by webhook if Stripe grant created
      })
      .returning() // Return the inserted record

    localGrant = insertedGrants[0]
    if (!localGrant) {
      throw new Error('Failed to insert local credit grant or retrieve it.')
    }
    logger.info(
      logContext,
      `Successfully created local credit grant record ${opId}`
    )
  } catch (dbError) {
    logger.error(
      { ...logContext, error: dbError },
      'Database error creating local credit grant record.'
    )
    // Decide if we should still attempt Stripe grant? Probably not if DB fails.
    return null
  }

  // 4. Create Stripe grant
  if (createStripeGrant && user.stripe_customer_id) {
    try {
      const centsPerCredit = await getUserCostPerCredit(userId)
      const stripeAmount = createStripeMonetaryAmount(credits, centsPerCredit)

      if (!stripeAmount) {
        logger.error(
          logContext,
          'Could not calculate valid Stripe monetary amount. Skipping Stripe grant creation.'
        )
        return null
      }

      const params: Stripe.Billing.CreditGrantCreateParams = {
        customer: user.stripe_customer_id!,
        amount: stripeAmount,
        expires_at: expiresAt
          ? Math.floor(expiresAt.getTime() / 1000)
          : undefined,
        category:
          'customer_credit' as Stripe.Billing.CreditGrantCreateParams.Category,
        applicability_config: {
          scope:
            'customer' as Stripe.Billing.CreditGrantCreateParams.ApplicabilityConfig.Scope,
        },
        priority,
        metadata: {
          local_operation_id: opId,
          type: type,
          priority: priority.toString(), // Metadata values must be strings
          userId: userId, // Add userId for easier debugging in Stripe dashboard
          description: description ?? `Codebuff ${type} grant`,
        },
      }
      await stripeServer.billing.creditGrants.create(params)
      logger.info(
        logContext,
        `Successfully requested Stripe credit grant creation for ${opId}. Awaiting webhook confirmation.`
      )
    } catch (stripeError) {
      logger.error(
        { ...logContext, error: stripeError },
        `Error requesting Stripe credit grant creation for ${opId}.`
      )
      // TODO: Consider adding to a retry queue or alerting system if Stripe grant fails initially?
      // For now, we rely on the local grant record existing.
    }
  } else if (createStripeGrant && !user.stripe_customer_id) {
    logger.warn(
      logContext,
      `Skipping Stripe grant creation for ${opId} because user ${userId} has no Stripe customer ID.`
    )
  }

  return localGrant // Return the local grant record
}
