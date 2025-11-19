import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

import { fetchUsageData, useUsageQuery, useRefreshUsage } from '../use-usage-query'
import { useChatStore } from '../../state/chat-store'
import * as authModule from '../../utils/auth'

import type { UsageData } from '../../state/chat-store'

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
      type: 'usage-response',
      usage: 100,
      remainingBalance: 500,
      balanceBreakdown: { free: 300, paid: 200 },
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await fetchUsageData({ authToken: 'test-token' })

    expect(result).toEqual(mockResponse)
  })

  test('should throw error on failed request', async () => {
    globalThis.fetch = mock(async () => new Response('Error', { status: 500 }))

    await expect(fetchUsageData({ authToken: 'test-token' })).rejects.toThrow(
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
  const originalGetAuthToken = authModule.getAuthToken
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
    authModule.getAuthToken = originalGetAuthToken
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = originalEnv
    mock.restore()
  })

  test('should fetch and update store when enabled', async () => {
    authModule.getAuthToken = mock(() => 'test-token')

    const mockResponse = {
      type: 'usage-response' as const,
      usage: 100,
      remainingBalance: 500,
      next_quota_reset: '2024-02-01T00:00:00.000Z',
    }

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const { result } = renderHook(() => useUsageQuery(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockResponse)
  })

  test('should not fetch when disabled', async () => {
    authModule.getAuthToken = mock(() => 'test-token')
    const fetchMock = mock(async () => new Response('{}'))
    globalThis.fetch = fetchMock

    const { result } = renderHook(() => useUsageQuery({ enabled: false }), {
      wrapper: createWrapper(),
    })

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  test('should not fetch when no auth token', async () => {
    authModule.getAuthToken = mock(() => undefined)
    const fetchMock = mock(async () => new Response('{}'))
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

  test('should invalidate usage queries', async () => {
    const invalidateSpy = mock(queryClient.invalidateQueries.bind(queryClient))
    queryClient.invalidateQueries = invalidateSpy as any

    const { result } = renderHook(() => useRefreshUsage(), {
      wrapper: createWrapper(),
    })

    result.current()

    expect(invalidateSpy).toHaveBeenCalled()
  })
})
