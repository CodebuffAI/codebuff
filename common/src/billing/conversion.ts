import { logger } from '../util/logger' // Assuming logger exists

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
 * Converts a Stripe grant amount (in the smallest currency unit, e.g., cents for USD)
 * to the application's internal credit system units, based on the user's cost per credit.
 *
 * @param amountInSmallestUnit - The grant amount from Stripe, typically in cents.
 * @param centsPerCredit - The user's effective cost per internal credit (in cents).
 * @returns The equivalent amount in application credits. Uses Math.round for conversion.
 */
export function convertStripeGrantAmountToCredits(
  amountInSmallestUnit: number,
  centsPerCredit: number
): number {
  if (centsPerCredit <= 0) {
    logger.error(
      { amountInSmallestUnit, centsPerCredit },
      'Invalid centsPerCredit value (must be positive). Cannot convert Stripe grant.'
    )
    // Return 0 or throw an error, depending on desired handling
    return 0
  }
  // Credits = Total Cents / Cents per Credit
  const credits = amountInSmallestUnit / centsPerCredit
  // Use Math.round for robustness
  return Math.round(credits)
}

/**
 * Converts an internal credit system value to the equivalent monetary amount in USD cents,
 * based on the user's cost per credit.
 * Uses Math.ceil to ensure enough monetary value is calculated if rounding occurs.
 *
 * @param credits - The amount in internal credits.
 * @param centsPerCredit - The user's effective cost per internal credit (in cents).
 * @returns The equivalent amount in USD cents.
 */
export function convertCreditsToUsdCents(
  credits: number,
  centsPerCredit: number
): number {
  if (credits <= 0) {
    return 0
  }
  if (centsPerCredit <= 0) {
    logger.error(
      { credits, centsPerCredit },
      'Invalid centsPerCredit value (must be positive). Cannot convert credits to cents.'
    )
    return 0
  }
  // Total Cents = Credits * Cents per Credit
  const cents = credits * centsPerCredit
  // Use Math.ceil for safety, ensuring we calculate enough monetary value.
  return Math.ceil(cents)
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
