import db from '../db'
import * as schema from '../db/schema'
import { eq } from 'drizzle-orm'
import { stripeServer } from '../util/stripe'
import { logger } from '../util/logger'
import { processAndGrantCredit } from './grant-credits'
import { calculateCurrentBalance } from './balance-calculator'
import { convertCreditsToUsdCents, getUserCostPerCredit } from './conversion'
import { generateCompactId } from '../util/string'
import { checkAutoTopupAllowed } from './check-auto-topup'

const MINIMUM_PURCHASE_CREDITS = 500 // Ensure consistency

/**
 * Checks if auto-top-up should be triggered and performs the purchase if needed.
 * @param userId The ID of the user.
 * @returns Promise<void>
 */
export async function checkAndTriggerAutoTopup(userId: string): Promise<void> {
  const logContext = { userId }

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        id: true,
        stripe_customer_id: true,
        auto_topup_enabled: true,
        auto_topup_threshold: true,
        auto_topup_target_balance: true,
      },
    })

    // Exit if user not found, auto-topup disabled, threshold/target not set, or no Stripe customer ID
    if (
      !user ||
      !user.auto_topup_enabled ||
      user.auto_topup_threshold === null ||
      user.auto_topup_target_balance === null ||
      !user.stripe_customer_id
    ) {
      return
    }

    // Check if auto top-up is allowed
    const { blockedReason, validPaymentMethod } =
      await checkAutoTopupAllowed(userId, user.stripe_customer_id)

    if (blockedReason || !validPaymentMethod) {
      // Disable auto-topup since we can't process it
      await db
        .update(schema.user)
        .set({ auto_topup_enabled: false })
        .where(eq(schema.user.id, userId))
      throw new Error(blockedReason || 'Auto top-up is not available.')
    }

    const threshold = user.auto_topup_threshold
    const targetBalance = user.auto_topup_target_balance

    // Calculate current balance
    const currentBalance = await calculateCurrentBalance(userId)

    // Check if balance is below threshold
    if (currentBalance.totalRemaining < threshold) {
      const amountToTopUp = targetBalance - currentBalance.totalRemaining

      // Double-check if the calculated top-up amount is sufficient
      if (amountToTopUp < MINIMUM_PURCHASE_CREDITS) {
        logger.warn(
          logContext,
          `Auto-top-up triggered but calculated amount ${amountToTopUp} is less than minimum ${MINIMUM_PURCHASE_CREDITS}. Skipping top-up. Check user settings.`
        )
        return
      }

      logger.info(
        {
          ...logContext,
          currentBalance: currentBalance.totalRemaining,
          threshold,
          targetBalance,
          amountToTopUp,
        },
        `Auto-top-up triggered for user ${userId}. Attempting to purchase ${amountToTopUp} credits.`
      )

      const customerId = user.stripe_customer_id
      const centsPerCredit = await getUserCostPerCredit(userId)
      const amountInCents = convertCreditsToUsdCents(
        amountToTopUp,
        centsPerCredit
      )

      if (amountInCents <= 0) {
        logger.error(
          { ...logContext, amountToTopUp, centsPerCredit },
          'Calculated zero or negative amount in cents for auto-top-up. Skipping.'
        )
        return
      }

      const operationId = `auto-${userId}-${generateCompactId()}`

      try {
        // Create and confirm a PaymentIntent directly
        const paymentIntent = await stripeServer.paymentIntents.create({
          amount: amountInCents,
          currency: 'usd',
          customer: customerId,
          payment_method: validPaymentMethod.id,
          off_session: true, // This is key - indicates this is a background charge
          confirm: true, // Immediately try to confirm the payment
          description: `Auto top-up: ${amountToTopUp.toLocaleString()} credits`,
          metadata: {
            userId,
            credits: amountToTopUp.toString(),
            operationId,
            grantType: 'purchase',
            type: 'auto-topup',
          },
        })

        if (paymentIntent.status === 'succeeded') {
          // Payment successful, grant credits
          await processAndGrantCredit(
            userId,
            amountToTopUp,
            'purchase',
            `Auto top-up of ${amountToTopUp.toLocaleString()} credits`,
            null,
            operationId,
            false // Don't create a separate Stripe grant since this is a direct purchase
          )

          logger.info(
            {
              ...logContext,
              operationId,
              paymentIntentId: paymentIntent.id,
              credits: amountToTopUp,
            },
            'Auto top-up payment succeeded and credits granted'
          )
        } else {
          // Payment failed or requires action
          logger.error(
            {
              ...logContext,
              paymentIntentId: paymentIntent.id,
              status: paymentIntent.status,
            },
            'Auto top-up payment failed or requires action'
          )
          // Disable auto-topup since we can't process it automatically
          await db
            .update(schema.user)
            .set({ auto_topup_enabled: false })
            .where(eq(schema.user.id, userId))
          throw new Error(
            'Payment failed. Please check your payment method and re-enable auto top-up.'
          )
        }
      } catch (stripeError: any) {
        logger.error(
          { ...logContext, error: stripeError.message },
          'Stripe error during auto-top-up'
        )
        // Disable auto-topup on stripe error
        await db
          .update(schema.user)
          .set({ auto_topup_enabled: false })
          .where(eq(schema.user.id, userId))
        throw new Error(
          'Payment failed. Please check your payment method and re-enable auto top-up.'
        )
      }
    }
  } catch (error) {
    logger.error(
      { ...logContext, error },
      `Error during auto-top-up check for user ${userId}`
    )
    // Re-throw the error so it can be handled by the middleware
    throw error
  }
}
