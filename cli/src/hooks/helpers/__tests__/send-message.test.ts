import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test'

import type { ChatMessage } from '../../../types/chat'
import type { SendMessageTimerController } from '../../../utils/send-message-timer'
import type { StreamStatus } from '../../use-message-queue'

// Ensure required env vars exist so logger/env parsing succeeds in tests
const ensureEnv = () => {
  process.env.NEXT_PUBLIC_CB_ENVIRONMENT =
    process.env.NEXT_PUBLIC_CB_ENVIRONMENT || 'test'
  process.env.NEXT_PUBLIC_CODEBUFF_APP_URL =
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'https://app.codebuff.test'
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL =
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@codebuff.test'
  process.env.NEXT_PUBLIC_POSTHOG_API_KEY =
    process.env.NEXT_PUBLIC_POSTHOG_API_KEY || 'phc_test_key'
  process.env.NEXT_PUBLIC_POSTHOG_HOST_URL =
    process.env.NEXT_PUBLIC_POSTHOG_HOST_URL || 'https://posthog.codebuff.test'
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_123'
  process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL =
    process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL ||
    'https://stripe.codebuff.test'
  process.env.NEXT_PUBLIC_WEB_PORT = process.env.NEXT_PUBLIC_WEB_PORT || '3000'
}

ensureEnv()

const { useChatStore } = await import('../../../state/chat-store')
const { createStreamController } = await import('../../stream-state')
const { setupStreamingContext, handleRunError, finalizeQueueState, resetEarlyReturnState } = await import(
  '../send-message'
)
const { createBatchedMessageUpdater } = await import(
  '../../../utils/message-updater'
)
import { createPaymentRequiredError } from '@codebuff/sdk'

const createMockTimerController = (): SendMessageTimerController & {
  startCalls: string[]
  stopCalls: Array<'success' | 'error' | 'aborted'>
} => {
  const startCalls: string[] = []
  const stopCalls: Array<'success' | 'error' | 'aborted'> = []

  return {
    startCalls,
    stopCalls,
    start: (messageId: string) => {
      startCalls.push(messageId)
    },
    stop: (outcome: 'success' | 'error' | 'aborted') => {
      stopCalls.push(outcome)
      return { finishedAt: Date.now(), elapsedMs: 100 }
    },
    pause: () => {},
    resume: () => {},
    isActive: () => startCalls.length > stopCalls.length,
  }
}

const createBaseMessages = (): ChatMessage[] => [
  {
    id: 'ai-1',
    variant: 'ai',
    content: 'Partial streamed content',
    blocks: [{ type: 'text', content: 'Some text' }],
    timestamp: 'now',
  },
]

describe('setupStreamingContext', () => {
  describe('abort flow', () => {
    test('abort handler appends interruption notice and marks complete', () => {
      let messages = createBaseMessages()
      const streamRefs = createStreamController()
      const timerController = createMockTimerController()
      const abortControllerRef = { current: null as AbortController | null }
      let streamStatus: StreamStatus = 'idle'
      let canProcessQueue = false
      let chainInProgress = true
      let isRetrying = true

      const { updater, abortController } = setupStreamingContext({
        aiMessageId: 'ai-1',
        timerController,
        setMessages: (fn: any) => {
          messages = fn(messages)
        },
        streamRefs,
        abortControllerRef,
        setStreamStatus: (status: StreamStatus) => {
          streamStatus = status
        },
        setCanProcessQueue: (can: boolean) => {
          canProcessQueue = can
        },
        updateChainInProgress: (value: boolean) => {
          chainInProgress = value
        },
        setIsRetrying: (value: boolean) => {
          isRetrying = value
        },
        setStreamingAgents: () => {},
      })

      // Trigger abort
      abortController.abort()

      // Verify wasAbortedByUser is set
      expect(streamRefs.state.wasAbortedByUser).toBe(true)

      // Verify stream status reset
      expect(streamStatus).toBe('idle')

      // Verify queue processing enabled (no pause ref)
      expect(canProcessQueue).toBe(true)

      // Verify chain in progress reset
      expect(chainInProgress).toBe(false)

      // Verify retrying reset
      expect(isRetrying).toBe(false)

      // Verify timer stopped with 'aborted' outcome
      expect(timerController.stopCalls).toContain('aborted')

      // Flush any pending updates to check interruption notice
      updater.flush()

      // Verify interruption notice appended (the message should have been updated)
      const aiMessage = messages.find((m: ChatMessage) => m.id === 'ai-1')
      expect(aiMessage).toBeDefined()

      // The interruption notice should be added to blocks
      const lastBlock = aiMessage!.blocks?.[aiMessage!.blocks.length - 1]
      expect(lastBlock?.type).toBe('text')
      expect((lastBlock as any)?.content).toContain('[response interrupted]')

      // Verify message marked complete
      expect(aiMessage!.isComplete).toBe(true)
    })

    test('abort respects isQueuePausedRef when set', () => {
      let messages = createBaseMessages()
      const streamRefs = createStreamController()
      const timerController = createMockTimerController()
      const abortControllerRef = { current: null as AbortController | null }
      const isQueuePausedRef = { current: true }
      let canProcessQueue = false

      const { abortController } = setupStreamingContext({
        aiMessageId: 'ai-1',
        timerController,
        setMessages: (fn: any) => {
          messages = fn(messages)
        },
        streamRefs,
        abortControllerRef,
        setStreamStatus: () => {},
        setCanProcessQueue: (can: boolean) => {
          canProcessQueue = can
        },
        isQueuePausedRef,
        updateChainInProgress: () => {},
        setIsRetrying: () => {},
        setStreamingAgents: () => {},
      })

      // Trigger abort
      abortController.abort()

      // When queue was paused before streaming, canProcessQueue should be false
      expect(canProcessQueue).toBe(false)
    })

    test('abort resets isProcessingQueueRef to false', () => {
      let messages = createBaseMessages()
      const streamRefs = createStreamController()
      const timerController = createMockTimerController()
      const abortControllerRef = { current: null as AbortController | null }
      const isProcessingQueueRef = { current: true }

      const { abortController } = setupStreamingContext({
        aiMessageId: 'ai-1',
        timerController,
        setMessages: (fn: any) => {
          messages = fn(messages)
        },
        streamRefs,
        abortControllerRef,
        setStreamStatus: () => {},
        setCanProcessQueue: () => {},
        isProcessingQueueRef,
        updateChainInProgress: () => {},
        setIsRetrying: () => {},
        setStreamingAgents: () => {},
      })

      // Verify ref starts as true
      expect(isProcessingQueueRef.current).toBe(true)

      // Trigger abort
      abortController.abort()

      // Verify isProcessingQueueRef is reset to false after abort
      expect(isProcessingQueueRef.current).toBe(false)
    })

    test('abort with both isProcessingQueueRef and isQueuePausedRef handles correctly', () => {
      let messages = createBaseMessages()
      const streamRefs = createStreamController()
      const timerController = createMockTimerController()
      const abortControllerRef = { current: null as AbortController | null }
      const isProcessingQueueRef = { current: true }
      const isQueuePausedRef = { current: true }
      let streamStatus = 'streaming' as StreamStatus
      let canProcessQueue = true
      let chainInProgress = true
      let isRetrying = true

      const { abortController } = setupStreamingContext({
        aiMessageId: 'ai-1',
        timerController,
        setMessages: (fn: any) => {
          messages = fn(messages)
        },
        streamRefs,
        abortControllerRef,
        setStreamStatus: (status) => {
          streamStatus = status
        },
        setCanProcessQueue: (can) => {
          canProcessQueue = can
        },
        isQueuePausedRef,
        isProcessingQueueRef,
        updateChainInProgress: (value) => {
          chainInProgress = value
        },
        setIsRetrying: (value) => {
          isRetrying = value
        },
        setStreamingAgents: () => {},
      })

      // Sanity check initial state
      expect(isProcessingQueueRef.current).toBe(true)
      expect(isQueuePausedRef.current).toBe(true)
      expect(streamStatus).toBe('streaming')
      expect(canProcessQueue).toBe(true)
      expect(chainInProgress).toBe(true)
      expect(isRetrying).toBe(true)

      // Trigger abort
      abortController.abort()

      // After abort, lock should be released, queue should respect pause state,
      // chain and retry flags should be cleared, and stream should be idle.
      expect(isProcessingQueueRef.current).toBe(false)
      expect(canProcessQueue).toBe(false)
      expect(chainInProgress).toBe(false)
      expect(isRetrying).toBe(false)
      expect(streamStatus).toBe('idle')
    })

    test('abort handler stores abortController in ref', () => {
      let messages = createBaseMessages()
      const streamRefs = createStreamController()
      const timerController = createMockTimerController()
      const abortControllerRef = { current: null as AbortController | null }

      const { abortController } = setupStreamingContext({
        aiMessageId: 'ai-1',
        timerController,
        setMessages: (fn: any) => {
          messages = fn(messages)
        },
        streamRefs,
        abortControllerRef,
        setStreamStatus: () => {},
        setCanProcessQueue: () => {},
        updateChainInProgress: () => {},
        setIsRetrying: () => {},
        setStreamingAgents: () => {},
      })

      // Verify abortController is stored in ref
      expect(abortControllerRef.current).toBe(abortController)
    })

    test('setupStreamingContext resets streamRefs and starts timer', () => {
      let messages = createBaseMessages()
      const streamRefs = createStreamController()
      // Pre-populate some state
      streamRefs.state.rootStreamBuffer = 'some old content'
      streamRefs.state.rootStreamSeen = true

      const timerController = createMockTimerController()
      const abortControllerRef = { current: null as AbortController | null }

      setupStreamingContext({
        aiMessageId: 'ai-1',
        timerController,
        setMessages: (fn: any) => {
          messages = fn(messages)
        },
        streamRefs,
        abortControllerRef,
        setStreamStatus: () => {},
        setCanProcessQueue: () => {},
        updateChainInProgress: () => {},
        setIsRetrying: () => {},
        setStreamingAgents: () => {},
      })

      // Verify streamRefs was reset
      expect(streamRefs.state.rootStreamBuffer).toBe('')
      expect(streamRefs.state.rootStreamSeen).toBe(false)

      // Verify timer was started with correct message ID
      expect(timerController.startCalls).toContain('ai-1')
    })
  })
})

describe('finalizeQueueState', () => {
  test('sets stream status to idle and resets queue state', () => {
    let streamStatus = 'streaming' as StreamStatus
    let canProcessQueue = false
    let chainInProgress = true
    const isProcessingQueueRef = { current: true }

    finalizeQueueState({
      setStreamStatus: (status) => { streamStatus = status },
      setCanProcessQueue: (can) => { canProcessQueue = can },
      updateChainInProgress: (value) => { chainInProgress = value },
      isProcessingQueueRef,
    })

    expect(streamStatus).toBe('idle')
    expect(canProcessQueue).toBe(true)
    expect(chainInProgress).toBe(false)
    expect(isProcessingQueueRef.current).toBe(false)
  })

  test('calls resumeQueue instead of setCanProcessQueue when provided', () => {
    let streamStatus = 'streaming' as StreamStatus
    let canProcessQueueCalled = false
    let resumeQueueCalled = false
    let chainInProgress = true

    finalizeQueueState({
      setStreamStatus: (status) => { streamStatus = status },
      setCanProcessQueue: () => { canProcessQueueCalled = true },
      updateChainInProgress: (value) => { chainInProgress = value },
      resumeQueue: () => { resumeQueueCalled = true },
    })

    expect(streamStatus).toBe('idle')
    expect(resumeQueueCalled).toBe(true)
    expect(canProcessQueueCalled).toBe(false)
    expect(chainInProgress).toBe(false)
  })

  test('respects isQueuePausedRef when no resumeQueue provided', () => {
    let canProcessQueue = true
    const isQueuePausedRef = { current: true }

    finalizeQueueState({
      setStreamStatus: () => {},
      setCanProcessQueue: (can) => { canProcessQueue = can },
      updateChainInProgress: () => {},
      isQueuePausedRef,
    })

    // When queue was paused before streaming, canProcessQueue should be false
    expect(canProcessQueue).toBe(false)
  })
})

describe('handleRunError', () => {
  let originalGetState: typeof useChatStore.getState

  beforeEach(() => {
    originalGetState = useChatStore.getState
  })

  afterEach(() => {
    useChatStore.getState = originalGetState
  })

  test('stores error in userError field for regular errors', () => {
    let messages: ChatMessage[] = [
      {
        id: 'ai-1',
        variant: 'ai',
        content: 'Partial streamed content',
        blocks: [],
        timestamp: 'now',
      },
    ]

    const timerController = createMockTimerController()
    const updater = createBatchedMessageUpdater('ai-1', (fn: any) => {
      messages = fn(messages)
    })

    let streamStatus: StreamStatus = 'idle'
    let canProcessQueue = false
    let chainInProgress = true
    let isRetrying = true

    handleRunError({
      error: new Error('Network timeout'),
      timerController,
      updater,
      setIsRetrying: (value: boolean) => {
        isRetrying = value
      },
      setStreamStatus: (status: StreamStatus) => {
        streamStatus = status
      },
      setCanProcessQueue: (can: boolean) => {
        canProcessQueue = can
      },
      updateChainInProgress: (value: boolean) => {
        chainInProgress = value
      },
    })

    const aiMessage = messages.find((m) => m.id === 'ai-1')
    expect(aiMessage).toBeDefined()

    // Content should be preserved, error stored in userError
    expect(aiMessage!.content).toBe('Partial streamed content')
    expect(aiMessage!.userError).toBe('Network timeout')

    // Verify state resets
    expect(streamStatus).toBe('idle')
    expect(canProcessQueue).toBe(true)
    expect(chainInProgress).toBe(false)
    expect(isRetrying).toBe(false)

    // Verify timer stopped with error
    expect(timerController.stopCalls).toContain('error')

    // Verify message marked complete
    expect(aiMessage!.isComplete).toBe(true)
  })

  test('handles empty existing content gracefully', () => {
    let messages: ChatMessage[] = [
      {
        id: 'ai-1',
        variant: 'ai',
        content: '',
        blocks: [],
        timestamp: 'now',
      },
    ]

    const timerController = createMockTimerController()
    const updater = createBatchedMessageUpdater('ai-1', (fn: any) => {
      messages = fn(messages)
    })

    handleRunError({
      error: new Error('Something failed'),
      timerController,
      updater,
      setIsRetrying: () => {},
      setStreamStatus: () => {},
      setCanProcessQueue: () => {},
      updateChainInProgress: () => {},
    })

    const aiMessage = messages.find((m) => m.id === 'ai-1')
    // Error should be in userError field
    expect(aiMessage!.userError).toBe('Something failed')
    expect(aiMessage!.isComplete).toBe(true)
  })

  test('handles regular errors without switching input mode', () => {
    let messages: ChatMessage[] = [
      {
        id: 'ai-1',
        variant: 'ai',
        content: '',
        blocks: [],
        timestamp: 'now',
      },
    ]

    const timerController = createMockTimerController()
    const updater = createBatchedMessageUpdater('ai-1', (fn: any) => {
      messages = fn(messages)
    })

    const setInputModeMock = mock(() => {})
    useChatStore.getState = () => ({
      ...originalGetState(),
      setInputMode: setInputModeMock,
    })

    handleRunError({
      error: new Error('Regular error'),
      timerController,
      updater,
      setIsRetrying: () => {},
      setStreamStatus: () => {},
      setCanProcessQueue: () => {},
      updateChainInProgress: () => {},
    })

    // Should NOT switch input mode for regular errors
    expect(setInputModeMock).not.toHaveBeenCalled()
  })

  test('resets isProcessingQueueRef to false on error', () => {
    let messages: ChatMessage[] = [
      {
        id: 'ai-1',
        variant: 'ai',
        content: '',
        blocks: [],
        timestamp: 'now',
      },
    ]

    const timerController = createMockTimerController()
    const updater = createBatchedMessageUpdater('ai-1', (fn: any) => {
      messages = fn(messages)
    })
    const isProcessingQueueRef = { current: true }

    // Verify ref starts as true
    expect(isProcessingQueueRef.current).toBe(true)

    handleRunError({
      error: new Error('Some error'),
      timerController,
      updater,
      setIsRetrying: () => {},
      setStreamStatus: () => {},
      setCanProcessQueue: () => {},
      updateChainInProgress: () => {},
      isProcessingQueueRef,
    })

    // Verify isProcessingQueueRef is reset to false
    expect(isProcessingQueueRef.current).toBe(false)
  })

  test('respects isQueuePausedRef when setting canProcessQueue on error', () => {
    let messages: ChatMessage[] = [
      {
        id: 'ai-1',
        variant: 'ai',
        content: '',
        blocks: [],
        timestamp: 'now',
      },
    ]

    const timerController = createMockTimerController()
    const updater = createBatchedMessageUpdater('ai-1', (fn: any) => {
      messages = fn(messages)
    })
    const isQueuePausedRef = { current: true }
    let canProcessQueue = true

    handleRunError({
      error: new Error('Some error'),
      timerController,
      updater,
      setIsRetrying: () => {},
      setStreamStatus: () => {},
      setCanProcessQueue: (can: boolean) => {
        canProcessQueue = can
      },
      updateChainInProgress: () => {},
      isQueuePausedRef,
    })

    // When queue was paused before streaming, canProcessQueue should be false
    expect(canProcessQueue).toBe(false)
  })

  test('context length exceeded error (AI_APICallError) stores error in userError and preserves content', () => {
    let messages: ChatMessage[] = [
      {
        id: 'ai-1',
        variant: 'ai',
        content: 'Partial streamed content before error',
        blocks: [{ type: 'text', content: 'some block content' }],
        timestamp: 'now',
      },
    ]

    const timerController = createMockTimerController()
    const updater = createBatchedMessageUpdater('ai-1', (fn: any) => {
      messages = fn(messages)
    })

    // Create an error that matches the real AI_APICallError structure
    const contextLengthError = Object.assign(
      new Error(
        "This endpoint's maximum context length is 200000 tokens. However, you requested about 201209 tokens (158536 of text input, 10673 of tool input, 32000 in the output). Please reduce the length of either one, or use the \"middle-out\" transform to compress your prompt automatically."
      ),
      {
        name: 'AI_APICallError',
        statusCode: 400,
      }
    )

    let streamStatus = 'streaming' as StreamStatus
    let canProcessQueue = false
    let chainInProgress = true
    let isRetrying = true

    handleRunError({
      error: contextLengthError,
      timerController,
      updater,
      setIsRetrying: (value: boolean) => {
        isRetrying = value
      },
      setStreamStatus: (status: StreamStatus) => {
        streamStatus = status
      },
      setCanProcessQueue: (can: boolean) => {
        canProcessQueue = can
      },
      updateChainInProgress: (value: boolean) => {
        chainInProgress = value
      },
    })

    const aiMessage = messages.find((m) => m.id === 'ai-1')
    expect(aiMessage).toBeDefined()

    // Content should be preserved
    expect(aiMessage!.content).toBe('Partial streamed content before error')

    // Blocks should be preserved
    expect(aiMessage!.blocks).toEqual([{ type: 'text', content: 'some block content' }])

    // Error should be stored in userError (displayed in UserErrorBanner)
    expect(aiMessage!.userError).toContain('maximum context length is 200000 tokens')
    expect(aiMessage!.userError).toContain('201209 tokens')

    // Message should be marked complete
    expect(aiMessage!.isComplete).toBe(true)

    // State should be reset
    expect(streamStatus).toBe('idle')
    expect(canProcessQueue).toBe(true)
    expect(chainInProgress).toBe(false)
    expect(isRetrying).toBe(false)

    // Timer should be stopped with error
    expect(timerController.stopCalls).toContain('error')
  })

  test('Payment required error (402) uses setError, invalidates queries, and switches input mode', () => {
    let messages: ChatMessage[] = [
      {
        id: 'ai-1',
        variant: 'ai',
        content: 'Partial streamed content',
        blocks: [{ type: 'text', content: 'some block' }],
        timestamp: 'now',
      },
    ]

    const timerController = createMockTimerController()
    const updater = createBatchedMessageUpdater('ai-1', (fn: any) => {
      messages = fn(messages)
    })

    const setInputModeMock = mock(() => {})
    useChatStore.getState = () => ({
      ...originalGetState(),
      setInputMode: setInputModeMock,
    })

    const paymentError = createPaymentRequiredError('Out of credits')

    handleRunError({
      error: paymentError,
      timerController,
      updater,
      setIsRetrying: () => {},
      setStreamStatus: () => {},
      setCanProcessQueue: () => {},
      updateChainInProgress: () => {},
    })

    const aiMessage = messages.find((m) => m.id === 'ai-1')
    expect(aiMessage).toBeDefined()

    // For PaymentRequiredError, setError sets userError (not content)
    // Content is preserved, error is stored in userError field
    expect(aiMessage!.content).toBe('Partial streamed content')
    expect(aiMessage!.userError).toContain('Out of credits')

    // Blocks should be preserved for debugging context
    expect(aiMessage!.blocks).toEqual([{ type: 'text', content: 'some block' }])

    // Message should be marked complete
    expect(aiMessage!.isComplete).toBe(true)

    // Input mode should switch to outOfCredits
    expect(setInputModeMock).toHaveBeenCalledWith('outOfCredits')

    // Timer should still be stopped with error
    expect(timerController.stopCalls).toContain('error')
  })
})

/**
 * Tests for early return queue state reset in sendMessage.
 * These test the resetEarlyReturnState helper used across multiple early return paths:
 * - prepareUserMessage exception
 * - validation failure (success: false)
 * - validation exception
 */
describe('resetEarlyReturnState', () => {
  describe('prepareUserMessage exception path', () => {
    test('resets chain in progress to false', () => {
      let chainInProgress = true

      resetEarlyReturnState({
        updateChainInProgress: (value) => { chainInProgress = value },
        setCanProcessQueue: () => {},
      })

      expect(chainInProgress).toBe(false)
    })

    test('sets canProcessQueue to true when queue is not paused', () => {
      let canProcessQueue = false
      const isQueuePausedRef = { current: false }

      resetEarlyReturnState({
        updateChainInProgress: () => {},
        setCanProcessQueue: (can) => { canProcessQueue = can },
        isQueuePausedRef,
      })

      expect(canProcessQueue).toBe(true)
    })

    test('sets canProcessQueue to false when queue is paused', () => {
      let canProcessQueue = true
      const isQueuePausedRef = { current: true }

      resetEarlyReturnState({
        updateChainInProgress: () => {},
        setCanProcessQueue: (can) => { canProcessQueue = can },
        isQueuePausedRef,
      })

      expect(canProcessQueue).toBe(false)
    })

    test('resets isProcessingQueueRef to false', () => {
      const isProcessingQueueRef = { current: true }

      resetEarlyReturnState({
        updateChainInProgress: () => {},
        setCanProcessQueue: () => {},
        isProcessingQueueRef,
      })

      expect(isProcessingQueueRef.current).toBe(false)
    })

    test('handles missing isProcessingQueueRef gracefully', () => {
      // Should not throw when isProcessingQueueRef is undefined
      expect(() => {
        resetEarlyReturnState({
          updateChainInProgress: () => {},
          setCanProcessQueue: () => {},
        })
      }).not.toThrow()
    })

    test('handles missing isQueuePausedRef gracefully (defaults to canProcessQueue=true)', () => {
      let canProcessQueue = false

      resetEarlyReturnState({
        updateChainInProgress: () => {},
        setCanProcessQueue: (can) => { canProcessQueue = can },
        // No isQueuePausedRef - should default to !undefined = true
      })

      expect(canProcessQueue).toBe(true)
    })
  })

  describe('validation failure path (success: false)', () => {
    test('resets all queue state correctly when processing queued message', () => {
      let chainInProgress = true
      let canProcessQueue = false
      const isProcessingQueueRef = { current: true }
      const isQueuePausedRef = { current: false }

      resetEarlyReturnState({
        updateChainInProgress: (value) => { chainInProgress = value },
        setCanProcessQueue: (can) => { canProcessQueue = can },
        isProcessingQueueRef,
        isQueuePausedRef,
      })

      expect(chainInProgress).toBe(false)
      expect(canProcessQueue).toBe(true)
      expect(isProcessingQueueRef.current).toBe(false)
    })

    test('respects queue paused state after validation failure', () => {
      let chainInProgress = true
      let canProcessQueue = true
      const isProcessingQueueRef = { current: true }
      const isQueuePausedRef = { current: true }

      resetEarlyReturnState({
        updateChainInProgress: (value) => { chainInProgress = value },
        setCanProcessQueue: (can) => { canProcessQueue = can },
        isProcessingQueueRef,
        isQueuePausedRef,
      })

      expect(chainInProgress).toBe(false)
      expect(canProcessQueue).toBe(false) // Queue was paused, should stay paused
      expect(isProcessingQueueRef.current).toBe(false)
    })
  })

  describe('validation exception path', () => {
    test('resets all queue state correctly when validation throws', () => {
      let chainInProgress = true
      let canProcessQueue = false
      const isProcessingQueueRef = { current: true }
      const isQueuePausedRef = { current: false }

      // Simulating what happens after catching validation exception
      resetEarlyReturnState({
        updateChainInProgress: (value) => { chainInProgress = value },
        setCanProcessQueue: (can) => { canProcessQueue = can },
        isProcessingQueueRef,
        isQueuePausedRef,
      })

      expect(chainInProgress).toBe(false)
      expect(canProcessQueue).toBe(true)
      expect(isProcessingQueueRef.current).toBe(false)
    })

    test('preserves queue pause state when validation throws', () => {
      let canProcessQueue = true
      const isQueuePausedRef = { current: true }
      const isProcessingQueueRef = { current: true }

      resetEarlyReturnState({
        updateChainInProgress: () => {},
        setCanProcessQueue: (can) => { canProcessQueue = can },
        isProcessingQueueRef,
        isQueuePausedRef,
      })

      // Queue was explicitly paused before, should remain paused after error
      expect(canProcessQueue).toBe(false)
      // But processing lock should be released to allow manual resume
      expect(isProcessingQueueRef.current).toBe(false)
    })
  })

  describe('complete early return scenarios', () => {
    test('queue can process next message after prepareUserMessage exception', () => {
      // Scenario: Message was being processed from queue, prepareUserMessage throws
      let chainInProgress = true
      let canProcessQueue = false
      const isProcessingQueueRef = { current: true }
      const isQueuePausedRef = { current: false }

      // After exception, reset is called
      resetEarlyReturnState({
        updateChainInProgress: (value) => { chainInProgress = value },
        setCanProcessQueue: (can) => { canProcessQueue = can },
        isProcessingQueueRef,
        isQueuePausedRef,
      })

      // Queue should be able to process next message
      expect(chainInProgress).toBe(false)
      expect(canProcessQueue).toBe(true)
      expect(isProcessingQueueRef.current).toBe(false)
    })

    test('queue can process next message after validation returns success=false', () => {
      // Scenario: Message was being processed, validation returns failure
      let chainInProgress = true
      let canProcessQueue = false
      const isProcessingQueueRef = { current: true }
      const isQueuePausedRef = { current: false }

      resetEarlyReturnState({
        updateChainInProgress: (value) => { chainInProgress = value },
        setCanProcessQueue: (can) => { canProcessQueue = can },
        isProcessingQueueRef,
        isQueuePausedRef,
      })

      // All locks released, queue can continue
      expect(chainInProgress).toBe(false)
      expect(canProcessQueue).toBe(true)
      expect(isProcessingQueueRef.current).toBe(false)
    })

    test('queue can process next message after validation throws exception', () => {
      // Scenario: Message was being processed, validation throws
      let chainInProgress = true
      let canProcessQueue = false
      const isProcessingQueueRef = { current: true }
      const isQueuePausedRef = { current: false }

      resetEarlyReturnState({
        updateChainInProgress: (value) => { chainInProgress = value },
        setCanProcessQueue: (can) => { canProcessQueue = can },
        isProcessingQueueRef,
        isQueuePausedRef,
      })

      // All locks released, queue can continue
      expect(chainInProgress).toBe(false)
      expect(canProcessQueue).toBe(true)
      expect(isProcessingQueueRef.current).toBe(false)
    })

    test('queue remains blocked after error if user had paused it', () => {
      // Scenario: User paused queue, then an error occurred
      // Queue should remain paused after error recovery
      let chainInProgress = true
      let canProcessQueue = true
      const isProcessingQueueRef = { current: true }
      const isQueuePausedRef = { current: true } // User explicitly paused

      resetEarlyReturnState({
        updateChainInProgress: (value) => { chainInProgress = value },
        setCanProcessQueue: (can) => { canProcessQueue = can },
        isProcessingQueueRef,
        isQueuePausedRef,
      })

      // Chain is no longer in progress
      expect(chainInProgress).toBe(false)
      // But queue should remain blocked because user paused it
      expect(canProcessQueue).toBe(false)
      // Processing lock is released though
      expect(isProcessingQueueRef.current).toBe(false)
    })
  })
})
