'use client'

import { useQuery } from '@tanstack/react-query'

export const useUserPlan = (subscriptionId: string | null | undefined) => {
  return useQuery({
    queryKey: ['userPlan', subscriptionId],
    queryFn: async () => {
      if (!subscriptionId) return
      const response = await fetch('/api/stripe/subscription')
      if (!response.ok) {
        throw new Error('Failed to fetch subscription details')
      }
      return null // No longer returning plan info
    },
    enabled: !!subscriptionId,
  })
}
