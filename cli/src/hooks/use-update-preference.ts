import { useMutation, useQueryClient } from '@tanstack/react-query'

import { IS_FREEBUFF } from '../utils/constants'
import { getApiClient } from '../utils/codebuff-api'
import { subscriptionQueryKeys } from './use-subscription-query'

import type { Logger } from '@codebuff/common/types/contracts/logger'

export interface UpdatePreferencePayload {
  dismissed?: boolean
  hideUntil?: string
  [key: string]: unknown
}

export function useUpdatePreference(
  logger?: Logger,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: UpdatePreferencePayload) => {
      if (IS_FREEBUFF) return

      const client = getApiClient()
      const response = await client.patch('/api/user/preferences', payload, {
        includeCookie: true,
      })

      if (!response.ok) {
        logger?.debug?.(
          { status: response.status },
          'Failed to update preference',
        )
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: subscriptionQueryKeys.all,
      })
    },
  })
}