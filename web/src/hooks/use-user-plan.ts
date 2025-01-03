import { useQuery } from '@tanstack/react-query'

export const useUserPlan = (subscriptionId: string | null | undefined) => {
  return useQuery({
    queryKey: ['userPlan', subscriptionId],
    queryFn: async () => {
      if (!subscriptionId) return
      const response = await fetch('/api/stripe/subscription?details=basic')
      if (!response.ok) {
        throw new Error('Failed to fetch subscription details')
      }
      const data = await response.json()
      return data.currentPlan
    },
    enabled: !!subscriptionId,
  })
}
