import { logger } from '../util/logger'
import { convertCreditsToUsdCents } from './credit-conversion'

/**
 * Determines the cost of one internal credit in USD cents for a given user.
 * TODO: Enhance this function to fetch user's plan and apply plan-specific rates.
 *
 * @param userId - The ID of the user (currently unused, for future enhancement).
 * @returns The cost of one internal credit in cents.
 */
export async function getUserCostPerCredit(
  userId: string | undefined
): Promise<number> {
  // Placeholder: Currently 1 cent per credit for all users. Can adjust in the future based on user
  return 1
}

/**
 * Creates the Amount object structure required by the Stripe Billing Credits API v18+.
 * This structure specifies the monetary value and currency based on internal credits
 * and the user's cost per credit.
 *
 * @param credits - The amount in internal credits to be granted.
 * @param centsPerCredit - The user's effective cost per internal credit (in cents).
 * @returns The Stripe Amount object structure or null if credits are non-positive or conversion fails.
 */
export function createStripeMonetaryAmount(
  credits: number,
  centsPerCredit: number
): { monetary: { currency: 'usd'; value: number }; type: 'monetary' } | null {
  const cents = convertCreditsToUsdCents(credits, centsPerCredit)
  if (cents <= 0) {
    // Stripe API likely expects a positive value, or conversion failed
    logger.warn(
      { credits, centsPerCredit, calculatedCents: cents },
      'Calculated non-positive cents for Stripe grant, returning null.'
    )
    return null
  }
  return {
    monetary: {
      currency: 'usd',
      value: cents, // Value must be in cents
    },
    type: 'monetary',
  }
}

// Re-export the pure conversion functions
export { convertCreditsToUsdCents, convertStripeGrantAmountToCredits } from './credit-conversion'
