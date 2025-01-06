import { useQuery } from '@tanstack/react-query'
import { PlanConfig, UsageLimits } from 'common/constants'

export const useUserPlan = (subscriptionId: string | null | undefined) => {
  return useQuery({
    queryKey: ['userPlan', subscriptionId],
    queryFn: async () => {
      if (!subscriptionId) return
      const response = await fetch('/api/stripe/subscription')
      if (!response.ok) {
        throw new Error('Failed to fetch subscription details')
      }
      const { currentPlan }: { currentPlan: UsageLimits } =
        await response.json()
      return currentPlan
    },
    enabled: !!subscriptionId,
  })
}
