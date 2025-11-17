import { useState, useEffect, useCallback } from 'react'
import { useAuthQuery } from './use-auth-query'

export type NetworkStatus =
  | { isOnline: true; error: null }
  | { isOnline: false; error: { source: 'auth' | 'validation' | 'unknown'; message: string } }

interface UseNetworkStatusOptions {
  validationNetworkError?: string | null
}

/**
 * Unified hook for network status detection.
 * Consolidates network error detection from auth and validation into a single source of truth.
 */
export function useNetworkStatus(options: UseNetworkStatusOptions = {}): NetworkStatus {
  const { validationNetworkError } = options
  const authQuery = useAuthQuery()

  // Check auth query for network errors
  const authNetworkError = authQuery.error && (authQuery.error as any)?.code === 'NETWORK_ERROR'
    ? (authQuery.error as any).message || 'Unable to reach server'
    : null

  // Determine overall network status
  if (authNetworkError) {
    return {
      isOnline: false,
      error: {
        source: 'auth',
        message: authNetworkError,
      },
    }
  }

  if (validationNetworkError) {
    return {
      isOnline: false,
      error: {
        source: 'validation',
        message: validationNetworkError,
      },
    }
  }

  return {
    isOnline: true,
    error: null,
  }
}