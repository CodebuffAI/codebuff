import { UsageLimits } from '../constants'

export type PlanName = 'Free' | 'Pro' | 'Moar Pro' | 'Team' | 'Team'

// Convert UsageLimits enum to plan name
export const getPlanNameFromUsageLimit = (limit: UsageLimits): PlanName => {
  switch (limit) {
    case UsageLimits.FREE:
      return 'Free'
    case UsageLimits.PRO:
      return 'Pro'
    case UsageLimits.MOAR_PRO:
      return 'Moar Pro'
    default:
      return 'Free'
  }
}
