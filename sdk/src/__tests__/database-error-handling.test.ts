import { describe, expect, test, beforeEach, mock } from 'bun:test'
import { getUserInfoFromApiKey } from '../impl/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import { isAuthenticationError, isNetworkError } from '../errors'

const setMockFetch = (impl: () => Promise<any>) => {
  globalThis.fetch = mock(impl) as unknown as typeof fetch
}

describe('getUserInfoFromApiKey error handling', () => {
  const originalFetch = globalThis.fetch
  let mockLogger: Logger

  beforeEach(() => {
    // Reset fetch before each test
    globalThis.fetch = originalFetch

    // Create a mock logger
    mockLogger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }
  })

  describe('authentication errors', () => {
    test('throws AUTH_FAILED error for 401 status', async () => {
      setMockFetch(() =>
        Promise.resolve({
          ok: false,
          status: 401,
        } as Response),
      )

      try {
        await getUserInfoFromApiKey({
          apiKey: 'invalid-key',
          fields: ['id', 'email'],
          logger: mockLogger,
        })
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(isAuthenticationError(error)).toBe(true)
        if (isAuthenticationError(error)) {
          expect(error.code).toBe('AUTH_FAILED')
          expect(error.status).toBe(401)
          expect(error.message).toBe('Authentication failed')
        }
      }
    })

    test('throws AUTH_FAILED error for 403 status', async () => {
      setMockFetch(() =>
        Promise.resolve({
          ok: false,
          status: 403,
        } as Response),
      )

      try {
        await getUserInfoFromApiKey({
          apiKey: 'forbidden-key',
          fields: ['id', 'email'],
          logger: mockLogger,
        })
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(isAuthenticationError(error)).toBe(true)
        if (isAuthenticationError(error)) {
          expect(error.code).toBe('AUTH_FAILED')
          expect(error.status).toBe(403)
          expect(error.message).toBe('Authentication failed')
        }
      }
    })

    test('throws NETWORK_ERROR for 500 server errors', async () => {
      setMockFetch(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as Response),
      )

      try {
        await getUserInfoFromApiKey({
          apiKey: 'test-key',
          fields: ['id', 'email'],
          logger: mockLogger,
        })
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(isNetworkError(error)).toBe(true)
        if (isNetworkError(error)) {
          expect(error.code).toBe('NETWORK_ERROR')
          expect(error.message).toContain('Server error')
          expect(error.status).toBe(500)
        }
      }
    })
  })

  describe('network errors', () => {
    test('throws NETWORK_ERROR for fetch failures', async () => {
      setMockFetch(() => Promise.reject(new Error('Network request failed')))

      try {
        await getUserInfoFromApiKey({
          apiKey: 'test-key',
          fields: ['id', 'email'],
          logger: mockLogger,
        })
        expect(true).toBe(false) // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe('NETWORK_ERROR')
        expect(error.message).toBe('Network error: Network request failed')
        expect(error.originalError).toBeDefined()
      }
    })

    test('throws NETWORK_ERROR for connection timeout', async () => {
      setMockFetch(() => Promise.reject(new Error('Connection timeout')))

      try {
        await getUserInfoFromApiKey({
          apiKey: 'test-key',
          fields: ['id', 'email'],
          logger: mockLogger,
        })
        expect(true).toBe(false) // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe('NETWORK_ERROR')
        expect(mockLogger.error).toHaveBeenCalled()
      }
    })

    test('logs network errors with masked API key', async () => {
      setMockFetch(() => Promise.reject(new Error('Network failure')))

      try {
        await getUserInfoFromApiKey({
          apiKey: 'super-secret-key-12345',
          fields: ['id', 'email'],
          logger: mockLogger,
        })
      } catch (error: any) {
        // Verify logger was called with masked API key
        const logCall = (mockLogger.error as any).mock.calls[0]
        expect(logCall).toBeDefined()
        const loggedData = logCall[0]
        expect(loggedData.apiKey).toMatch(/\.\.\.$/) // Should end with ...
        expect(loggedData.apiKey.length).toBeLessThan(20) // Should be truncated
      }
    })
  })

  describe('successful requests', () => {
    test('returns user info for valid API key', async () => {
      setMockFetch(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'user-123',
              email: 'test@example.com',
              name: 'Test User',
            }),
        } as Response),
      )

      const result = await getUserInfoFromApiKey({
        apiKey: 'valid-key',
        fields: ['id', 'email'],
        logger: mockLogger,
      })

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
      })
    })

    test('caches successful results', async () => {
      const mockFetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'user-123',
              email: 'test@example.com',
            }),
        } as Response),
      )
      globalThis.fetch = mockFetch as unknown as typeof fetch

      const apiKey = 'cache-test-key'

      // First call
      await getUserInfoFromApiKey({
        apiKey,
        fields: ['id', 'email'],
        logger: mockLogger,
      })

      // Second call should use cache
      await getUserInfoFromApiKey({
        apiKey,
        fields: ['id', 'email'],
        logger: mockLogger,
      })

      // Fetch should only be called once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('error propagation', () => {
    test('re-throws AUTH_FAILED errors without wrapping', async () => {
      setMockFetch(() =>
        Promise.resolve({
          ok: false,
          status: 401,
        } as Response),
      )

      try {
        await getUserInfoFromApiKey({
          apiKey: 'invalid-key',
          fields: ['id', 'email'],
          logger: mockLogger,
        })
        expect(true).toBe(false)
      } catch (error: any) {
        // Should be the original AUTH_FAILED error, not wrapped in NETWORK_ERROR
        expect(error.code).toBe('AUTH_FAILED')
      }
    })

    test('wraps non-auth errors in NETWORK_ERROR', async () => {
      setMockFetch(() => Promise.reject(new Error('Random error')))

      try {
        await getUserInfoFromApiKey({
          apiKey: 'test-key',
          fields: ['id', 'email'],
          logger: mockLogger,
        })
        expect(true).toBe(false)
      } catch (error: any) {
        expect(error.code).toBe('NETWORK_ERROR')
        expect(error.originalError).toBeDefined()
      }
    })
  })
})
