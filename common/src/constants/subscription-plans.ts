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
    creditsPerBlock: 1200,
    blockDurationHours: 5,
    weeklyCreditsLimit: 12000,
  },
  500: {
    monthlyPrice: 500,
    creditsPerBlock: 3200,
    blockDurationHours: 5,
    weeklyCreditsLimit: 32000,
  },
} as const satisfies Record<number, TierConfig>

export type SubscriptionTierPrice = keyof typeof SUBSCRIPTION_TIERS

export const DEFAULT_TIER = SUBSCRIPTION_TIERS[200]

export function createSubscriptionPriceMappings(priceIds: Record<SubscriptionTierPrice, string>) {
  const priceToTier = Object.fromEntries(
    Object.entries(priceIds).map(([tier, priceId]) => [priceId, Number(tier) as SubscriptionTierPrice]),
  ) as Record<string, SubscriptionTierPrice>

  function getTierFromPriceId(priceId: string): SubscriptionTierPrice | null {
    return priceToTier[priceId] ?? null
  }

  function getPriceIdFromTier(tier: SubscriptionTierPrice): string | null {
    return priceIds[tier] ?? null
  }

  return { getTierFromPriceId, getPriceIdFromTier }
}
