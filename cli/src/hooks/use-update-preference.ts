import { useMutation, useQueryClient } from '@tanstack/react-query'

import { subscriptionQueryKeys } from './use-subscription-query'
import { getApiClient } from '../utils/codebuff-api'
import { logger } from '../utils/logger'

import type { SubscriptionResponse } from '@codebuff/common/types/subscription'

interface UpdatePreferenceParams {
  fallbackToALaCarte?: boolean
}

export function useUpdatePreference() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: UpdatePreferenceParams) => {
      const client = getApiClient()
      const response = await client.patch('/api/user/preferences', {
        body: params,
        includeCookie: true,
      })

      if (!response.ok) {
        throw new Error('Failed to update preference')
      }

      return params
    },
    onMutate: async (newParams) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: subscriptionQueryKeys.current() })

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<SubscriptionResponse>(
        subscriptionQueryKeys.current()
      )

      // Optimistically update to the new value
      if (previousData && newParams.fallbackToALaCarte !== undefined) {
        queryClient.setQueryData<SubscriptionResponse>(
          subscriptionQueryKeys.current(),
          { ...previousData, fallbackToALaCarte: newParams.fallbackToALaCarte }
        )
      }

      return { previousData }
    },
    onError: (err, _newParams, context) => {
      // Rollback to previous value on error
      if (context?.previousData) {
        queryClient.setQueryData(subscriptionQueryKeys.current(), context.previousData)
      }
      logger.error({ err }, 'Failed to update preference')
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: subscriptionQueryKeys.current() })
    },
  })
}
