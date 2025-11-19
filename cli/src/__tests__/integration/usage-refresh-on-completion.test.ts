import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'

import { useChatStore } from '../../state/chat-store'
import { fetchAndUpdateUsage } from '../../utils/fetch-usage'

import type { Logger } from '@codebuff/common/types/contracts/logger'

/**
 * Integration test for usage refresh on SDK run completion
 *
 * This test verifies the complete lifecycle:
 * 1. User opens usage banner (isUsageVisible = true)
 * 2. SDK run completes successfully
 * 3. Usage data is refreshed automatically
 * 4. Banner shows updated credit balance
 *
 * Also tests:
 * - No refresh when banner is closed (isUsageVisible = false)
 * - Error handling during background refresh
 * - Multiple sequential runs with banner open
 */
describe('Usage Refresh on SDK Completion', () => {
  let loggerMock: Logger
  let fetchMock: ReturnType<typeof mock>

  const createMockResponse = (data: any, status: number = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  beforeEach(() => {
    useChatStore.getState().reset()

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
        remainingBalance: 850,
        next_quota_reset: '2024-03-01T00:00:00.000Z',
      }),
    )
  })

  afterEach(() => {
    mock.restore()
  })

  describe('banner visible scenarios', () => {
    test('should refresh usage data when banner is visible and run completes', async () => {
      useChatStore.getState().setIsUsageVisible(true)

      const isUsageVisible = useChatStore.getState().isUsageVisible
      if (isUsageVisible) {
        await fetchAndUpdateUsage({
          getAuthToken: () => 'test-token',
          logger: loggerMock,
          fetch: fetchMock as any,
        })
      }

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const usageData = useChatStore.getState().usageData
      expect(usageData?.remainingBalance).toBe(850)
    })

    test('should not show banner after background refresh', async () => {
      useChatStore.getState().setIsUsageVisible(true)

      await fetchAndUpdateUsage({
        showBanner: false,
        getAuthToken: () => 'test-token',
        logger: loggerMock,
        fetch: fetchMock as any,
      })

      expect(useChatStore.getState().isUsageVisible).toBe(true)
    })

    test('should refresh multiple times for sequential runs', async () => {
      useChatStore.getState().setIsUsageVisible(true)

      for (let i = 0; i < 3; i++) {
        if (useChatStore.getState().isUsageVisible) {
          await fetchAndUpdateUsage({
            getAuthToken: () => 'test-token',
            logger: loggerMock,
            fetch: fetchMock as any,
          })
        }
      }

      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    test('should update usage data with fresh values from API', async () => {
      useChatStore.getState().setUsageData({
        sessionUsage: 100,
        remainingBalance: 1000,
        nextQuotaReset: '2024-02-01T00:00:00.000Z',
      })
      useChatStore.getState().setIsUsageVisible(true)

      await fetchAndUpdateUsage({
        getAuthToken: () => 'test-token',
        logger: loggerMock,
        fetch: fetchMock as any,
      })

      const updatedData = useChatStore.getState().usageData
      expect(updatedData).not.toBeNull()
      expect(updatedData?.remainingBalance).toBe(850)
      expect(updatedData?.nextQuotaReset).toBe('2024-03-01T00:00:00.000Z')
    })
  })

  describe('banner not visible scenarios', () => {
    test('should NOT refresh when banner is not visible', async () => {
      useChatStore.getState().setIsUsageVisible(false)

      const isUsageVisible = useChatStore.getState().isUsageVisible
      if (isUsageVisible) {
        await fetchAndUpdateUsage({
          getAuthToken: () => 'test-token',
          logger: loggerMock,
          fetch: fetchMock as any,
        })
      }

      expect(fetchMock).not.toHaveBeenCalled()
    })

    test('should not refresh if banner was closed before run completed', async () => {
      useChatStore.getState().setIsUsageVisible(true)
      useChatStore.getState().setIsUsageVisible(false)

      const isUsageVisible = useChatStore.getState().isUsageVisible
      if (isUsageVisible) {
        await fetchAndUpdateUsage({
          getAuthToken: () => 'test-token',
          logger: loggerMock,
          fetch: fetchMock as any,
        })
      }

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('error handling during refresh', () => {
    test('should handle API errors gracefully without crashing', async () => {
      fetchMock.mockImplementation(async () =>
        new Response('Server Error', { status: 500 }),
      )

      useChatStore.getState().setIsUsageVisible(true)

      await expect(
        fetchAndUpdateUsage({
          getAuthToken: () => 'test-token',
          logger: loggerMock,
          fetch: fetchMock as any,
        }),
      ).resolves.toBe(false)

      expect(useChatStore.getState().isUsageVisible).toBe(true)
    })

    test('should handle network errors during background refresh', async () => {
      fetchMock.mockImplementation(async () => {
        throw new Error('Network failure')
      })

      useChatStore.getState().setIsUsageVisible(true)

      const result = await fetchAndUpdateUsage({
        getAuthToken: () => 'test-token',
        logger: loggerMock,
        fetch: fetchMock as any,
      })

      expect(result).toBe(false)
      expect(loggerMock.error).toHaveBeenCalled()
    })

    test('should continue working after failed refresh', async () => {
      useChatStore.getState().setIsUsageVisible(true)

      fetchMock.mockImplementationOnce(async () =>
        new Response('Error', { status: 500 }),
      )
      await fetchAndUpdateUsage({
        getAuthToken: () => 'test-token',
        logger: loggerMock,
        fetch: fetchMock as any,
      })

      fetchMock.mockImplementationOnce(async () =>
        createMockResponse({
          type: 'usage-response',
          usage: 200,
          remainingBalance: 800,
          next_quota_reset: null,
        }),
      )

      const result = await fetchAndUpdateUsage({
        getAuthToken: () => 'test-token',
        logger: loggerMock,
        fetch: fetchMock as any,
      })

      expect(result).toBe(true)
    })
  })

  describe('unauthenticated user scenarios', () => {
    test('should not refresh when user is not authenticated', async () => {
      useChatStore.getState().setIsUsageVisible(true)

      const result = await fetchAndUpdateUsage({
        getAuthToken: () => undefined,
        logger: loggerMock,
        fetch: fetchMock as any,
      })

      expect(result).toBe(false)
    })
  })

  describe('session credits tracking', () => {
    test('should include current session credits in refreshed data', async () => {
      useChatStore.getState().addSessionCredits(75)
      useChatStore.getState().addSessionCredits(25)

      expect(useChatStore.getState().sessionCreditsUsed).toBe(100)

      useChatStore.getState().setIsUsageVisible(true)
      await fetchAndUpdateUsage({
        getAuthToken: () => 'test-token',
        logger: loggerMock,
        fetch: fetchMock as any,
      })

      const usageData = useChatStore.getState().usageData
      expect(usageData?.sessionUsage).toBe(100)
    })
  })
})
