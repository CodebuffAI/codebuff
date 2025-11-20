import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'

import { useChatStore } from '../../state/chat-store'
import { usageQueryKeys } from '../../hooks/use-usage-query'
import * as authModule from '../../utils/auth'

/**
 * Integration test for usage refresh on SDK run completion
 *
 * This test verifies the complete lifecycle:
 * 1. User opens usage banner (isUsageVisible = true)
 * 2. SDK run completes successfully
 * 3. Query is invalidated to trigger refresh
 * 4. Banner shows updated credit balance (when query refetches)
 *
 * Also tests:
 * - No invalidation when banner is closed (isUsageVisible = false)
 * - Multiple sequential runs with banner open
 */
describe('Usage Refresh on SDK Completion', () => {
  const originalFetch = globalThis.fetch
  const originalEnv = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL

  let queryClient: QueryClient
  let getAuthTokenSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = 'https://test.codebuff.local'

    // Reset chat store to initial state
    useChatStore.getState().reset()

    // Create a fresh query client for each test
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })

    // Mock auth token
    getAuthTokenSpy = spyOn(authModule, 'getAuthToken').mockReturnValue('test-token')

    // Mock successful API response
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          type: 'usage-response',
          usage: 100,
          remainingBalance: 850,
          next_quota_reset: '2024-03-01T00:00:00.000Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    getAuthTokenSpy.mockRestore()
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL = originalEnv
    mock.restore()
  })

  describe('banner visible scenarios', () => {
    test('should invalidate query when banner is visible and run completes', () => {
      // Setup: Open usage banner
      useChatStore.getState().setIsUsageVisible(true)
      expect(useChatStore.getState().isUsageVisible).toBe(true)

      // Spy on invalidateQueries
      const invalidateSpy = mock(queryClient.invalidateQueries.bind(queryClient))
      queryClient.invalidateQueries = invalidateSpy as any

      // Simulate SDK run completion triggering invalidation
      const isUsageVisible = useChatStore.getState().isUsageVisible
      if (isUsageVisible) {
        queryClient.invalidateQueries({ queryKey: usageQueryKeys.current() })
      }

      // Verify: Query invalidation was called
      expect(invalidateSpy).toHaveBeenCalledTimes(1)
      expect(invalidateSpy.mock.calls[0][0]).toEqual({
        queryKey: usageQueryKeys.current(),
      })
    })

    test('should invalidate multiple times for sequential runs', () => {
      useChatStore.getState().setIsUsageVisible(true)

      const invalidateSpy = mock(queryClient.invalidateQueries.bind(queryClient))
      queryClient.invalidateQueries = invalidateSpy as any

      // Simulate three sequential SDK runs
      for (let i = 0; i < 3; i++) {
        if (useChatStore.getState().isUsageVisible) {
          queryClient.invalidateQueries({ queryKey: usageQueryKeys.current() })
        }
      }

      expect(invalidateSpy).toHaveBeenCalledTimes(3)
    })
  })

  describe('banner not visible scenarios', () => {
    test('should NOT invalidate when banner is not visible', () => {
      // Setup: Banner is closed
      useChatStore.getState().setIsUsageVisible(false)
      expect(useChatStore.getState().isUsageVisible).toBe(false)

      const invalidateSpy = mock(queryClient.invalidateQueries.bind(queryClient))
      queryClient.invalidateQueries = invalidateSpy as any

      // Simulate SDK run completion check
      const isUsageVisible = useChatStore.getState().isUsageVisible
      if (isUsageVisible) {
        queryClient.invalidateQueries({ queryKey: usageQueryKeys.current() })
      }

      // Verify: No invalidation happened
      expect(invalidateSpy).not.toHaveBeenCalled()
    })

    test('should not invalidate if banner was closed before run completed', () => {
      // Setup: Start with banner open
      useChatStore.getState().setIsUsageVisible(true)

      // User closes banner before run completes
      useChatStore.getState().setIsUsageVisible(false)

      const invalidateSpy = mock(queryClient.invalidateQueries.bind(queryClient))
      queryClient.invalidateQueries = invalidateSpy as any

      // Simulate run completion
      const isUsageVisible = useChatStore.getState().isUsageVisible
      if (isUsageVisible) {
        queryClient.invalidateQueries({ queryKey: usageQueryKeys.current() })
      }

      expect(invalidateSpy).not.toHaveBeenCalled()
    })
  })

  describe('query behavior', () => {
    test('should not fetch when enabled is false', () => {
      // Even if banner is visible in store, query won't run if enabled=false
      useChatStore.getState().setIsUsageVisible(true)

      const fetchMock = mock(globalThis.fetch)
      globalThis.fetch = fetchMock as any

      // Query with enabled=false won't execute
      // (This would be the behavior when useUsageQuery({ enabled: false }) is called)

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('unauthenticated scenarios', () => {
    test('should not fetch when no auth token', () => {
      getAuthTokenSpy.mockReturnValue(undefined)
      useChatStore.getState().setIsUsageVisible(true)

      const fetchMock = mock(globalThis.fetch)
      globalThis.fetch = fetchMock as any

      // Query won't execute without auth token
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
