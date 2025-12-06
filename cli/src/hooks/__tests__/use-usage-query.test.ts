import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test'
import React from 'react'

import { useChatStore } from '../../state/chat-store'
import * as authModule from '../../utils/auth'
import {
  fetchUsageData,
  useUsageQuery,
  useRefreshUsage,
} from '../use-usage-query'

describe('fetchUsageData', () => {
  const originalFetch = globalThis.fetch
  const originalEnv = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = 'https://test.codebuff.local'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = originalEnv
    mock.restore()
  })

  test('should fetch usage data successfully', async () => {
    const mockResponse = {
      type: 'usage-response' as const,
      usage: 100,
      remainingBalance: 500,
      balanceBreakdown: { free: 300, paid: 200 },
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    const result = await fetchUsageData({ authToken: 'test-token' })

    expect(result).toEqual(mockResponse)
  })

  test('should throw error on failed request', async () => {
    globalThis.fetch = mock(async () => new Response('Error', { status: 500 })) as unknown as typeof fetch
    const mockLogger = { error: mock(() => {}), warn: mock(() => {}), info: mock(() => {}), debug: mock(() => {}) }

    await expect(fetchUsageData({ authToken: 'test-token', logger: mockLogger as any })).rejects.toThrow(
      'Failed to fetch usage: 500',
    )
  })

  test('should throw error when app URL is not set', async () => {
    delete process.env.NEXT_PUBLIC_CODEBUFF_APP_URL

    await expect(fetchUsageData({ authToken: 'test-token' })).rejects.toThrow(
      'NEXT_PUBLIC_CODEBUFF_APP_URL is not set',
    )
  })
})

describe('useUsageQuery', () => {
  let queryClient: QueryClient
  let getAuthTokenSpy: ReturnType<typeof spyOn>
  const originalEnv = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL

  function createWrapper() {
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      )
  }

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = 'https://test.codebuff.local'
    useChatStore.getState().reset()
  })

  afterEach(() => {
    getAuthTokenSpy?.mockRestore()
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = originalEnv
    mock.restore()
  })

  test.skip('should fetch data when enabled', async () => {
    getAuthTokenSpy = spyOn(authModule, 'getAuthToken').mockReturnValue(
      'test-token',
    )

    const mockResponse = {
      type: 'usage-response' as const,
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as unknown as typeof fetch

    const { result } = renderHook(() => useUsageQuery(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockResponse)
  })

  test.skip('should not fetch when disabled', async () => {
    getAuthTokenSpy = spyOn(authModule, 'getAuthToken').mockReturnValue(
      'test-token',
    )
    const fetchMock = mock(async () => new Response('{}')) as unknown as typeof fetch
    globalThis.fetch = fetchMock

    const { result } = renderHook(() => useUsageQuery({ enabled: false }), {
      wrapper: createWrapper(),
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  test.skip('should not fetch when no auth token', async () => {
    getAuthTokenSpy = spyOn(authModule, 'getAuthToken').mockReturnValue(
      undefined,
    )
    const fetchMock = mock(async () => new Response('{}')) as unknown as typeof fetch
    globalThis.fetch = fetchMock

    renderHook(() => useUsageQuery(), {
      wrapper: createWrapper(),
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('useRefreshUsage', () => {
  let queryClient: QueryClient

  function createWrapper() {
    return ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      )
  }

  beforeEach(() => {
    queryClient = new QueryClient()
  })

  test.skip('should invalidate usage queries', async () => {
    const invalidateSpy = mock(queryClient.invalidateQueries.bind(queryClient))
    queryClient.invalidateQueries = invalidateSpy as any

    const { result } = renderHook(() => useRefreshUsage(), {
      wrapper: createWrapper(),
    })

    result.current()

    expect(invalidateSpy).toHaveBeenCalled()
  })
})
