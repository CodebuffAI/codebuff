import { describe, expect, test, spyOn } from 'bun:test'
import { useNetworkStatus, type NetworkStatus } from '../use-network-status'
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

    test('reports validation degradation without marking offline', () => {
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

      expect(result.isOnline).toBe(true)
      expect(result.error).not.toBeNull()
      expect(result.error?.source).toBe('validation')
      expect(result.error?.message).toBe('Failed to connect to validation API')
      expect(result.validation.isReachable).toBe(false)
      expect(result.auth.isReachable).toBe(true)

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
    test('NetworkStatus shape includes auth and validation fields', () => {
      const status: NetworkStatus = {
        isOnline: true,
        error: null,
        auth: { isReachable: true, error: null },
        validation: { isReachable: false, error: 'Validation unavailable' },
      }

      expect(status.isOnline).toBe(true)
      expect(status.error).toBeNull()
      expect(status.auth.isReachable).toBe(true)
      expect(status.validation.isReachable).toBe(false)
      expect(status.validation.error).toBe('Validation unavailable')
    })

    test('error sources are exhaustive', () => {
      const sources: Array<NetworkStatus['error']> = [
        { source: 'auth', message: 'Auth down' },
        { source: 'validation', message: 'Validation down' },
        { source: 'unknown', message: 'Unknown' },
      ]

      sources.forEach((error) => {
        expect(['auth', 'validation', 'unknown']).toContain(error?.source)
      })
    })
  })
})
