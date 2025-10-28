import { CREDIT_PRICING } from '@codebuff/common/old-constants'

/**
 * Format a cents amount to dollars, showing cents only when non-zero
 * @param cents Amount in cents
 * @returns Formatted dollar amount as string (e.g. "10" or "10.50")
 */
export const formatDollars = (cents: number) => {
  return cents % 100 === 0
    ? Math.floor(cents / 100).toString()
    : (cents / 100).toFixed(2)
}

/**
 * Convert dollars to credits using the standard pricing
 * @param dollars Amount in dollars
 */
export const dollarsToCredits = (dollars: number) =>
  Math.round((dollars * 100) / CREDIT_PRICING.CENTS_PER_CREDIT)

/**
 * Convert credits to dollars using the standard pricing
 * @param credits Amount in credits
 */
export const creditsToDollars = (credits: number) => {
  const dollars = (credits * CREDIT_PRICING.CENTS_PER_CREDIT) / 100
  return dollars % 1 === 0 ? Math.floor(dollars).toString() : dollars.toFixed(2)
}

// Legacy functions with explicit pricing parameter (for backward compatibility)
/**
 * Convert dollars to credits based on cents per credit
 * @param dollars Amount in dollars
 * @param centsPerCredit Cost in cents per credit
 */
export const dollarsToCreditsWithRate = (
  dollars: number,
  centsPerCredit: number,
) => Math.round((dollars * 100) / centsPerCredit)

/**
 * Convert credits to dollars based on cents per credit
 * @param credits Amount in credits
 * @param centsPerCredit Cost in cents per credit
 */
export const creditsToDollarsWithRate = (
  credits: number,
  centsPerCredit: number,
) => {
  const dollars = (credits * centsPerCredit) / 100
  return dollars % 1 === 0 ? Math.floor(dollars).toString() : dollars.toFixed(2)
}
