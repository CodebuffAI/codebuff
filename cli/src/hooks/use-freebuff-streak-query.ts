import { useQuery } from '@tanstack/react-query'

import { getAuthToken } from '../utils/auth'
import { getApiClient, setApiClientAuthToken } from '../utils/codebuff-api'
import { logger as defaultLogger } from '../utils/logger'

import type { FreebuffStreakResponse } from '@codebuff/common/types/freebuff-streak'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export const freebuffStreakQueryKeys = {
  all: ['freebuffStreak'] as const,
  current: () => [...freebuffStreakQueryKeys.all, 'current'] as const,
}

export async function fetchFreebuffStreak(params: {
  authToken: string
  logger?: Logger
}): Promise<FreebuffStreakResponse> {
  const { authToken, logger = defaultLogger } = params
  setApiClientAuthToken(authToken)
  const response = await getApiClient().get<FreebuffStreakResponse>(
    '/api/v1/freebuff/streak',
    { retry: false },
  )

  if (!response.ok) {
    logger.error(
      { status: response.status, error: response.error },
      'Failed to fetch freebuff streak',
    )
    throw new Error(`Failed to fetch freebuff streak (HTTP ${response.status})`)
  }

  if (!response.data) {
    throw new Error('Failed to fetch freebuff streak: empty response')
  }

  return response.data
}

export function useFreebuffStreakQuery(
  params: {
    enabled?: boolean
    logger?: Logger
  } = {},
) {
  const { enabled = true, logger = defaultLogger } = params
  const authToken = getAuthToken()

  return useQuery({
    queryKey: freebuffStreakQueryKeys.current(),
    queryFn: () => fetchFreebuffStreak({ authToken: authToken!, logger }),
    enabled: enabled && !!authToken,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
