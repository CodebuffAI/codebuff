import { useAuthQuery } from './use-auth-query'
import { isNetworkError } from '@codebuff/sdk'

export type NetworkStatusErrorSource = 'auth' | 'validation' | 'unknown'

export interface NetworkStatusDetails {
  isReachable: boolean
  error: string | null
}

export interface NetworkStatus {
  isOnline: boolean
  error: { source: NetworkStatusErrorSource; message: string } | null
  auth: NetworkStatusDetails
  validation: NetworkStatusDetails
}

interface UseNetworkStatusOptions {
  validationNetworkError?: string | null
}

/**
 * Unified hook for network status detection.
 * Keeps login/auth logic responsive even if the validation service is degraded.
 */
export function useNetworkStatus(
  options: UseNetworkStatusOptions = {},
): NetworkStatus {
  const { validationNetworkError } = options
  const authQuery = useAuthQuery()

  const authNetworkError =
    authQuery.error && isNetworkError(authQuery.error)
      ? authQuery.error.message || 'Unable to reach server'
      : null

  const authStatus: NetworkStatusDetails = {
    isReachable: authNetworkError == null,
    error: authNetworkError,
  }

  const validationStatus: NetworkStatusDetails = {
    isReachable: !validationNetworkError,
    error: validationNetworkError ?? null,
  }

  let consolidatedError: NetworkStatus['error'] = null

  if (!authStatus.isReachable) {
    consolidatedError = {
      source: 'auth',
      message: authStatus.error ?? 'Unable to reach server',
    }
  } else if (!validationStatus.isReachable) {
    consolidatedError = {
      source: 'validation',
      message:
        validationStatus.error ?? 'Validation service is temporarily unavailable',
    }
  }

  return {
    isOnline: authStatus.isReachable,
    error: consolidatedError,
    auth: authStatus,
    validation: validationStatus,
  }
}
