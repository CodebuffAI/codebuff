import { describe, test, expect, beforeEach, mock } from 'bun:test'

import { fetchAndUpdateUsage } from '../fetch-usage'

import type { FetchAndUpdateUsageParams } from '../fetch-usage'
import type { Logger } from '@codebuff/common/types/contracts/logger'

describe('fetchAndUpdateUsage (deprecated)', () => {
  let setIsUsageVisibleMock: ReturnType<typeof mock>
  let getAuthTokenMock: ReturnType<typeof mock>
  let loggerMock: Logger
  let fetchMock: ReturnType<typeof mock>

  const createMockResponse = (data: any, status: number = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const createDefaultParams = (
    overrides: Partial<FetchAndUpdateUsageParams> = {},
  ): FetchAndUpdateUsageParams => ({
    getAuthToken: getAuthTokenMock,
    getChatStore: () => ({
      sessionCreditsUsed: 150,
      setIsUsageVisible: setIsUsageVisibleMock,
    }),
    logger: loggerMock,
    fetch: fetchMock as any,
    ...overrides,
  })

  beforeEach(() => {
    setIsUsageVisibleMock = mock(() => {})
    getAuthTokenMock = mock(() => 'test-auth-token')
    loggerMock = {
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      debug: mock(() => {}),
    }
    fetchMock = mock(async () =>
      createMockResponse({
        type: 'usage-response',
        usage: 100,
        remainingBalance: 500,
        next_quota_reset: '2024-02-01T00:00:00.000Z',
      }),
    )
  })

  describe('successful usage refresh', () => {
    test('should fetch usage data and update store without showing banner', async () => {
      const result = await fetchAndUpdateUsage(createDefaultParams())

      expect(result).toBe(true)
      // Note: setUsageData no longer called - data managed by TanStack Query
      expect(setIsUsageVisibleMock).not.toHaveBeenCalled()
    })

    test('should show banner when showBanner parameter is true', async () => {
      const result = await fetchAndUpdateUsage(
        createDefaultParams({ showBanner: true }),
      )

      expect(result).toBe(true)
      // Note: setUsageData no longer called - data managed by TanStack Query
      expect(setIsUsageVisibleMock).toHaveBeenCalledTimes(1)
      expect(setIsUsageVisibleMock.mock.calls[0][0]).toBe(true)
    })

    test('should handle null remainingBalance correctly', async () => {
      fetchMock.mockImplementation(async () =>
        createMockResponse({
          type: 'usage-response',
          usage: 100,
          remainingBalance: null,
          next_quota_reset: null,
        }),
      )

      const result = await fetchAndUpdateUsage(createDefaultParams())

      expect(result).toBe(true)
      // Note: setUsageData no longer called - data managed by TanStack Query
    })

    test('should send correct request to API', async () => {
      await fetchAndUpdateUsage(createDefaultParams())

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, options] = fetchMock.mock.calls[0]

      expect(url).toContain('/api/v1/usage')
      expect(options.method).toBe('POST')
      expect(options.headers['Content-Type']).toBe('application/json')

      const body = JSON.parse(options.body)
      expect(body).toEqual({
        fingerprintId: 'cli-usage',
        authToken: 'test-auth-token',
      })
    })
  })

  describe('authentication handling', () => {
    test('should return false when user is not authenticated', async () => {
      getAuthTokenMock.mockReturnValue(undefined)

      const result = await fetchAndUpdateUsage(createDefaultParams())

      expect(result).toBe(false)
      expect(setIsUsageVisibleMock).not.toHaveBeenCalled()
      expect(loggerMock.debug).toHaveBeenCalled()
    })

    test('should not make API call when auth token is missing', async () => {
      getAuthTokenMock.mockReturnValue(null)

      await fetchAndUpdateUsage(createDefaultParams())

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    test('should return false on HTTP error responses', async () => {
      fetchMock.mockImplementation(async () =>
        new Response('Internal Server Error', { status: 500 }),
      )

      const result = await fetchAndUpdateUsage(createDefaultParams())

      expect(result).toBe(false)
      expect(loggerMock.error).toHaveBeenCalled()
    })

    test('should return false on 401 Unauthorized', async () => {
      fetchMock.mockImplementation(async () =>
        new Response(null, { status: 401 }),
      )

      const result = await fetchAndUpdateUsage(createDefaultParams())

      expect(result).toBe(false)
    })

    test('should return false on network errors', async () => {
      fetchMock.mockImplementation(async () => {
        throw new Error('Network connection failed')
      })

      const result = await fetchAndUpdateUsage(createDefaultParams())

      expect(result).toBe(false)
      expect(loggerMock.error).toHaveBeenCalled()
    })

    test('should return false on malformed JSON response', async () => {
      fetchMock.mockImplementation(async () =>
        new Response('not-valid-json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const result = await fetchAndUpdateUsage(createDefaultParams())

      expect(result).toBe(false)
    })

    test('should handle fetch timeout gracefully', async () => {
      fetchMock.mockImplementation(async () => {
        const error = new Error('Request timeout')
        error.name = 'TimeoutError'
        throw error
      })

      const result = await fetchAndUpdateUsage(createDefaultParams())

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
            setIsUsageVisible: setIsUsageVisibleMock,
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
            setIsUsageVisible: setIsUsageVisibleMock,
          }),
        }),
      )

      expect(result).toBe(true)
      // Note: setUsageData no longer called - data managed by TanStack Query
    })
  })

  describe('edge cases', () => {
    test('should handle empty response body gracefully', async () => {
      fetchMock.mockImplementation(async () =>
        new Response('', { status: 200 }),
      )

      const result = await fetchAndUpdateUsage(createDefaultParams())

      expect(result).toBe(false)
    })

    test('should handle missing balanceBreakdown field', async () => {
      fetchMock.mockImplementation(async () =>
        createMockResponse({
          type: 'usage-response',
          usage: 50,
          remainingBalance: 450,
          next_quota_reset: '2024-02-01T00:00:00.000Z',
        }),
      )

      const result = await fetchAndUpdateUsage(createDefaultParams())

      expect(result).toBe(true)
      // Note: setUsageData no longer called - data managed by TanStack Query
    })

    test('should handle concurrent calls correctly', async () => {
      let callCount = 0
      fetchMock.mockImplementation(async () => {
        callCount++
        await new Promise((resolve) => setTimeout(resolve, 10))
        return createMockResponse({
          type: 'usage-response',
          usage: 100,
          remainingBalance: 900 - callCount * 10,
          next_quota_reset: null,
        })
      })

      const results = await Promise.all([
        fetchAndUpdateUsage(createDefaultParams()),
        fetchAndUpdateUsage(createDefaultParams()),
        fetchAndUpdateUsage(createDefaultParams({ showBanner: true })),
      ])

      expect(results).toEqual([true, true, true])
      // Note: setUsageData no longer called - data managed by TanStack Query
      expect(setIsUsageVisibleMock).toHaveBeenCalledTimes(1)
    })
  })
})
