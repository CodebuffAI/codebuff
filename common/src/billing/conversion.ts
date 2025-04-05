/**
 * Converts a Stripe grant amount (in the smallest currency unit, e.g., cents for USD)
 * to the application's internal credit system units.
 *
 * Currently, the ratio is 1 cent = 1 credit ($1 = 100 credits).
 *
 * @param amountInSmallestUnit - The grant amount from Stripe, typically in cents.
 * @returns The equivalent amount in application credits. Uses Math.round for conversion.
 */
export function convertStripeGrantAmountToCredits(amountInSmallestUnit: number): number {
  // Assuming the Stripe amount is in cents (for USD) and $1 = 100 credits.
  // Therefore, 1 cent = 1 credit.
  const creditsPerCent = 1;
  // Use Math.round in case the ratio changes or Stripe sends unexpected values
  return Math.round(amountInSmallestUnit * creditsPerCent);
}

/**
 * Converts an internal credit system value to the equivalent monetary amount in USD cents.
 * Uses Math.ceil to ensure enough monetary value is granted if the ratio changes,
 * though currently 1 credit = 1 cent.
 * @param credits - The amount in internal credits.
 * @returns The equivalent amount in USD cents.
 */
export function convertCreditsToUsdCents(credits: number): number {
  if (credits <= 0) {
    return 0;
  }
  // Assuming 1 credit = 1 cent for now.
  const centsPerCredit = 1;
  // Use Math.ceil for safety if ratio changes, ensuring we grant enough monetary value.
  return Math.ceil(credits * centsPerCredit);
}

/**
 * Creates the Amount object structure required by the Stripe Billing Credits API v18+.
 * This structure specifies the monetary value and currency.
 * @param credits - The amount in internal credits to be granted.
 * @returns The Stripe Amount object structure or null if credits are non-positive.
 */
export function createStripeMonetaryAmount(credits: number): { monetary: { currency: 'usd', value: number }, type: 'monetary' } | null {
    const cents = convertCreditsToUsdCents(credits);
    if (cents <= 0) {
        // Stripe API likely expects a positive value
        return null;
    }
    return {
        monetary: {
            currency: 'usd',
            value: cents, // Value must be in cents
        },
        type: 'monetary',
    };
}