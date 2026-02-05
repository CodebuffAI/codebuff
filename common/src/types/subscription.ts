/**
 * Core subscription information for an active subscription.
 */
export interface SubscriptionInfo {
  id: string
  status: string
  billingPeriodEnd: string
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  tier: number
  scheduledTier?: number | null
}

/**
 * Rate limit information for subscription usage.
 */
export interface SubscriptionRateLimit {
  limited: boolean
  reason?: 'block_exhausted' | 'weekly_limit'
  canStartNewBlock: boolean
  blockUsed?: number
  blockLimit?: number
  blockResetsAt?: string
  weeklyUsed: number
  weeklyLimit: number
  weeklyResetsAt: string
  weeklyPercentUsed: number
}

/**
 * Subscription limits configuration.
 */
export interface SubscriptionLimits {
  creditsPerBlock: number
  blockDurationHours: number
  weeklyCreditsLimit: number
}

/**
 * Response when user has no active subscription.
 */
export interface NoSubscriptionResponse {
  hasSubscription: false
  /** Whether user prefers to fallback to a-la-carte credits when subscription limits are reached */
  fallbackToALaCarte: boolean
}

/**
 * Response when user has an active subscription.
 * All fields are required - no invalid states possible.
 */
export interface ActiveSubscriptionResponse {
  hasSubscription: true
  displayName: string
  subscription: SubscriptionInfo
  rateLimit: SubscriptionRateLimit
  limits: SubscriptionLimits

  /** Whether user prefers to fallback to a-la-carte credits when subscription limits are reached */
  fallbackToALaCarte: boolean
}

/**
 * Discriminated union for subscription API response.
 * Use `hasSubscription` to narrow the type.
 */
export type SubscriptionResponse = NoSubscriptionResponse | ActiveSubscriptionResponse
