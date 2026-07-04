import { useQuery } from '@tanstack/react-query'

import { getAuthToken } from '../utils/auth'
import { getApiClient, setApiClientAuthToken } from '../utils/codebirds-api'
import { logger as defaultLogger } from '../utils/logger'

import type { FreebuffStreakResponse } from '@codebirds/common/types/codebirds-streak'
import type { Logger } from '@codebirds/common/types/contracts/logger'

export const codebirdsStreakQueryKeys = {
  all: ['codebirdsStreak'] as const,
  current: () => [...codebirdsStreakQueryKeys.all, 'current'] as const,
}

export async function fetchFreebuffStreak(params: {
  authToken: string
  logger?: Logger
}): Promise<FreebuffStreakResponse> {
  const { authToken, logger = defaultLogger } = params
  setApiClientAuthToken(authToken)
  const response = await getApiClient().get<FreebuffStreakResponse>(
    '/api/v1/codebirds/streak',
    { retry: false },
  )

  if (!response.ok) {
    logger.error(
      { status: response.status, error: response.error },
      'Failed to fetch codebirds streak',
    )
    throw new Error(`Failed to fetch codebirds streak (HTTP ${response.status})`)
  }

  if (!response.data) {
    throw new Error('Failed to fetch codebirds streak: empty response')
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
    queryKey: codebirdsStreakQueryKeys.current(),
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
