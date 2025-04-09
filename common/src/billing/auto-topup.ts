import db from '../db'
import * as schema from '../db/schema'
import { eq } from 'drizzle-orm'
import { stripeServer } from '../util/stripe'
import { logger } from '../util/logger'
import { processAndGrantCredit } from './grant-credits' // Assuming this helper exists for Stripe grant creation
import { calculateCurrentBalance } from './balance-calculator'
import { convertCreditsToUsdCents, getUserCostPerCredit } from './conversion'

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
            `Auto-top-up triggered for user ${userId}, but calculated amount ${amountToTopUp} is less than minimum ${MINIMUM_PURCHASE_CREDITS}. Skipping top-up. Check configuration.`
        )
        // Consider disabling auto-topup or notifying the user about misconfiguration
        return;
      }


      logger.info(
        { ...logContext, currentBalance: currentBalance.totalRemaining, threshold, targetBalance, amountToTopUp },
        `Auto-top-up triggered for user ${userId}. Attempting to purchase ${amountToTopUp} credits.`
      )

      // --- Perform Stripe Purchase ---
      const customerId = user.stripe_customer_id
      const centsPerCredit = await getUserCostPerCredit(userId)
      const amountInCents = convertCreditsToUsdCents(amountToTopUp, centsPerCredit)

      if (amountInCents <= 0) {
          logger.error({...logContext, amountToTopUp, centsPerCredit}, "Calculated zero or negative amount in cents for auto-top-up. Skipping.");
          return;
      }

      try {
        // 1. Create an InvoiceItem for the charge
        const invoiceItem = await stripeServer.invoiceItems.create({
          customer: customerId,
          amount: amountInCents,
          currency: 'usd',
          description: `Automatic top-up: ${amountToTopUp.toLocaleString()} credits`,
          metadata: {
            credits: amountToTopUp,
            userId: userId,
            type: 'auto-topup',
          },
        })

        // 2. Create an Invoice to group the item(s)
        const invoice = await stripeServer.invoices.create({
          customer: customerId,
          auto_advance: true, // Automatically attempts payment
          collection_method: 'charge_automatically',
          description: 'Automatic credit top-up',
          metadata: {
            userId: userId,
            type: 'auto-topup',
          },
        })

        // --- BEGIN CHANGE ---
        // 3. Ensure invoice ID exists before attempting to pay
        if (!invoice.id) {
            logger.error({...logContext, customerId}, "Failed to create Stripe invoice for auto-top-up (invoice ID is missing). Skipping payment.");
            return;
        }

        // Attempt to pay the invoice immediately
        // Note: This requires a default payment method on the customer.
        const finalizedInvoice = await stripeServer.invoices.pay(invoice.id, {
            // Forgive if uncollectible? Decide policy. false is stricter.
            forgive: false,
        });
        // --- END CHANGE ---

        if (finalizedInvoice.status === 'paid') {
          logger.info(
            { ...logContext, invoiceId: finalizedInvoice.id, amount: finalizedInvoice.amount_paid },
            `Successfully charged user ${userId} for auto-top-up.`
          )
          // Grant credits locally immediately for better UX, rely on webhook for Stripe grant confirmation
          // Use a specific operation ID prefix for auto-topups
          const operationId = `auto-${userId}-${Date.now()}`
          await processAndGrantCredit(
              userId,
              amountToTopUp,
              'purchase', // Auto-topups are considered purchases
              `Automatic top-up of ${amountToTopUp.toLocaleString()} credits`,
              null, // Purchases don't expire
              operationId
          )
          logger.info(
            { ...logContext, operationId, credits: amountToTopUp },
            `Locally granted ${amountToTopUp} credits for auto-top-up.`
          )

        } else {
          // Payment failed or requires action
          logger.warn(
            { ...logContext, invoiceId: invoice.id, status: finalizedInvoice.status },
            `Auto-top-up invoice payment failed or requires action for user ${userId}. Status: ${finalizedInvoice.status}`
          )
          // TODO: Notify user, potentially disable auto-top-up after repeated failures
           await db
             .update(schema.user)
             .set({ auto_topup_enabled: false })
             .where(eq(schema.user.id, userId));
           logger.info({...logContext}, `Disabled auto-top-up for user ${userId} due to payment failure.`);
           // Send notification to user via websocket?
        }
      } catch (stripeError: any) {
        logger.error(
          { ...logContext, error: stripeError.message },
          `Stripe error during auto-top-up charge for user ${userId}`
        )
         // Disable auto-topup on stripe error
         await db
           .update(schema.user)
           .set({ auto_topup_enabled: false })
           .where(eq(schema.user.id, userId));
         logger.info({...logContext}, `Disabled auto-top-up for user ${userId} due to Stripe error.`);
        // TODO: Notify user
      }
    }
  } catch (error) {
    logger.error(
      { ...logContext, error },
      `Error during auto-top-up check for user ${userId}`
    )
  }
}