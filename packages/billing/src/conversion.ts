/**
 * Converts a credit amount to USD cents.
 * @param credits The number of credits to convert
 * @param centsPerCredit The cost per credit in cents
 * @returns The amount in USD cents
 */
export function convertCreditsToUsdCents(
  credits: number,
  centsPerCredit: number
): number {
  return Math.round(credits * centsPerCredit)
}

/**
 * Gets the cost per credit in cents for a user.
 * @param userId The ID of the user
 * @returns The cost per credit in cents
 */
export async function getUserCostPerCredit(userId: string): Promise<number> {
  // For now, return a fixed rate of 1 cent per credit
  return 1
}

/**
 * Converts a Stripe grant amount in cents to credits.
 * @param amountInCents The amount in USD cents
 * @param centsPerCredit The cost per credit in cents
 * @returns The number of credits
 */
export function convertStripeGrantAmountToCredits(
  amountInCents: number,
  centsPerCredit: number
): number {
  return Math.floor(amountInCents / centsPerCredit)
}