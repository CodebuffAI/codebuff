export const SUBSCRIPTION_DISPLAY_NAME = 'Strong' as const

export interface TierConfig {
  monthlyPrice: number
  creditsPerBlock: number
  blockDurationHours: number
  weeklyCreditsLimit: number
}

export const SUBSCRIPTION_TIERS = {
  200: {
    monthlyPrice: 200,
    creditsPerBlock: 1250,
    blockDurationHours: 5,
    weeklyCreditsLimit: 12500,
  },
} as const satisfies Record<number, TierConfig>

export const DEFAULT_TIER = SUBSCRIPTION_TIERS[200]
