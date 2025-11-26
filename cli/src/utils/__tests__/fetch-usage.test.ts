import { describe, test, expect, beforeEach, mock } from 'bun:test'

import { fetchAndUpdateUsage } from '../fetch-usage'

import type { CodebuffApiClient } from '../codebuff-api'
import type { FetchAndUpdateUsageParams } from '../fetch-usage'
import type { Logger } from '@codebuff/common/types/contracts/logger'

describe('fetchAndUpdateUsage (deprecated)', () => {
  let setInputModeMock: ReturnType<typeof mock>
  let getAuthTokenMock: ReturnType<typeof mock>
  let loggerMock: Logger
  let apiClientMock: CodebuffApiClient

  // Note: fetch-usage now uses apiClient.usage() instead of apiClient.post()
  const createMockApiClient = (
    usageMock: ReturnType<typeof mock>,
  ): CodebuffApiClient => ({
    get: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as CodebuffApiClient['get'],
    post: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as CodebuffApiClient['post'],
    put: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as CodebuffApiClient['put'],
    patch: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as CodebuffApiClient['patch'],
    delete: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as CodebuffApiClient['delete'],
    request: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as CodebuffApiClient['request'],
    me: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as CodebuffApiClient['me'],
    usage: usageMock as CodebuffApiClient['usage'],
    loginCode: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as CodebuffApiClient['loginCode'],
    loginStatus: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as CodebuffApiClient['loginStatus'],
    referral: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as CodebuffApiClient['referral'],
    publish: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as CodebuffApiClient['publish'],
    logout: mock(() =>
      Promise.resolve({ ok: true, status: 200, data: {} }),
    ) as CodebuffApiClient['logout'],
    baseUrl: 'https://test.codebuff.com',
    authToken: 'test-auth-token',
  })

  const createDefaultParams = (
    overrides: Partial<FetchAndUpdateUsageParams> = {},
  ): FetchAndUpdateUsageParams => ({
    getAuthToken: getAuthTokenMock,
    getChatStore: () => ({
      sessionCreditsUsed: 150,
      setInputMode: setInputModeMock,
    }),
    logger: loggerMock,
    apiClient: apiClientMock,
    ...overrides,
  })

  beforeEach(() => {
    setInputModeMock = mock(() => {})
    getAuthTokenMock = mock(() => 'test-auth-token')
    loggerMock = {
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      debug: mock(() => {}),
    }
    const usageMock = mock(async () => ({
      ok: true,
      status: 200,
      data: {
        type: 'usage-response',
        usage: 100,
        remainingBalance: 500,
        next_quota_reset: '2024-02-01T00:00:00.000Z',
      },
    }))
    apiClientMock = createMockApiClient(usageMock)
  })

  describe('successful usage refresh', () => {
    test('should fetch usage data and update store without showing banner', async () => {
      const result = await fetchAndUpdateUsage(createDefaultParams())

      expect(result).toBe(true)
      // Note: setUsageData no longer called - data managed by TanStack Query
      expect(setInputModeMock).not.toHaveBeenCalled()
    })

    test('should show banner when showBanner parameter is true', async () => {
      const result = await fetchAndUpdateUsage(
        createDefaultParams({ showBanner: true }),
      )

      expect(result).toBe(true)
      // Note: setUsageData no longer called - data managed by TanStack Query
      expect(setInputModeMock).toHaveBeenCalledTimes(1)
      expect(setInputModeMock.mock.calls[0][0]).toBe('usage')
    })

    test('should handle null remainingBalance correctly', async () => {
      const usageMock = mock(async () => ({
        ok: true,
        status: 200,
        data: {
          type: 'usage-response',
          usage: 100,
          remainingBalance: null,
          next_quota_reset: null,
        },
      }))
      const client = createMockApiClient(usageMock)

      const result = await fetchAndUpdateUsage(
        createDefaultParams({ apiClient: client }),
      )

      expect(result).toBe(true)
      // Note: setUsageData no longer called - data managed by TanStack Query
    })

    test('should send correct request to API', async () => {
      const usageMock = mock(async () => ({
        ok: true,
        status: 200,
        data: {
          type: 'usage-response',
          usage: 100,
          remainingBalance: 500,
          next_quota_reset: '2024-02-01T00:00:00.000Z',
        },
      }))
      const client = createMockApiClient(usageMock)

      await fetchAndUpdateUsage(createDefaultParams({ apiClient: client }))

      expect(usageMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('authentication handling', () => {
    test('should return false when user is not authenticated', async () => {
      getAuthTokenMock.mockReturnValue(undefined)

      const result = await fetchAndUpdateUsage(createDefaultParams())

      expect(result).toBe(false)
      expect(setInputModeMock).not.toHaveBeenCalled()
      expect(loggerMock.debug).toHaveBeenCalled()
    })

    test('should not make API call when auth token is missing', async () => {
      getAuthTokenMock.mockReturnValue(null)
      const usageMock = mock(async () => ({ ok: true, status: 200 }))
      const client = createMockApiClient(usageMock)

      await fetchAndUpdateUsage(createDefaultParams({ apiClient: client }))

      expect(usageMock).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    test('should return false on HTTP error responses', async () => {
      const usageMock = mock(async () => ({
        ok: false,
        status: 500,
        error: 'Internal Server Error',
      }))
      const client = createMockApiClient(usageMock)

      const result = await fetchAndUpdateUsage(
        createDefaultParams({ apiClient: client }),
      )

      expect(result).toBe(false)
      expect(loggerMock.error).toHaveBeenCalled()
    })

    test('should return false on 401 Unauthorized', async () => {
      const usageMock = mock(async () => ({
        ok: false,
        status: 401,
        error: 'Unauthorized',
      }))
      const client = createMockApiClient(usageMock)

      const result = await fetchAndUpdateUsage(
        createDefaultParams({ apiClient: client }),
      )

      expect(result).toBe(false)
    })

    test('should return false on network errors', async () => {
      const usageMock = mock(async () => {
        throw new Error('Network connection failed')
      })
      const client = createMockApiClient(usageMock)

      const result = await fetchAndUpdateUsage(
        createDefaultParams({ apiClient: client }),
      )

      expect(result).toBe(false)
      expect(loggerMock.error).toHaveBeenCalled()
    })

    test('should return false on malformed JSON response', async () => {
      const usageMock = mock(async () => ({
        ok: false,
        status: 200,
        error: 'Invalid JSON',
      }))
      const client = createMockApiClient(usageMock)

      const result = await fetchAndUpdateUsage(
        createDefaultParams({ apiClient: client }),
      )

      expect(result).toBe(false)
    })

    test('should handle fetch timeout gracefully', async () => {
      const usageMock = mock(async () => {
        const error = new Error('Request timeout')
        error.name = 'TimeoutError'
        throw error
      })
      const client = createMockApiClient(usageMock)

      const result = await fetchAndUpdateUsage(
        createDefaultParams({ apiClient: client }),
      )

      expect(result).toBe(false)
      expect(loggerMock.error).toHaveBeenCalled()
    })
  })

  describe('session credits handling', () => {
    test('should use current session credits in usage data', async () => {
      const result = await fetchAndUpdateUsage(
        createDefaultParams({
          getChatStore: () => ({
            sessionCreditsUsed: 250,
            setInputMode: setInputModeMock,
          }),
        }),
      )

      expect(result).toBe(true)
      // Note: setUsageData no longer called - data managed by TanStack Query
    })

    test('should handle zero session credits', async () => {
      const result = await fetchAndUpdateUsage(
        createDefaultParams({
          getChatStore: () => ({
            sessionCreditsUsed: 0,
            setInputMode: setInputModeMock,
          }),
        }),
      )

      expect(result).toBe(true)
      // Note: setUsageData no longer called - data managed by TanStack Query
    })
  })

  describe('edge cases', () => {
    test('should handle empty response body gracefully', async () => {
      const usageMock = mock(async () => ({
        ok: true,
        status: 200,
        data: null,
      }))
      const client = createMockApiClient(usageMock)

      // With the new API client, empty/null data is treated as success
      // since ok: true indicates the request succeeded
      const result = await fetchAndUpdateUsage(
        createDefaultParams({ apiClient: client }),
      )

      expect(result).toBe(true)
    })

    test('should handle missing balanceBreakdown field', async () => {
      const usageMock = mock(async () => ({
        ok: true,
        status: 200,
        data: {
          type: 'usage-response',
          usage: 50,
          remainingBalance: 450,
          next_quota_reset: '2024-02-01T00:00:00.000Z',
        },
      }))
      const client = createMockApiClient(usageMock)

      const result = await fetchAndUpdateUsage(
        createDefaultParams({ apiClient: client }),
      )

      expect(result).toBe(true)
      // Note: setUsageData no longer called - data managed by TanStack Query
    })

    test('should handle concurrent calls correctly', async () => {
      let callCount = 0
      const usageMock = mock(async () => {
        callCount++
        await new Promise((resolve) => setTimeout(resolve, 10))
        return {
          ok: true,
          status: 200,
          data: {
            type: 'usage-response',
            usage: 100,
            remainingBalance: 900 - callCount * 10,
            next_quota_reset: null,
          },
        }
      })
      const client = createMockApiClient(usageMock)

      const results = await Promise.all([
        fetchAndUpdateUsage(createDefaultParams({ apiClient: client })),
        fetchAndUpdateUsage(createDefaultParams({ apiClient: client })),
        fetchAndUpdateUsage(
          createDefaultParams({ apiClient: client, showBanner: true }),
        ),
      ])

      expect(results).toEqual([true, true, true])
      // Note: setUsageData no longer called - data managed by TanStack Query
      expect(setInputModeMock).toHaveBeenCalledTimes(1)
    })
  })
})
