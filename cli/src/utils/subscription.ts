import type { SubscriptionResponse } from '../hooks/use-subscription-query'

/**
 * Calculates the percentage of subscription block credits remaining.
 * Returns null if the subscription data is incomplete.
 */
export function getBlockPercentRemaining(
  subscriptionData: SubscriptionResponse | null | undefined,
): number | null {
  if (!subscriptionData?.hasSubscription) return null
  const rateLimit = subscriptionData.rateLimit
  if (!rateLimit?.blockLimit || rateLimit.blockUsed == null) return null
  return Math.round(
    ((rateLimit.blockLimit - rateLimit.blockUsed) / rateLimit.blockLimit) * 100,
  )
}

/**
 * Determines if a request is covered by subscription based on subscription data.
 * Returns true if the user has an active subscription that's not rate-limited
 * and has remaining block credits.
 */
export function isCoveredBySubscription(
  subscriptionData: SubscriptionResponse | null | undefined,
): boolean {
  if (!subscriptionData?.hasSubscription) return false
  const rateLimit = subscriptionData.rateLimit
  if (rateLimit?.limited) return false
  const blockPercentRemaining = getBlockPercentRemaining(subscriptionData)
  return blockPercentRemaining != null && blockPercentRemaining > 0
}
