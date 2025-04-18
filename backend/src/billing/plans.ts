import { UsageLimits, PLAN_CONFIGS } from 'common/constants'
import { getPreviousFreeGrantAmount, calculateTotalReferralBonus } from 'common/src/billing/grant-credits'
import { logger } from '@/util/logger'

/**
 * Determines the user's plan based on their Stripe Price ID.
 * Defaults to FREE if no matching price ID is found.
 * NOTE: Requires backend environment variables for Stripe Price IDs.
 */
export function getPlanFromPriceId(
  priceId: string | null | undefined,
  proPriceId?: string,
  moarProPriceId?: string
): UsageLimits {
  if (!priceId) {
    return UsageLimits.FREE
  }
  
  if (proPriceId && priceId === proPriceId) {
    return UsageLimits.PRO
  }
  if (moarProPriceId && priceId === moarProPriceId) {
    return UsageLimits.MOAR_PRO
  }
  
  return UsageLimits.FREE // Default to FREE for unknown or non-matching IDs
}

/**
 * Gets the total monthly credit grant amount for a given plan and user.
 * This includes both their plan's base credits and any referral bonuses,
 * combined into a single number.
 */
export async function getMonthlyGrantForPlan(
  plan: UsageLimits,
  userId?: string
): Promise<number> {
  // If no userId provided, just return the plan's base limit
  if (!userId) {
    return PLAN_CONFIGS[plan]?.limit ?? PLAN_CONFIGS[UsageLimits.FREE].limit
  }

  // Calculate total grant by adding base plan amount and referral bonuses
  const [freeGrantAmount, referralBonus] = await Promise.all([
    getPreviousFreeGrantAmount(userId),
    calculateTotalReferralBonus(userId),
  ])

  const totalGrant = freeGrantAmount + referralBonus
  logger.debug(
    { userId, plan, freeGrantAmount, referralBonus, totalGrant },
    'Calculated total monthly grant amount'
  )
  return totalGrant
}