export const SUBSCRIPTION_DISPLAY_NAME = 'Strong' as const

export interface TierConfig {
  monthlyPrice: number
  creditsPerBlock: number
  blockDurationHours: number
  weeklyCreditsLimit: number
}

export const SUBSCRIPTION_TIERS = {
  100: {
    monthlyPrice: 100,
    creditsPerBlock: 400,
    blockDurationHours: 5,
    weeklyCreditsLimit: 4000,
  },
  200: {
    monthlyPrice: 200,
    creditsPerBlock: 1250,
    blockDurationHours: 5,
    weeklyCreditsLimit: 12500,
  },
  500: {
    monthlyPrice: 500,
    creditsPerBlock: 3125,
    blockDurationHours: 5,
    weeklyCreditsLimit: 31250,
  },
} as const satisfies Record<number, TierConfig>

export type SubscriptionTierPrice = keyof typeof SUBSCRIPTION_TIERS

export const DEFAULT_TIER = SUBSCRIPTION_TIERS[200]
