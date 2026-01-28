export const PLAN_NAMES = ['pro'] as const
export type PlanName = (typeof PLAN_NAMES)[number]

export interface PlanConfig {
  name: PlanName
  displayName: string
  monthlyPrice: number
  creditsPerBlock: number
  blockDurationHours: number
  weeklyCreditsLimit: number
}

export const PLANS = {
  pro: {
    name: 'pro',
    displayName: 'Pro',
    monthlyPrice: 200,
    creditsPerBlock: 1250,
    blockDurationHours: 5,
    weeklyCreditsLimit: 15000,
  },
} as const satisfies Record<PlanName, PlanConfig>

export function isPlanName(name: string): name is PlanName {
  return (PLAN_NAMES as readonly string[]).includes(name)
}
