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

// Re-export the pure conversion functions
export { convertCreditsToUsdCents, convertStripeGrantAmountToCredits } from './credit-conversion'
