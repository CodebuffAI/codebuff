import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { getUserInfoFromApiKey as defaultGetUserInfoFromApiKey } from '@codebuff/sdk'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import {
  getUserCredentials as defaultGetUserCredentials,
  saveUserCredentials as defaultSaveUserCredentials,
  logoutUser as logoutUserUtil,
  type User,
} from '../utils/auth'
import { resetCodebuffClient } from '../utils/codebuff-client'
import { logger as defaultLogger } from '../utils/logger'

import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'

// Query keys for type-safe cache management
export const authQueryKeys = {
  all: ['auth'] as const,
  user: () => [...authQueryKeys.all, 'user'] as const,
  validation: (apiKey: string) =>
    [...authQueryKeys.all, 'validation', apiKey] as const,
}

interface ValidateAuthParams {
  apiKey: string
  getUserInfoFromApiKey?: GetUserInfoFromApiKeyFn
  logger?: Logger
}

type ValidatedUserInfo = {
  id: string
  email: string
}

/**
 * Validates an API key by calling the backend
 *
 * CHANGE: Exported for testing purposes and accepts optional dependencies
 * Previously this was not exported, making it impossible to test in isolation
 */
export async function validateApiKey({
  apiKey,
  getUserInfoFromApiKey = defaultGetUserInfoFromApiKey,
  logger = defaultLogger,
}: ValidateAuthParams): Promise<ValidatedUserInfo> {
  const requestedFields = ['id', 'email'] as const

  const authResult = await getUserInfoFromApiKey({
    apiKey,
    fields: requestedFields,
    logger,
  })

  if (!authResult) {
    logger.error('❌ API key validation failed - no auth result returned')
    throw new Error('Invalid API key')
  }

  return authResult
}

export interface UseAuthQueryDeps {
  getUserCredentials?: () => User | null
  getUserInfoFromApiKey?: GetUserInfoFromApiKeyFn
  logger?: Logger
}

/**
 * Hook to validate authentication status
 * Uses stored credentials if available, otherwise checks environment variable
 *
 * CHANGE: Now accepts optional dependencies for testing via dependency injection
 */
export function useAuthQuery(deps: UseAuthQueryDeps = {}) {
  const {
    getUserCredentials = defaultGetUserCredentials,
    getUserInfoFromApiKey = defaultGetUserInfoFromApiKey,
    logger = defaultLogger,
  } = deps

  const userCredentials = getUserCredentials()
  const apiKey =
    userCredentials?.authToken || process.env[API_KEY_ENV_VAR] || ''

  return useQuery({
    queryKey: authQueryKeys.validation(apiKey),
    queryFn: () => validateApiKey({ apiKey, getUserInfoFromApiKey, logger }),
    enabled: !!apiKey,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: false, // Don't retry auth failures
  })
}

export interface UseLoginMutationDeps {
  saveUserCredentials?: (user: User) => void
  getUserInfoFromApiKey?: GetUserInfoFromApiKeyFn
  logger?: Logger
}

/**
 * Hook for login mutation
 *
 * CHANGE: Now accepts optional dependencies for testing via dependency injection
 */
export function useLoginMutation(deps: UseLoginMutationDeps = {}) {
  const queryClient = useQueryClient()
  const {
    saveUserCredentials = defaultSaveUserCredentials,
    getUserInfoFromApiKey = defaultGetUserInfoFromApiKey,
    logger = defaultLogger,
  } = deps

  return useMutation({
    mutationFn: async (user: User) => {
      // Save credentials to file system
      saveUserCredentials(user)

      // Validate the new credentials
      const authResult = await validateApiKey({
        apiKey: user.authToken,
        getUserInfoFromApiKey,
        logger,
      })

      const mergedUser = { ...user, ...authResult }
      return mergedUser
    },
    onSuccess: (data) => {
      // Invalidate auth queries to trigger refetch with new credentials
      queryClient.invalidateQueries({ queryKey: authQueryKeys.all })
    },
    onError: (error) => {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        '❌ Login mutation failed',
      )
    },
  })
}

export interface UseLogoutMutationDeps {
  logoutUser?: () => Promise<boolean>
  logger?: Logger
}

/**
 * Hook for logout mutation
 *
 * CHANGE: Now accepts optional dependencies for testing via dependency injection
 */
export function useLogoutMutation(deps: UseLogoutMutationDeps = {}) {
  const queryClient = useQueryClient()
  const { logoutUser = logoutUserUtil, logger = defaultLogger } = deps

  return useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      // Reset the SDK client after logout
      resetCodebuffClient()
      // Clear all auth-related cache
      queryClient.removeQueries({ queryKey: authQueryKeys.all })
    },
    onError: (error) => {
      logger.error(error, 'Logout failed')
    },
  })
}
