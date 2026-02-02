import { useQuery } from '@tanstack/react-query'

import { getAuthToken } from '../utils/auth'
import { getApiClient, setApiClientAuthToken } from '../utils/codebuff-api'
import { logger as defaultLogger } from '../utils/logger'

import type {
  CodebuffApiClient,
  UserField,
  UserDetails,
} from '../utils/codebuff-api'
import type { Logger } from '@codebuff/common/types/contracts/logger'

// Re-export types for backwards compatibility
export type { UserField, UserDetails }

// Query keys for type-safe cache management
export const userDetailsQueryKeys = {
  all: ['userDetails'] as const,
  fields: (fields: readonly UserField[]) =>
    [...userDetailsQueryKeys.all, ...fields] as const,
}

interface FetchUserDetailsParams<T extends UserField> {
  authToken: string
  fields: readonly T[]
  logger?: Logger
  apiClient?: CodebuffApiClient
}

/**
 * Fetches specific user details from the /api/v1/me endpoint
 */
export async function fetchUserDetails<T extends UserField>({
  authToken,
  fields,
  logger = defaultLogger,
  apiClient: providedApiClient,
}: FetchUserDetailsParams<T>): Promise<UserDetails<T> | null> {
  let apiClient: CodebuffApiClient
  if (providedApiClient) {
    apiClient = providedApiClient
  } else {
    setApiClientAuthToken(authToken)
    apiClient = getApiClient()
  }

  const response = await apiClient.me(fields)

  if (!response.ok) {
    logger.error(
      { status: response.status, fields },
      'Failed to fetch user details from /api/v1/me',
    )
    throw new Error(`Failed to fetch user details (HTTP ${response.status})`)
  }

  return response.data ?? null
}

export interface UseUserDetailsQueryDeps<T extends UserField> {
  fields: readonly T[]
  logger?: Logger
  enabled?: boolean
}

/**
 * Hook to fetch specific user details
 */
export function useUserDetailsQuery<T extends UserField>({
  fields,
  logger = defaultLogger,
  enabled = true,
}: UseUserDetailsQueryDeps<T>) {
  const authToken = getAuthToken()

  return useQuery({
    queryKey: userDetailsQueryKeys.fields(fields),
    queryFn: async () => {
      if (!authToken) {
        throw new Error('No auth token available')
      }
      return fetchUserDetails({ authToken, fields, logger })
    },
    enabled: enabled && !!authToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
