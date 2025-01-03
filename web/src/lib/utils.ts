import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { PLAN_CONFIGS } from 'common/constants'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export type PlanChangeOperation = 'upgrade' | 'change'

export const changeOrUpgrade = (
  currentPlan: string | null | undefined,
  targetPlan: string
): PlanChangeOperation => {
  if (!currentPlan) return 'upgrade'

  const currentConfig =
    PLAN_CONFIGS[
      currentPlan === 'Free'
        ? 'FREE'
        : currentPlan === 'Pro'
          ? 'PRO'
          : 'MOAR_PRO'
    ]
  const targetConfig =
    PLAN_CONFIGS[
      targetPlan === 'Free' ? 'FREE' : targetPlan === 'Pro' ? 'PRO' : 'MOAR_PRO'
    ]

  if (!currentConfig?.monthlyPrice || !targetConfig?.monthlyPrice)
    return 'upgrade'

  return targetConfig.monthlyPrice > currentConfig.monthlyPrice
    ? 'upgrade'
    : 'change'
}
