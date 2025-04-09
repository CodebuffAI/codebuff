import { UsageLimits, PLAN_CONFIGS } from 'common/constants'
import { env } from '../env.mjs' // Assuming backend has access to these env vars

/**
 * Determines the user's plan based on their Stripe Price ID.
 * Defaults to FREE if no matching price ID is found.
 * NOTE: Requires backend environment variables for Stripe Price IDs.
 */
export function getPlanFromPriceId(priceId: string | null | undefined): UsageLimits {
  if (!priceId) {
    return UsageLimits.FREE
  }
  // Ensure backend env has these defined
  if (priceId === env.STRIPE_PRO_PRICE_ID) {
    return UsageLimits.PRO
  }
  if (priceId === env.STRIPE_MOAR_PRO_PRICE_ID) {
    return UsageLimits.MOAR_PRO
  }
  // Add other plan checks here if necessary
  return UsageLimits.FREE // Default to FREE for unknown or non-matching IDs
}

/**
 * Gets the monthly credit grant amount for a given plan.
 */
export function getMonthlyGrantForPlan(plan: UsageLimits): number {
  return PLAN_CONFIGS[plan]?.limit ?? PLAN_CONFIGS[UsageLimits.FREE].limit
}