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
const { setupStreamingContext, handleRunError } = await import(
  '../send-message'
)
const { createBatchedMessageUpdater } = await import(
  '../../../utils/message-updater'
)
const { PaymentRequiredError } = await import('@codebuff/sdk')

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
      })

      // Trigger abort
      abortController.abort()

      // Verify wasAbortedByUser is set
      expect(streamRefs.state.wasAbortedByUser).toBe(true)

      // Verify stream status reset
      expect(streamStatus).toBe('idle')

      // Verify queue processing enabled (no isQueuePausedRef)
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
      })

      // Trigger abort
      abortController.abort()

      // When queue is paused, canProcessQueue should be false
      expect(canProcessQueue).toBe(false)
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
      })

      // Verify streamRefs was reset
      expect(streamRefs.state.rootStreamBuffer).toBe('')
      expect(streamRefs.state.rootStreamSeen).toBe(false)

      // Verify timer was started with correct message ID
      expect(timerController.startCalls).toContain('ai-1')
    })
  })
})

describe('handleRunError', () => {
  let mockInvalidateQueries: ReturnType<typeof mock>
  let mockQueryClient: { invalidateQueries: ReturnType<typeof mock> }
  let originalGetState: typeof useChatStore.getState

  beforeEach(() => {
    mockInvalidateQueries = mock(() => {})
    mockQueryClient = { invalidateQueries: mockInvalidateQueries }
    originalGetState = useChatStore.getState
  })

  afterEach(() => {
    useChatStore.getState = originalGetState
  })

  test('appends error to existing streamed content for regular errors', () => {
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
      aiMessageId: 'ai-1',
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
      queryClient: mockQueryClient as any,
    })

    // Flush the batched updates
    updater.flush()

    const aiMessage = messages.find((m) => m.id === 'ai-1')
    expect(aiMessage).toBeDefined()

    // Content should be appended, not overwritten
    expect(aiMessage!.content).toContain('Partial streamed content')
    expect(aiMessage!.content).toContain('Network timeout')

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
      aiMessageId: 'ai-1',
      timerController,
      updater,
      setIsRetrying: () => {},
      setStreamStatus: () => {},
      setCanProcessQueue: () => {},
      updateChainInProgress: () => {},
      queryClient: mockQueryClient as any,
    })

    updater.flush()

    const aiMessage = messages.find((m) => m.id === 'ai-1')
    // Should contain error message
    expect(aiMessage!.content).toContain('Something failed')
    expect(aiMessage!.isComplete).toBe(true)
  })

  test('does not invalidate queries for regular errors', () => {
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
      error: new Error('Regular error'),
      aiMessageId: 'ai-1',
      timerController,
      updater,
      setIsRetrying: () => {},
      setStreamStatus: () => {},
      setCanProcessQueue: () => {},
      updateChainInProgress: () => {},
      queryClient: mockQueryClient as any,
    })

    // Should NOT invalidate queries for regular errors
    expect(mockInvalidateQueries).not.toHaveBeenCalled()
  })

  test('PaymentRequiredError uses setError, invalidates queries, and switches input mode', () => {
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

    const paymentError = new PaymentRequiredError('Out of credits')

    handleRunError({
      error: paymentError,
      aiMessageId: 'ai-1',
      timerController,
      updater,
      setIsRetrying: () => {},
      setStreamStatus: () => {},
      setCanProcessQueue: () => {},
      updateChainInProgress: () => {},
      queryClient: mockQueryClient as any,
    })

    const aiMessage = messages.find((m) => m.id === 'ai-1')
    expect(aiMessage).toBeDefined()

    // For PaymentRequiredError, setError is used which OVERWRITES content
    expect(aiMessage!.content).not.toContain('Partial streamed content')
    expect(aiMessage!.content).toContain('Out of credits')

    // Blocks should be preserved for debugging context
    expect(aiMessage!.blocks).toEqual([{ type: 'text', content: 'some block' }])

    // Message should be marked complete
    expect(aiMessage!.isComplete).toBe(true)

    // Should invalidate queries for payment errors
    expect(mockInvalidateQueries).toHaveBeenCalled()
    // Input mode should switch to usage
    expect(setInputModeMock).toHaveBeenCalledWith('usage')

    // Timer should still be stopped with error
    expect(timerController.stopCalls).toContain('error')
  })
})
