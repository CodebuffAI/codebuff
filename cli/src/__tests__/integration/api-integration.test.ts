import {
  AuthenticationError,
  NetworkError,
  getUserInfoFromApiKey,
} from '@codebuff/sdk'
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'

import type { Logger } from '@codebuff/common/types/contracts/logger'

/**
 * Integration tests for API communication with Codebuff backend
 *
 * These tests verify that the CLI correctly communicates with backend endpoints:
 * - /api/v1/me - User info retrieval with Bearer token auth
 * - /api/auth/cli/status - Login polling endpoint
 * - /api/auth/cli/code - Login URL generation
 *
 * Tests ensure:
 * - Correct HTTP headers (Authorization: Bearer <token>)
 * - Proper query parameters
 * - Response parsing and error handling
 * - Network timeout handling
 */
describe('API Integration', () => {
  const originalFetch = globalThis.fetch
  const originalAppUrl = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL

  type LoggerMocks = Logger & {
    info: ReturnType<typeof mock>
    error: ReturnType<typeof mock>
    warn: ReturnType<typeof mock>
    debug: ReturnType<typeof mock>
  }

  const createLoggerMocks = (): LoggerMocks =>
    ({
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      debug: mock(() => {}),
    }) as LoggerMocks

  const setFetchMock = (
    impl: Parameters<typeof mock>[0],
  ): ReturnType<typeof mock> => {
    const fetchMock = mock(impl)
    globalThis.fetch = fetchMock as unknown as typeof fetch
    return fetchMock
  }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = 'https://example.codebuff.test'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = originalAppUrl
    mock.restore()
  })

  describe('P0: Backend Communication', () => {
    test('should include Authorization Bearer token in /api/v1/me requests', async () => {
      const fetchMock = setFetchMock(async () => {
        return new Response(
          JSON.stringify({ id: 'user', email: 'user@example.com' }),
          { status: 200 },
        )
      })
      const testLogger = createLoggerMocks()

      await getUserInfoFromApiKey({
        apiKey: 'test-token-123',
        fields: ['id'],
        logger: testLogger,
      })

      const [, options] = fetchMock.mock.calls[0]
      expect(options?.headers).toEqual({
        Authorization: 'Bearer test-token-123',
      })
    })

    test('should call /api/v1/me endpoint with proper URL structure', async () => {
      const fetchMock = setFetchMock(async () => {
        return new Response(
          JSON.stringify({ id: 'test-id', email: 'test@example.com' }),
          { status: 200 },
        )
      })
      const testLogger = createLoggerMocks()

      await getUserInfoFromApiKey({
        apiKey: 'url-structure-token',
        fields: ['id', 'email'],
        logger: testLogger,
      })

      const [request] = fetchMock.mock.calls[0]
      const requestedUrl =
        request instanceof Request ? request.url : String(request)

      // Verify the URL starts with the expected base and endpoint
      expect(requestedUrl).toContain('/api/v1/me?')
      // Verify it contains the fields parameter
      expect(requestedUrl).toContain('fields=')
    })

    test('should handle 200 OK responses from /api/v1/me correctly', async () => {
      setFetchMock(async () => {
        return new Response(
          JSON.stringify({
            id: 'test-id',
            email: 'test@example.com',
            discord_id: 'discord-123',
          }),
          { status: 200 },
        )
      })
      const testLogger = createLoggerMocks()

      const result = await getUserInfoFromApiKey({
        apiKey: 'success-token',
        fields: ['id', 'email'],
        logger: testLogger,
      })

      expect(result).toEqual({
        id: 'test-id',
        email: 'test@example.com',
      })
      expect(testLogger.error.mock.calls.length).toBe(0)
    })

    test('should handle 401 Unauthorized responses from /api/v1/me correctly', async () => {
      setFetchMock(async () => {
        return new Response(null, { status: 401 })
      })
      const testLogger = createLoggerMocks()

      await expect(
        getUserInfoFromApiKey({
          apiKey: 'unauthorized-token',
          fields: ['id'],
          logger: testLogger,
        }),
      ).rejects.toBeInstanceOf(AuthenticationError)

      // 401s are now logged as auth failures
      expect(testLogger.error.mock.calls.length).toBeGreaterThan(0)
    })

    test('should treat 404 from /api/v1/me as invalid credentials (AuthenticationError)', async () => {
      setFetchMock(async () => {
        return new Response(null, { status: 404 })
      })
      const testLogger = createLoggerMocks()

      await expect(
        getUserInfoFromApiKey({
          apiKey: 'not-found-token',
          fields: ['id'],
          logger: testLogger,
        }),
      ).rejects.toBeInstanceOf(AuthenticationError)

      expect(testLogger.error.mock.calls.length).toBeGreaterThan(0)
    })
  })

  describe('P1: Error Response Handling', () => {
    test('should handle 500 server errors gracefully', async () => {
      setFetchMock(async () => {
        return new Response('Internal Server Error', { status: 500 })
      })
      const testLogger = createLoggerMocks()

      await expect(
        getUserInfoFromApiKey({
          apiKey: 'server-error-token',
          fields: ['id'],
          logger: testLogger,
        }),
      ).rejects.toBeInstanceOf(NetworkError)

      expect(testLogger.error.mock.calls.length).toBeGreaterThan(0)
    })

    test('should handle network timeouts', async () => {
      setFetchMock(async () => {
        throw new Error('Request timed out')
      })
      const testLogger = createLoggerMocks()

      await expect(
        getUserInfoFromApiKey({
          apiKey: 'timeout-token',
          fields: ['id'],
          logger: testLogger,
        }),
      ).rejects.toBeInstanceOf(NetworkError)

      expect(
        testLogger.error.mock.calls.some(([payload]) =>
          JSON.stringify(payload).includes('Request timed out'),
        ),
      ).toBe(true)
    })

    test('should handle malformed JSON responses', async () => {
      setFetchMock(async () => {
        return new Response('not-json', { status: 200 })
      })
      const testLogger = createLoggerMocks()

      await expect(
        getUserInfoFromApiKey({
          apiKey: 'malformed-json-token',
          fields: ['id'],
          logger: testLogger,
        }),
      ).rejects.toBeInstanceOf(NetworkError)

      expect(testLogger.error.mock.calls.length).toBeGreaterThan(0)
    })
  })

  describe('P2: Network Error Recovery', () => {
    test('should surface network failures without retrying when fetch throws', async () => {
      const fetchMock = setFetchMock(async () => {
        const error = new Error('Network connection lost')
        error.name = 'NetworkError'
        throw error
      })
      const testLogger = createLoggerMocks()

      await expect(
        getUserInfoFromApiKey({
          apiKey: 'network-failure-token',
          fields: ['id'],
          logger: testLogger,
        }),
      ).rejects.toBeInstanceOf(NetworkError)

      expect(fetchMock.mock.calls.length).toBe(1)
      expect(
        testLogger.error.mock.calls.some(([payload]) =>
          JSON.stringify(payload).includes('Network connection lost'),
        ),
      ).toBe(true)
    })

    test('should handle DNS resolution failures gracefully', async () => {
      const fetchMock = setFetchMock(async () => {
        const error = new Error('getaddrinfo ENOTFOUND api.codebuff.local')
        error.name = 'ENOTFOUND'
        throw error
      })
      const testLogger = createLoggerMocks()

      await expect(
        getUserInfoFromApiKey({
          apiKey: 'dns-failure-token',
          fields: ['id'],
          logger: testLogger,
        }),
      ).rejects.toBeInstanceOf(NetworkError)

      expect(fetchMock.mock.calls.length).toBe(1)
      expect(
        testLogger.error.mock.calls.some(([payload]) =>
          JSON.stringify(payload).includes('ENOTFOUND'),
        ),
      ).toBe(true)
    })
  })
})
