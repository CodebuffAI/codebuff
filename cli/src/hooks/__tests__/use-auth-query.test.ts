import { describe, expect, test, beforeEach, mock, afterEach } from 'bun:test'
import { validateApiKey } from '../use-auth-query'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'

/**
 * Tests for the validateApiKey function and useAuthQuery hook.
 * 
 * These tests verify the error handling improvements that distinguish between
 * network errors and authentication errors.
 */

describe('validateApiKey', () => {
  let mockLogger: Logger
  let mockGetUserInfoFromApiKey: ReturnType<typeof mock<GetUserInfoFromApiKeyFn>>

  beforeEach(() => {
    mockLogger = {
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      debug: mock(() => {}),
    }
  })

  afterEach(() => {
    mock.restore()
  })

  describe('successful validation', () => {
    test('returns user info for valid API key', async () => {
      mockGetUserInfoFromApiKey = mock<GetUserInfoFromApiKeyFn>(async () => ({
        id: 'user-123',
        email: 'test@example.com',
        discord_id: null,
      }))

      const result = await validateApiKey({
        apiKey: 'valid-key',
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey as any,
        logger: mockLogger,
      })

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
      })
      expect(mockGetUserInfoFromApiKey).toHaveBeenCalledTimes(1)
    })

    test('passes correct parameters to getUserInfoFromApiKey', async () => {
      mockGetUserInfoFromApiKey = mock<GetUserInfoFromApiKeyFn>(async () => ({
        id: 'user-456',
        email: 'user@test.com',
        discord_id: null,
      }))

      await validateApiKey({
        apiKey: 'test-api-key',
        getUserInfoFromApiKey: mockGetUserInfoFromApiKey as any,
        logger: mockLogger,
      })

      const callArgs = mockGetUserInfoFromApiKey.mock.calls[0][0]
      expect(callArgs.apiKey).toBe('test-api-key')
      expect(callArgs.fields).toEqual(['id', 'email'])
      expect(callArgs.logger).toBe(mockLogger)
    })
  })

  describe('network errors', () => {
    test('re-throws NETWORK_ERROR with original code', async () => {
      const networkError = new Error(
        'Network error: Unable to reach server',
      ) as any
      networkError.code = 'NETWORK_ERROR'

      mockGetUserInfoFromApiKey = mock<GetUserInfoFromApiKeyFn>(async () => {
        throw networkError
      })

      try {
        await validateApiKey({
          apiKey: 'test-key',
          getUserInfoFromApiKey: mockGetUserInfoFromApiKey as any,
          logger: mockLogger,
        })
        expect(true).toBe(false) // Should not reach here
      } catch (error: any) {
        expect(error.code).toBe('NETWORK_ERROR')
        expect(error.message).toContain('Unable to reach server')
      }
    })

    test('logs warning for network errors', async () => {
      const networkError = new Error('Network timeout') as any
      networkError.code = 'NETWORK_ERROR'

      mockGetUserInfoFromApiKey = mock<GetUserInfoFromApiKeyFn>(async () => {
        throw networkError
      })

      try {
        await validateApiKey({
          apiKey: 'test-key',
          getUserInfoFromApiKey: mockGetUserInfoFromApiKey as any,
          logger: mockLogger,
        })
      } catch (error) {
        // Expected to throw
      }

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '⚠️ Network error: Unable to reach server',
      )
    })
  })

  describe('authentication errors', () => {
    test('throws AUTH_FAILED error for invalid credentials', async () => {
      mockGetUserInfoFromApiKey = mock<GetUserInfoFromApiKeyFn>(async () => null)

      try {
        await validateApiKey({
          apiKey: 'invalid-key',
          getUserInfoFromApiKey: mockGetUserInfoFromApiKey as any,
          logger: mockLogger,
        })
        expect(true).toBe(false) // Should not reach here
      } catch (error: any) {
        expect(error.message).toBe('Invalid API key')
      }
    })

    test('re-throws AUTH_FAILED with code preserved', async () => {
      const authError = new Error('Authentication failed') as any
      authError.code = 'AUTH_FAILED'

      mockGetUserInfoFromApiKey = mock<GetUserInfoFromApiKeyFn>(async () => {
        throw authError
      })

      try {
        await validateApiKey({
          apiKey: 'bad-key',
          getUserInfoFromApiKey: mockGetUserInfoFromApiKey as any,
          logger: mockLogger,
        })
        expect(true).toBe(false)
      } catch (error: any) {
        expect(error.code).toBe('AUTH_FAILED')
        expect(error.message).toBe('Invalid API key')
      }
    })

    test('logs error for authentication failures', async () => {
      const authError = new Error('Auth failed') as any
      authError.code = 'AUTH_FAILED'

      mockGetUserInfoFromApiKey = mock<GetUserInfoFromApiKeyFn>(async () => {
        throw authError
      })

      try {
        await validateApiKey({
          apiKey: 'bad-key',
          getUserInfoFromApiKey: mockGetUserInfoFromApiKey as any,
          logger: mockLogger,
        })
      } catch (error) {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ Authentication failed - invalid API key',
      )
    })
  })

  describe('unknown errors', () => {
    test('logs and re-throws unknown errors', async () => {
      const unknownError = new Error('Something went wrong')

      mockGetUserInfoFromApiKey = mock<GetUserInfoFromApiKeyFn>(async () => {
        throw unknownError
      })

      try {
        await validateApiKey({
          apiKey: 'test-key',
          getUserInfoFromApiKey: mockGetUserInfoFromApiKey as any,
          logger: mockLogger,
        })
        expect(true).toBe(false)
      } catch (error: any) {
        expect(error.message).toBe('Something went wrong')
        expect(error.code).toBeUndefined() // Unknown errors don't have our custom codes
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ API key validation failed with unknown error',
      )
    })

    test('handles null response as authentication error', async () => {
      mockGetUserInfoFromApiKey = mock<GetUserInfoFromApiKeyFn>(async () => null)

      try {
        await validateApiKey({
          apiKey: 'test-key',
          getUserInfoFromApiKey: mockGetUserInfoFromApiKey as any,
          logger: mockLogger,
        })
        expect(true).toBe(false)
      } catch (error: any) {
        expect(error.message).toBe('Invalid API key')
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        '❌ API key validation failed - no auth result returned',
      )
    })
  })

  describe('error type distinction', () => {
    test('different error codes result in different behavior', async () => {
      const testCases = [
        {
          errorCode: 'NETWORK_ERROR',
          expectedLogLevel: 'warn',
          shouldPreserveCode: true,
        },
        {
          errorCode: 'AUTH_FAILED',
          expectedLogLevel: 'error',
          shouldPreserveCode: true,
        },
      ]

      for (const testCase of testCases) {
        // Reset mocks
        mockLogger = {
          error: mock(() => {}),
          warn: mock(() => {}),
          info: mock(() => {}),
          debug: mock(() => {}),
        }

        const error = new Error('Test error') as any
        error.code = testCase.errorCode

        mockGetUserInfoFromApiKey = mock<GetUserInfoFromApiKeyFn>(async () => {
          throw error
        })

        try {
          await validateApiKey({
            apiKey: 'test-key',
            getUserInfoFromApiKey: mockGetUserInfoFromApiKey as any,
            logger: mockLogger,
          })
        } catch (caughtError: any) {
          if (testCase.shouldPreserveCode) {
            // For known error types, code should be preserved or set
            expect(caughtError.code).toBeDefined()
          }
        }

        // Verify correct log level was used
        if (testCase.expectedLogLevel === 'warn') {
          expect(mockLogger.warn).toHaveBeenCalled()
        } else if (testCase.expectedLogLevel === 'error') {
          expect(mockLogger.error).toHaveBeenCalled()
        }
      }
    })
  })
})
