import { UsageLimits } from 'common/constants'
import { env } from '../env.mjs'
import { getPlanFromPriceId as commonGetPlanFromPriceId } from 'common/src/billing/plans'

export { getMonthlyGrantForPlan } from 'common/src/billing/plans'

/**
 * Determines the user's plan based on their Stripe Price ID.
 * Defaults to FREE if no matching price ID is found.
 */
export function getPlanFromPriceId(
  priceId: string | null | undefined
): UsageLimits {
  return commonGetPlanFromPriceId(
    priceId,
    env.STRIPE_PRO_PRICE_ID,
    env.STRIPE_MOAR_PRO_PRICE_ID
  )
}
