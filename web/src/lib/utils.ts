import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { PLAN_CONFIGS, UsageLimits } from 'common/constants'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export type PlanChangeOperation = 'upgrade' | 'change'

export const changeOrUpgrade = (
  currentPlan: UsageLimits | null | undefined,
  targetPlan: UsageLimits
): PlanChangeOperation => {
  if (!currentPlan) return 'upgrade'

  const currentConfig = PLAN_CONFIGS[currentPlan]
  const targetConfig = PLAN_CONFIGS[targetPlan]

  if (!currentConfig?.monthlyPrice || !targetConfig?.monthlyPrice)
    return 'upgrade'

  return targetConfig.monthlyPrice > currentConfig.monthlyPrice
    ? 'upgrade'
    : 'change'
}
