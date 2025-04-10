import { stripeServer } from '../util/stripe'
import { logger } from '../util/logger'
import type Stripe from 'stripe'
import { env } from 'src/env.mjs'

export interface AutoTopupCheckResult {
  canAutoTopup: boolean
  blockedReason: string | null
  validPaymentMethod: Stripe.PaymentMethod | null
}

/**
 * Checks if auto top-up is allowed for a user by verifying their payment methods.
 * @param userId The ID of the user for logging context
 * @param stripeCustomerId The user's Stripe customer ID
 * @returns Promise<AutoTopupCheckResult>
 */
export async function checkAutoTopupAllowed(
  userId: string,
  stripeCustomerId: string | null
): Promise<AutoTopupCheckResult> {
  const logContext = { userId }

  if (!stripeCustomerId) {
    return {
      canAutoTopup: false,
      blockedReason: `You don\'t have a valid account with us. Please log in at ${env.NEXT_PUBLIC_APP_URL}/login`,
      validPaymentMethod: null,
    }
  }

  try {
    const paymentMethods = await stripeServer.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card',
    })

    // Find a valid, non-expired card
    const validPaymentMethod = paymentMethods.data.find(
      (pm) =>
        pm.card?.exp_year &&
        pm.card.exp_month &&
        new Date(pm.card.exp_year, pm.card.exp_month - 1) > new Date()
    )

    if (!validPaymentMethod) {
      logger.warn(
        { ...logContext },
        'No valid payment methods found for auto top-up'
      )
      return {
        canAutoTopup: false,
        blockedReason:
          'You need a valid payment method to enable auto top-up. You can add one by manually purchasing credits.',
        validPaymentMethod: null,
      }
    }

    return {
      canAutoTopup: true,
      blockedReason: null,
      validPaymentMethod,
    }
  } catch (error) {
    logger.error({ ...logContext, error }, 'Failed to fetch payment methods')
    return {
      canAutoTopup: false,
      blockedReason: 'Unable to verify payment method status.',
      validPaymentMethod: null,
    }
  }
}
