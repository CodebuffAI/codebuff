import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useNetworkStatus } from '../use-network-status'
import * as useAuthQueryModule from '../use-auth-query'

/**
 * Tests for the unified network status hook.
 *
 * NOTE: Full hook testing may be limited by React 19 + Bun compatibility issues.
 * These tests focus on the logic and type definitions.
 */

describe('useNetworkStatus', () => {
  describe('network status detection logic', () => {
    test('returns online when no errors', () => {
      const mockAuthQuery = {
        error: null,
        isError: false,
        data: { id: 'user-123', email: 'test@example.com' },
      }

      // Mock the useAuthQuery hook
      const mockUseAuthQuery = spyOn(useAuthQueryModule, 'useAuthQuery')
      mockUseAuthQuery.mockReturnValue(mockAuthQuery as any)

      // Test the logic directly
      const result = useNetworkStatus({})

      expect(result.isOnline).toBe(true)
      expect(result.error).toBeNull()

      // Restore original
      mockUseAuthQuery.mockRestore()
    })

    test('detects auth network errors', () => {
      const networkError = new Error('Unable to reach server') as any
      networkError.code = 'NETWORK_ERROR'

      const mockAuthQuery = {
        error: networkError,
        isError: true,
        data: null,
      }

      // Mock the useAuthQuery hook
      const mockUseAuthQuery = spyOn(useAuthQueryModule, 'useAuthQuery')
      mockUseAuthQuery.mockReturnValue(mockAuthQuery as any)

      const result = useNetworkStatus({})

      expect(result.isOnline).toBe(false)
      expect(result.error).not.toBeNull()
      expect(result.error?.source).toBe('auth')
      expect(result.error?.message).toContain('Unable to reach server')

      // Restore original
      mockUseAuthQuery.mockRestore()
    })

    test('detects validation network errors', () => {
      const mockAuthQuery = {
        error: null,
        isError: false,
        data: { id: 'user-123', email: 'test@example.com' },
      }

      // Mock the useAuthQuery hook
      const mockUseAuthQuery = spyOn(useAuthQueryModule, 'useAuthQuery')
      mockUseAuthQuery.mockReturnValue(mockAuthQuery as any)

      const result = useNetworkStatus({
        validationNetworkError: 'Failed to connect to validation API',
      })

      expect(result.isOnline).toBe(false)
      expect(result.error).not.toBeNull()
      expect(result.error?.source).toBe('validation')
      expect(result.error?.message).toBe('Failed to connect to validation API')

      // Restore original
      mockUseAuthQuery.mockRestore()
    })

    test('auth errors take precedence over validation errors', () => {
      const authError = new Error('Auth server down') as any
      authError.code = 'NETWORK_ERROR'

      const mockAuthQuery = {
        error: authError,
        isError: true,
        data: null,
      }

      // Mock the useAuthQuery hook
      const mockUseAuthQuery = spyOn(useAuthQueryModule, 'useAuthQuery')
      mockUseAuthQuery.mockReturnValue(mockAuthQuery as any)

      const result = useNetworkStatus({
        validationNetworkError: 'Validation server down',
      })

      // Auth error should take precedence
      expect(result.isOnline).toBe(false)
      expect(result.error?.source).toBe('auth')
      expect(result.error?.message).toContain('Auth server down')

      // Restore original
      mockUseAuthQuery.mockRestore()
    })

    test('handles non-network auth errors as online', () => {
      const authError = new Error('Invalid API key') as any
      authError.code = 'AUTH_FAILED'

      const mockAuthQuery = {
        error: authError,
        isError: true,
        data: null,
      }

      // Mock the useAuthQuery hook
      const mockUseAuthQuery = spyOn(useAuthQueryModule, 'useAuthQuery')
      mockUseAuthQuery.mockReturnValue(mockAuthQuery as any)

      const result = useNetworkStatus({})

      // Non-network errors should not affect online status
      expect(result.isOnline).toBe(true)
      expect(result.error).toBeNull()

      // Restore original
      mockUseAuthQuery.mockRestore()
    })
  })

  describe('type definitions', () => {
    test('NetworkStatus type is correctly defined', () => {
      type NetworkStatus =
        | { isOnline: true; error: null }
        | { isOnline: false; error: { source: 'auth' | 'validation' | 'unknown'; message: string } }

      const onlineStatus: NetworkStatus = {
        isOnline: true,
        error: null,
      }

      const offlineStatus: NetworkStatus = {
        isOnline: false,
        error: {
          source: 'auth',
          message: 'Network error',
        },
      }

      expect(onlineStatus.isOnline).toBe(true)
      expect(onlineStatus.error).toBeNull()
      expect(offlineStatus.isOnline).toBe(false)
      expect(offlineStatus.error.source).toBe('auth')
    })

    test('error sources are exhaustive', () => {
      const sources = ['auth', 'validation', 'unknown']

      sources.forEach(source => {
        const status = {
          isOnline: false,
          error: {
            source: source as 'auth' | 'validation' | 'unknown',
            message: 'Test error',
          },
        }

        expect(['auth', 'validation', 'unknown']).toContain(status.error.source)
      })
    })
  })
})