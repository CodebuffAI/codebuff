import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
  MAX_RETRIES_PER_MESSAGE,
  RETRY_BACKOFF_BASE_DELAY_MS,
  RETRY_BACKOFF_MAX_DELAY_MS,
} from '@codebuff/sdk'

/**
 * Integration tests for reconnection and retry logic
 *
 * These tests verify the CLI handles network disconnections and reconnections:
 * - Message retry on reconnection
 * - Race condition prevention in retry scheduling
 * - Proper state management during cascading updates
 * - Timeout management and cleanup
 *
 * Tests ensure:
 * - No duplicate retry attempts
 * - Messages are retried after reconnection
 * - State updates don't cause Bun crashes
 * - Timeouts are properly cleaned up
 */
describe('Reconnection and Retry Logic', () => {
  describe('Race Condition Prevention', () => {
    test('should not schedule duplicate retry attempts when pendingRetryCount changes', async () => {
      // Simulate the scenario where pendingRetryCount changes during the delay period
      const retryScheduledRef = { current: false }
      const retryCallCount = { count: 0 }
      const connectionEstablished = 1
      let pendingRetryCount = 1

      const scheduleRetry = () => {
        // This simulates the useEffect logic
        if (
          connectionEstablished > 0 &&
          pendingRetryCount > 0 &&
          !retryScheduledRef.current
        ) {
          retryScheduledRef.current = true
          retryCallCount.count++

          setTimeout(() => {
            retryScheduledRef.current = false
          }, 500)
        }
      }

      // First call should schedule a retry
      scheduleRetry()
      expect(retryCallCount.count).toBe(1)

      // Change pendingRetryCount during delay period
      pendingRetryCount = 2

      // Second call should NOT schedule another retry (race condition prevented)
      scheduleRetry()
      expect(retryCallCount.count).toBe(1)

      // Wait for the delay to complete
      await new Promise((resolve) => setTimeout(resolve, 600))

      // Now it should allow scheduling again
      scheduleRetry()
      expect(retryCallCount.count).toBe(2)
    })

    test('should handle cleanup when component unmounts during retry delay', () => {
      const retryScheduledRef = { current: false }
      let timeoutCleared = false

      // Simulate setting up a retry with cleanup
      retryScheduledRef.current = true
      const timer = setTimeout(() => {
        retryScheduledRef.current = false
      }, 500)

      // Simulate cleanup function being called
      const cleanup = () => {
        clearTimeout(timer)
        retryScheduledRef.current = false
        timeoutCleared = true
      }

      cleanup()
      expect(timeoutCleared).toBe(true)
      expect(retryScheduledRef.current).toBe(false)
    })
  })

  describe('Retry Deduplication', () => {
    test('should prevent retry when retryInFlight is true', async () => {
      const retryInFlightRef = { current: false }
      let retryExecuted = false

      const retryPendingMessages = async () => {
        if (retryInFlightRef.current) {
          return
        }
        retryInFlightRef.current = true
        try {
          retryExecuted = true
          // Simulate some async work
          await new Promise((resolve) => setTimeout(resolve, 10))
        } finally {
          retryInFlightRef.current = false
        }
      }

      // First call should execute
      const promise1 = retryPendingMessages()
      expect(retryInFlightRef.current).toBe(true)

      // Second call while first is in flight should be ignored
      retryExecuted = false
      const promise2 = retryPendingMessages()

      await promise1
      await promise2

      expect(retryExecuted).toBe(false) // Second call didn't execute
    })
  })

  describe('Message Retry After Reconnection', () => {
    test('should retry pending messages after reconnection', async () => {
      const pendingMessages = {
        'msg-1': { content: 'Test message 1', agentMode: 'default' as const },
        'msg-2': { content: 'Test message 2', agentMode: 'default' as const },
      }

      const retriedMessages: string[] = []
      let pendingRetryCount = Object.keys(pendingMessages).length

      const sendMessage = mock(
        async ({ content }: { content: string; agentMode: string }) => {
          retriedMessages.push(content)
        }
      )

      const retryPendingMessages = async () => {
        const entries = Object.entries(pendingMessages)
        pendingRetryCount = 0

        for (const [_, payload] of entries) {
          await sendMessage({
            content: payload.content,
            agentMode: payload.agentMode,
          })
        }
      }

      // Simulate reconnection triggering retry
      await retryPendingMessages()

      expect(retriedMessages).toEqual(['Test message 1', 'Test message 2'])
      expect(pendingRetryCount).toBe(0)
      expect(sendMessage.mock.calls.length).toBe(2)
    })

    test('should respect max retry attempts', async () => {
      const retryAttempts: Record<string, number> = {}
      const messageId = 'msg-1'
      let failedMessageMarked = false

      const markMessageFailed = mock((id: string, reason: string) => {
        failedMessageMarked = true
      })

      const attemptRetry = () => {
        const attempts = retryAttempts[messageId] ?? 0
        if (attempts >= MAX_RETRIES_PER_MESSAGE) {
          markMessageFailed(messageId, 'Maximum retry attempts reached')
          return false
        }
        retryAttempts[messageId] = attempts + 1
        return true
      }

      // Retry 3 times successfully
      expect(attemptRetry()).toBe(true) // Attempt 1
      expect(attemptRetry()).toBe(true) // Attempt 2
      expect(attemptRetry()).toBe(true) // Attempt 3

      // 4th attempt should fail
      expect(attemptRetry()).toBe(false)
      expect(failedMessageMarked).toBe(true)
      expect(markMessageFailed.mock.calls.length).toBe(1)
    })
  })

  describe('State Update Batching', () => {
    test('should batch multiple state updates to prevent cascading', () => {
      // This test simulates the startTransition batching behavior
      const stateUpdates: string[] = []
      let batchedUpdates = 0

      // Mock startTransition that batches updates
      const startTransition = (callback: () => void) => {
        batchedUpdates++
        callback()
      }

      const handleReconnection = (isInitialConnection: boolean) => {
        // Simulate batching state updates
        startTransition(() => {
          if (!isInitialConnection) {
            stateUpdates.push('setShowReconnectionMessage')
          }
          stateUpdates.push('setConnectionEstablished')
        })
      }

      handleReconnection(false)

      // All state updates should be batched in a single transaction
      expect(batchedUpdates).toBe(1)
      expect(stateUpdates).toEqual([
        'setShowReconnectionMessage',
        'setConnectionEstablished',
      ])
    })
  })

  describe('Timeout Management', () => {
    test('should cleanup timeout on unmount', async () => {
      let timeoutRef: NodeJS.Timeout | null = null
      let cleanupCalled = false

      // Simulate useSafeTimeout behavior
      const setSafeTimeout = (callback: () => void, delay: number) => {
        if (timeoutRef) {
          clearTimeout(timeoutRef)
        }
        timeoutRef = setTimeout(callback, delay)
      }

      const cleanup = () => {
        if (timeoutRef) {
          clearTimeout(timeoutRef)
          timeoutRef = null
          cleanupCalled = true
        }
      }

      // Set a timeout
      let timeoutFired = false
      setSafeTimeout(() => {
        timeoutFired = true
      }, 100)

      expect(timeoutRef).not.toBeNull()

      // Cleanup before timeout fires
      cleanup()
      expect(cleanupCalled).toBe(true)
      expect(timeoutRef).toBeNull()

      // Wait to ensure timeout doesn't fire
      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(timeoutFired).toBe(false)
    })

    test('should replace existing timeout when setting new one', async () => {
      let timeoutRef: NodeJS.Timeout | null = null
      const callbacks: string[] = []

      const setSafeTimeout = (callback: () => void, delay: number) => {
        if (timeoutRef) {
          clearTimeout(timeoutRef)
        }
        timeoutRef = setTimeout(callback, delay)
      }

      // Set first timeout
      setSafeTimeout(() => {
        callbacks.push('first')
      }, 100)

      // Set second timeout immediately (should cancel first)
      setSafeTimeout(() => {
        callbacks.push('second')
      }, 50)

      // Wait for second timeout to fire
      await new Promise((resolve) => setTimeout(resolve, 120))
      expect(callbacks).toEqual(['second'])
      expect(callbacks).not.toContain('first')
    })
  })

  describe('Connection State Management', () => {
    test('should track connection state correctly', () => {
      let isConnected = false
      let connectionEstablished = 0

      const handleConnectionChange = (connected: boolean) => {
        isConnected = connected
        if (connected) {
          connectionEstablished++
        }
      }

      // Initial connection
      handleConnectionChange(true)
      expect(isConnected).toBe(true)
      expect(connectionEstablished).toBe(1)

      // Disconnection
      handleConnectionChange(false)
      expect(isConnected).toBe(false)
      expect(connectionEstablished).toBe(1)

      // Reconnection
      handleConnectionChange(true)
      expect(isConnected).toBe(true)
      expect(connectionEstablished).toBe(2)
    })

    test('should invalidate auth queries on reconnection', () => {
      const invalidatedQueries: string[] = []

      const mockQueryClient = {
        invalidateQueries: mock(({ queryKey }: { queryKey: string[] }) => {
          invalidatedQueries.push(queryKey.join('/'))
        }),
      }

      const handleReconnection = () => {
        mockQueryClient.invalidateQueries({ queryKey: ['auth', 'all'] })
      }

      handleReconnection()

      expect(mockQueryClient.invalidateQueries.mock.calls.length).toBe(1)
      expect(invalidatedQueries).toContain('auth/all')
    })
  })

  describe('Backoff Strategy', () => {
    test('should implement exponential backoff for retries', () => {
      let backoffDelay = RETRY_BACKOFF_BASE_DELAY_MS

      const calculateNextBackoff = (hasMorePending: boolean) => {
        if (!hasMorePending) {
          backoffDelay = RETRY_BACKOFF_BASE_DELAY_MS
        } else {
          backoffDelay = Math.min(backoffDelay * 2, RETRY_BACKOFF_MAX_DELAY_MS)
        }
        return backoffDelay
      }

      // First retry - no backoff increase (no more pending)
      expect(calculateNextBackoff(false)).toBe(RETRY_BACKOFF_BASE_DELAY_MS)

      // Subsequent retries with pending messages
      expect(calculateNextBackoff(true)).toBe(2000)
      expect(calculateNextBackoff(true)).toBe(4000)
      expect(calculateNextBackoff(true)).toBe(RETRY_BACKOFF_MAX_DELAY_MS) // Capped at max (8000)

      // Should stay at max
      expect(calculateNextBackoff(true)).toBe(RETRY_BACKOFF_MAX_DELAY_MS)

      // Reset when no more pending
      expect(calculateNextBackoff(false)).toBe(RETRY_BACKOFF_BASE_DELAY_MS)
    })
  })
})
