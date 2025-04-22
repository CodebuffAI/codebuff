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
 * Convert dollars to credits based on cents per credit
 * @param dollars Amount in dollars
 * @param centsPerCredit Cost in cents per credit
 */
export const dollarsToCredits = (dollars: number, centsPerCredit: number) =>
  Math.round((dollars * 100) / centsPerCredit)

/**
 * Convert credits to dollars based on cents per credit
 * @param credits Amount in credits
 * @param centsPerCredit Cost in cents per credit
 */
export const creditsToDollars = (credits: number, centsPerCredit: number) => {
  const dollars = (credits * centsPerCredit) / 100
  return dollars % 1 === 0 ? Math.floor(dollars).toString() : dollars.toFixed(2)
}