import { useQuery } from '@tanstack/react-query'

import { getAuthToken } from '../utils/auth'
import { logger as defaultLogger } from '../utils/logger'

import type { Logger } from '@codebuff/common/types/contracts/logger'

// Valid fields that can be fetched from /api/v1/me
export type UserField =
  | 'id'
  | 'email'
  | 'discord_id'
  | 'referral_code'
  | 'referral_link'

// Query keys for type-safe cache management
export const userDetailsQueryKeys = {
  all: ['userDetails'] as const,
  fields: (fields: readonly UserField[]) =>
    [...userDetailsQueryKeys.all, ...fields] as const,
}

export type UserDetails<T extends UserField> = {
  [K in T]: K extends 'discord_id' | 'referral_code' | 'referral_link'
    ? string | null
    : string
}

// Minimal fetch function type for dependency injection
type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

interface FetchUserDetailsParams<T extends UserField> {
  authToken: string
  fields: readonly T[]
  logger?: Logger
  fetch?: FetchFn
}

/**
 * Fetches specific user details from the /api/v1/me endpoint
 */
export async function fetchUserDetails<T extends UserField>({
  authToken,
  fields,
  logger = defaultLogger,
  fetch: fetchFn = globalThis.fetch,
}: FetchUserDetailsParams<T>): Promise<UserDetails<T> | null> {
  const appUrl = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL
  if (!appUrl) {
    throw new Error('NEXT_PUBLIC_CODEBUFF_APP_URL is not set')
  }

  const fieldsParam = fields.join(',')
  const response = await fetchFn(`${appUrl}/api/v1/me?fields=${fieldsParam}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
  })

  if (!response.ok) {
    logger.error(
      { status: response.status, fields },
      'Failed to fetch user details from /api/v1/me',
    )
    throw new Error(`Failed to fetch user details (HTTP ${response.status})`)
  }

  const data = (await response.json()) as UserDetails<T>
  return data
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
    queryFn: () => fetchUserDetails({ authToken: authToken!, fields, logger }),
    enabled: enabled && !!authToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}
