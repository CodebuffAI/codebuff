import { useQuery } from '@tanstack/react-query'

import { getApiClient } from '../utils/codebuff-api'
import { IS_FREEBUFF } from '../utils/constants'
import { logger as defaultLogger } from '../utils/logger'

import type { CodebuffApiClient } from '../utils/codebuff-api'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export interface UsageResponse {
  usage: number
  remainingBalance: number | null
  next_quota_reset: string | null
}

export const usageQueryKeys = {
  all: ['usage'] as const,
  current: () => [...usageQueryKeys.all, 'current'] as const,
}

export interface FetchUsageDataDeps {
  apiClient?: CodebuffApiClient
  logger?: Logger
}

export async function fetchUsageData({
  apiClient: providedApiClient,
  logger = defaultLogger,
}: FetchUsageDataDeps): Promise<UsageResponse> {
  const client = providedApiClient ?? getApiClient()

  const response = await client.post<UsageResponse>('/api/v1/usage', {
    fingerprintId: undefined,
  })

  if (!response.ok) {
    logger.debug({ status: response.status }, 'Failed to fetch usage data')
    throw new Error(`Failed to fetch usage: ${response.status}`)
  }

  return (
    response.data ?? {
      usage: 0,
      remainingBalance: null,
      next_quota_reset: null,
    }
  )
}

export interface UseUsageQueryDeps {
  apiClient?: CodebuffApiClient
  enabled?: boolean
  refetchIntervalMs?: number
  logger?: Logger
}

export function useUsageQuery(deps: UseUsageQueryDeps = {}) {
  const {
    apiClient: providedApiClient,
    enabled = true,
    refetchIntervalMs = 60 * 1000,
    logger = defaultLogger,
  } = deps

  return useQuery({
    queryKey: usageQueryKeys.current(),
    queryFn: () =>
      fetchUsageData({
        apiClient: providedApiClient,
        logger,
      }),
    enabled: enabled && !IS_FREEBUFF,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 1,
    refetchInterval: refetchIntervalMs,
  })
}