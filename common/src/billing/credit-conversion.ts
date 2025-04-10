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
  if (credits <= 0 || centsPerCredit <= 0) {
    return 0
  }
  // Total Cents = Credits * Cents per Credit
  const cents = credits * centsPerCredit
  // Use Math.ceil for safety, ensuring we calculate enough monetary value.
  return Math.ceil(cents)
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
    return 0
  }
  // Credits = Total Cents / Cents per Credit
  const credits = amountInSmallestUnit / centsPerCredit
  // Use Math.round for robustness
  return Math.round(credits)
}