import { describe, expect, test } from 'bun:test'

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
}

ensureEnv()

const { createStreamController } = await import('../../stream-state')
const {
  cleanupProviderReadinessFailure,
  createRunOwnership,
  formatFileAttachmentForPrompt,
  setupStreamingContext,
  handleRunCompletion,
  handleRunError,
  finalizeQueueState,
  resetEarlyReturnState,
} = await import('../send-message')
const { createBatchedMessageUpdater } =
  await import('../../../utils/message-updater')
import type { RunState } from '@openbuff/sdk'
import type { PendingFileAttachment } from '../../../types/store'

type TestHttpError = Error & { statusCode: number }

const createPaymentRequiredError = (message: string): TestHttpError => {
  const error = new Error(message) as TestHttpError
  error.statusCode = 402
  return error
}

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

describe('createRunOwnership', () => {
  test('superseding run owns persistence and stale owner release cannot clear it', () => {
    const activeRunOwnerRef = { current: null as symbol | null }

    const runA = createRunOwnership(activeRunOwnerRef)
    expect(runA.isCurrentRunOwner()).toBe(true)

    const runB = createRunOwnership(activeRunOwnerRef)
    expect(runA.isCurrentRunOwner()).toBe(false)
    expect(runB.isCurrentRunOwner()).toBe(true)

    runA.releaseRunOwner()
    expect(runB.isCurrentRunOwner()).toBe(true)

    runB.releaseRunOwner()
    expect(runB.isCurrentRunOwner()).toBe(false)
    expect(activeRunOwnerRef.current).toBe(null)
  })

  test('run is active only while it still owns the ref and has not been aborted', () => {
    const activeRunOwnerRef = { current: null as symbol | null }
    const abortController = new AbortController()

    const runA = createRunOwnership(activeRunOwnerRef)
    expect(runA.isCurrentRunActive(abortController.signal)).toBe(true)

    abortController.abort()
    expect(runA.isCurrentRunActive(abortController.signal)).toBe(false)

    const runBAbortController = new AbortController()
    const runB = createRunOwnership(activeRunOwnerRef)
    expect(runA.isCurrentRunActive(runBAbortController.signal)).toBe(false)
    expect(runB.isCurrentRunActive(runBAbortController.signal)).toBe(true)
  })

  test('early-return cleanup releases the current run owner', () => {
    const activeRunOwnerRef = { current: null as symbol | null }
    const run = createRunOwnership(activeRunOwnerRef)

    expect(run.isCurrentRunOwner()).toBe(true)
    run.releaseRunOwner()

    expect(run.isCurrentRunOwner()).toBe(false)
    expect(activeRunOwnerRef.current).toBe(null)
  })
})

describe('file attachment prompt provenance', () => {
  test('labels guaranteed @file reads and warns when context is truncated', () => {
    const attachment = {
      kind: 'file',
      id: 'file-1',
      path: 'src/large.ts',
      filename: 'large.ts',
      isDirectory: false,
      content: 'partial source',
      status: 'ready',
      completeness: 'truncated',
      provenance: '@file selection',
      bytesRead: 102400,
      totalBytes: 200000,
    } as PendingFileAttachment

    const prompt = formatFileAttachmentForPrompt(attachment)

    expect(prompt).toContain('source=@file selection')
    expect(prompt).toContain('completeness=truncated')
    expect(prompt).toContain('bytes=102400/200000')
    expect(prompt).toContain('Use read_files/read_subtree to verify')
  })
})

describe('cleanupProviderReadinessFailure', () => {
  test('sets error state, releases queue/chain locks, and releases run ownership', () => {
    let messages = createBaseMessages()
    const updater = createBatchedMessageUpdater('ai-1', (fn: any) => {
      messages = fn(messages)
    })
    const timerController = createMockTimerController()
    const isProcessingQueueRef = { current: true }
    const isQueuePausedRef = { current: false }
    const activeRunOwnerRef = { current: null as symbol | null }
    const run = createRunOwnership(activeRunOwnerRef)
    let streamStatus: StreamStatus = 'waiting'
    let canProcessQueue = false
    let chainInProgress = true

    cleanupProviderReadinessFailure({
      message: 'Provider is not ready',
      updater,
      timerController,
      setStreamStatus: (status) => {
        streamStatus = status
      },
      setCanProcessQueue: (can) => {
        canProcessQueue = can
      },
      updateChainInProgress: (value) => {
        chainInProgress = value
      },
      releaseRunOwner: run.releaseRunOwner,
      isProcessingQueueRef,
      isQueuePausedRef,
    })

    expect(messages[0].userError).toBe('Provider is not ready')
    expect(timerController.stopCalls).toEqual(['error'])
    expect(streamStatus as StreamStatus).toBe('idle')
    expect(canProcessQueue).toBe(true)
    expect(chainInProgress).toBe(false)
    expect(isProcessingQueueRef.current).toBe(false)
    expect(activeRunOwnerRef.current).toBe(null)
  })
})

describe('setupStreamingContext', () => {
  describe('abort flow', () => {
    test('abort handler marks cancelling and retains the chain lock until settlement', () => {
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

      expect(streamStatus as StreamStatus).toBe('cancelling')
      expect(chainInProgress).toBe(true)
      expect(canProcessQueue).toBe(false)

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
      const textBlock = lastBlock as { type: 'text'; content: string }
      expect(textBlock?.content).toContain('[response interrupted]')

      // Verify message marked complete
      expect(aiMessage!.isComplete).toBe(true)
    })

    test('abort sets canProcessQueue based on queue pause state', () => {
      let messages = createBaseMessages()
      const streamRefs = createStreamController()
      const timerController = createMockTimerController()
      const abortControllerRef = { current: null as AbortController | null }
      const isQueuePausedRef = { current: true }
      let canProcessQueue = false
      let canProcessQueueCallCount = 0

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
          canProcessQueueCallCount++
        },
        isQueuePausedRef,
        updateChainInProgress: () => {},
        setIsRetrying: () => {},
        setStreamingAgents: () => {},
      })

      // Trigger abort
      abortController.abort()

      // Abort handler sets canProcessQueue respecting queue pause state
      expect(canProcessQueueCallCount).toBe(1)
      // Queue was paused, so canProcessQueue stays false
      expect(canProcessQueue).toBe(false)
    })

    test('abort retains isProcessingQueueRef until the run settles', () => {
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

      expect(isProcessingQueueRef.current).toBe(true)
    })

    test('abort retains chain and processing ownership while cancelling', () => {
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

      expect(isProcessingQueueRef.current).toBe(true)
      expect(canProcessQueue).toBe(false)
      expect(chainInProgress).toBe(true)
      expect(isRetrying).toBe(false)
      expect(streamStatus).toBe('cancelling')
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

describe('handleRunCompletion', () => {
  describe('abort path', () => {
    test('finalizes queue state after an aborted run settles', () => {
      const timerController = createMockTimerController()
      let messages = createBaseMessages()
      const updater = createBatchedMessageUpdater('ai-1', (fn: any) => {
        messages = fn(messages)
      })

      // These simulate state that was already cleaned up by the abort handler
      let streamStatus: StreamStatus = 'idle'
      let canProcessQueue = true
      let chainInProgress = false
      const isProcessingQueueRef = { current: false }
      const isQueuePausedRef = { current: false }
      let hasReceivedPlanResponse = false

      // Track if setters are called (they shouldn't be)
      let setStreamStatusCalled = false
      let setCanProcessQueueCalled = false
      let updateChainInProgressCalled = false

      const runState = {
        sessionState: undefined,
        output: { type: 'lastMessage' as const, value: [] },
      }

      handleRunCompletion({
        runState,
        actualCredits: undefined,
        agentMode: 'DEFAULT' as any,
        timerController,
        updater,
        aiMessageId: 'ai-1',
        wasAbortedByUser: true,
        setStreamStatus: (status: StreamStatus) => {
          setStreamStatusCalled = true
          streamStatus = status
        },
        setCanProcessQueue: (can: boolean) => {
          setCanProcessQueueCalled = true
          canProcessQueue = can
        },
        updateChainInProgress: (value: boolean) => {
          updateChainInProgressCalled = true
          chainInProgress = value
        },
        setHasReceivedPlanResponse: (value: boolean) => {
          hasReceivedPlanResponse = value
        },
        isProcessingQueueRef,
        isQueuePausedRef,
      })

      expect(setStreamStatusCalled).toBe(true)
      expect(setCanProcessQueueCalled).toBe(true)
      expect(updateChainInProgressCalled).toBe(true)
    })

    test('does not process server response when wasAbortedByUser is true', () => {
      const timerController = createMockTimerController()
      let messages = createBaseMessages()
      const updater = createBatchedMessageUpdater('ai-1', (fn: any) => {
        messages = fn(messages)
      })

      let hasReceivedPlanResponse = false

      const runState = {
        sessionState: undefined,
        output: {
          type: 'lastMessage' as const,
          value: [
            {
              type: 'text' as const,
              text: 'Server response that should be ignored',
            },
          ],
        },
      }

      handleRunCompletion({
        runState,
        actualCredits: 42,
        agentMode: 'PLAN' as any,
        timerController,
        updater,
        aiMessageId: 'ai-1',
        wasAbortedByUser: true,
        setStreamStatus: () => {},
        setCanProcessQueue: () => {},
        updateChainInProgress: () => {},
        setHasReceivedPlanResponse: (value: boolean) => {
          hasReceivedPlanResponse = value
        },
      })

      // Should NOT set plan response (abort path returns early before processing output)
      expect(hasReceivedPlanResponse).toBe(false)

      // Timer should NOT be stopped by handleRunCompletion (abort handler already stopped it)
      expect(timerController.stopCalls).not.toContain('success')
      expect(timerController.stopCalls).not.toContain('error')
    })

    test('resumes queue only after the aborted run settles', () => {
      const timerController = createMockTimerController()
      let messages = createBaseMessages()
      const updater = createBatchedMessageUpdater('ai-1', (fn: any) => {
        messages = fn(messages)
      })

      let resumeQueueCalled = false
      let canProcessQueueCalled = false

      const runState = {
        sessionState: undefined,
        output: { type: 'lastMessage' as const, value: [] },
      }

      handleRunCompletion({
        runState,
        actualCredits: undefined,
        agentMode: 'DEFAULT' as any,
        timerController,
        updater,
        aiMessageId: 'ai-1',
        wasAbortedByUser: true,
        setStreamStatus: () => {},
        setCanProcessQueue: () => {
          canProcessQueueCalled = true
        },
        updateChainInProgress: () => {},
        setHasReceivedPlanResponse: () => {},
        resumeQueue: () => {
          resumeQueueCalled = true
        },
      })

      expect(resumeQueueCalled).toBe(true)
      expect(canProcessQueueCalled).toBe(false)
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
      setStreamStatus: (status) => {
        streamStatus = status
      },
      setCanProcessQueue: (can) => {
        canProcessQueue = can
      },
      updateChainInProgress: (value) => {
        chainInProgress = value
      },
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
      setStreamStatus: (status) => {
        streamStatus = status
      },
      setCanProcessQueue: () => {
        canProcessQueueCalled = true
      },
      updateChainInProgress: (value) => {
        chainInProgress = value
      },
      resumeQueue: () => {
        resumeQueueCalled = true
      },
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
      setCanProcessQueue: (can) => {
        canProcessQueue = can
      },
      updateChainInProgress: () => {},
      isQueuePausedRef,
    })

    // When queue was paused before streaming, canProcessQueue should be false
    expect(canProcessQueue).toBe(false)
  })
})

describe('handleRunError', () => {
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
        'This endpoint\'s maximum context length is 200000 tokens. However, you requested about 201209 tokens (158536 of text input, 10673 of tool input, 32000 in the output). Please reduce the length of either one, or use the "middle-out" transform to compress your prompt automatically.',
      ),
      {
        name: 'AI_APICallError',
        statusCode: 400,
      },
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
    expect(aiMessage!.blocks).toEqual([
      { type: 'text', content: 'some block content' },
    ])

    // Error should be stored in userError (displayed in UserErrorBanner)
    expect(aiMessage!.userError).toContain(
      'maximum context length is 200000 tokens',
    )
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

  test('Payment required error (402) is displayed without switching input mode', () => {
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

    // Timer should still be stopped with error
    expect(timerController.stopCalls).toContain('error')
  })
})

/**
 * CLI-level async race test: reproduces the exact bug scenario where aborting
 * run A and attempting run B before A resolves would lose message history.
 *
 * This test simulates the full lifecycle at the helper level:
 * 1. Start run A (setupStreamingContext)
 * 2. Abort run A mid-stream
 * 3. Attempt run B — verify it's blocked (chain lock held)
 * 4. Resolve run A (handleRunCompletion with updated state)
 * 5. Verify run B is now unblocked and can use state from A
 */
describe('CLI-level race condition: abort run A, attempt run B before A resolves', () => {
  /**
   * Simulates the queue-processing gate checks from useMessageQueue.processNextMessage.
   * Returns true if a queued message would be allowed to proceed.
   */
  const canQueueProcessNextMessage = (opts: {
    isChainInProgress: boolean
    canProcessQueue: boolean
    streamStatus: StreamStatus
    isProcessingQueue: boolean
    isQueuePaused: boolean
  }): boolean => {
    if (opts.isQueuePaused) return false
    if (!opts.canProcessQueue) return false
    if (opts.streamStatus !== 'idle') return false
    if (opts.isChainInProgress) return false
    if (opts.isProcessingQueue) return false
    return true
  }

  test('run B remains blocked while run A is cancelling', () => {
    // --- Shared mutable state (simulates React refs and state in the CLI) ---
    let streamStatus: StreamStatus = 'idle'
    let canProcessQueue = false
    let chainInProgress = true // Set true at start of sendMessage
    const isProcessingQueueRef = { current: false }
    const isQueuePausedRef = { current: false }

    const setStreamStatus = (status: StreamStatus) => {
      streamStatus = status
    }
    const setCanProcessQueue = (can: boolean) => {
      canProcessQueue = can
    }
    const updateChainInProgress = (value: boolean) => {
      chainInProgress = value
    }

    // --- PHASE 1: Start run A (setupStreamingContext) ---
    let messagesA = createBaseMessages()
    const streamRefsA = createStreamController()
    const timerControllerA = createMockTimerController()
    const abortControllerRefA = { current: null as AbortController | null }

    const { updater: updaterA, abortController: abortControllerA } =
      setupStreamingContext({
        aiMessageId: 'ai-1',
        timerController: timerControllerA,
        setMessages: (fn: any) => {
          messagesA = fn(messagesA)
        },
        streamRefs: streamRefsA,
        abortControllerRef: abortControllerRefA,
        setStreamStatus,
        setCanProcessQueue,
        isQueuePausedRef,
        isProcessingQueueRef,
        updateChainInProgress,
        setIsRetrying: () => {},
        setStreamingAgents: () => {},
      })

    // Simulate streaming has started
    streamStatus = 'streaming'

    // Verify run A is actively streaming
    expect(streamStatus).toBe('streaming')
    expect(chainInProgress).toBe(true)

    // --- PHASE 2: User aborts run A ---
    abortControllerA.abort()

    // Abort updates the UI but preserves continuation ownership.
    expect(streamRefsA.state.wasAbortedByUser).toBe(true)
    expect(streamStatus as StreamStatus).toBe('cancelling')
    expect(chainInProgress).toBe(true)
    expect(canProcessQueue).toBe(false)

    // --- PHASE 3: User types run B — verify it's UNBLOCKED ---
    const canProcessRunB = canQueueProcessNextMessage({
      isChainInProgress: chainInProgress,
      canProcessQueue,
      streamStatus,
      isProcessingQueue: isProcessingQueueRef.current,
      isQueuePaused: isQueuePausedRef.current,
    })

    expect(canProcessRunB).toBe(false)
  })

  test('handleRunCompletion releases cancellation ownership after settlement', () => {
    // After abort releases the chain lock, handleRunCompletion should be a no-op
    // to avoid interfering with any new run that may have started.

    let streamStatus: StreamStatus = 'idle'
    let canProcessQueue = true
    let chainInProgress = false // Already released by abort handler
    const isProcessingQueueRef = { current: false }
    const isQueuePausedRef = { current: false }

    const timerController = createMockTimerController()
    let messages = createBaseMessages()
    const updater = createBatchedMessageUpdater('ai-1', (fn: any) => {
      messages = fn(messages)
    })

    // Track calls
    let setStreamStatusCallCount = 0
    let updateChainInProgressCallCount = 0

    const runState: RunState = {
      sessionState: {} as any,
      output: { type: 'lastMessage' as const, value: [] },
    }

    handleRunCompletion({
      runState,
      actualCredits: undefined,
      agentMode: 'DEFAULT' as any,
      timerController,
      updater,
      aiMessageId: 'ai-1',
      wasAbortedByUser: true,
      setStreamStatus: () => {
        setStreamStatusCallCount++
      },
      setCanProcessQueue: (can: boolean) => {
        canProcessQueue = can
      },
      updateChainInProgress: () => {
        updateChainInProgressCallCount++
      },
      setHasReceivedPlanResponse: () => {},
      isProcessingQueueRef,
      isQueuePausedRef,
    })

    expect(setStreamStatusCallCount).toBe(1)
    expect(updateChainInProgressCallCount).toBe(1)
    // State should be unchanged (still in the "released" state from abort handler)
    expect(chainInProgress).toBe(false)
    expect(canProcessQueue).toBe(true)
  })

  test('aborted run A finally block must not clear isProcessingQueueRef owned by run B', () => {
    // Regression test for overlap hazard: after abort releases the chain lock,
    // run B can start from the queue and set isProcessingQueueRef = true.
    // Run A's late-executing finally block must NOT clear it.
    //
    // This tests the pattern used in use-send-message.ts where the finally block
    // guards isProcessingQueueRef cleanup with !abortController.signal.aborted.

    const isProcessingQueueRef = { current: false }
    const isQueuePausedRef = { current: false }
    let chainInProgress = true
    let canProcessQueue = false
    let streamStatus: StreamStatus = 'idle'

    // --- Run A setup and abort ---
    let messagesA = createBaseMessages()
    const sharedStreamRefs = createStreamController()
    const timerA = createMockTimerController()
    const abortRefA = { current: null as AbortController | null }

    const { abortController: abortA } = setupStreamingContext({
      aiMessageId: 'ai-run-a',
      timerController: timerA,
      setMessages: (fn: any) => {
        messagesA = fn(messagesA)
      },
      streamRefs: sharedStreamRefs,
      abortControllerRef: abortRefA,
      setStreamStatus: (status: StreamStatus) => {
        streamStatus = status
      },
      setCanProcessQueue: (can: boolean) => {
        canProcessQueue = can
      },
      isQueuePausedRef,
      isProcessingQueueRef,
      updateChainInProgress: (value: boolean) => {
        chainInProgress = value
      },
      setIsRetrying: () => {},
      setStreamingAgents: () => {},
    })

    // Abort run A
    abortA.abort()
    expect(chainInProgress).toBe(true)
    expect(isProcessingQueueRef.current).toBe(false)

    // --- Run B starts from queue, takes ownership of isProcessingQueueRef ---
    isProcessingQueueRef.current = true // Queue's processNextMessage sets this
    chainInProgress = true
    canProcessQueue = false

    // --- Simulate run A's finally block (late execution) ---
    // In use-send-message.ts, the finally block guards with !abortController.signal.aborted.
    // Verify abortA.signal.aborted is true so the guard would skip cleanup.
    expect(abortA.signal.aborted).toBe(true)

    // The finally block pattern: only clean up if NOT aborted
    if (!abortA.signal.aborted) {
      // This should NOT execute
      isProcessingQueueRef.current = false
    }

    // isProcessingQueueRef must still be true (owned by run B)
    expect(isProcessingQueueRef.current).toBe(true)
    // chainInProgress must still be true (owned by run B)
    expect(chainInProgress).toBe(true)
  })

  test('reject-after-abort must not run handleRunError cleanup that could clobber run B', () => {
    // Regression test: if client.run() rejects after abort (e.g., network teardown),
    // handleRunError should NOT run because it would reset shared queue/stream state
    // that run B may have already claimed.
    //
    // This tests the pattern used in use-send-message.ts where the catch block
    // guards handleRunError with !abortController.signal.aborted.

    let streamStatus: StreamStatus = 'idle'
    let canProcessQueue = true
    let chainInProgress = false // Released by abort handler
    const isProcessingQueueRef = { current: false }
    const isQueuePausedRef = { current: false }

    // --- Simulate run A was aborted ---
    const abortController = new AbortController()
    abortController.abort()
    expect(abortController.signal.aborted).toBe(true)

    // --- Run B has started and claimed shared state ---
    chainInProgress = true
    canProcessQueue = false
    isProcessingQueueRef.current = true
    streamStatus = 'streaming'

    // --- Simulate what happens if client.run() rejects after abort ---
    // The catch block pattern: only handle error if NOT aborted
    const error = new Error('AbortError: The operation was aborted')

    if (!abortController.signal.aborted) {
      // This should NOT execute — handleRunError would clobber run B's state
      handleRunError({
        error,
        timerController: createMockTimerController(),
        updater: createBatchedMessageUpdater('ai-1', () => {}),
        setIsRetrying: () => {},
        setStreamStatus: (status: StreamStatus) => {
          streamStatus = status
        },
        setCanProcessQueue: (can: boolean) => {
          canProcessQueue = can
        },
        updateChainInProgress: (value: boolean) => {
          chainInProgress = value
        },
        isProcessingQueueRef,
        isQueuePausedRef,
      })
    }

    // Run B's state must be untouched
    expect(chainInProgress).toBe(true) // Still owned by run B
    expect(canProcessQueue).toBe(false) // Still owned by run B
    expect(isProcessingQueueRef.current).toBe(true) // Still owned by run B
    expect(streamStatus).toBe('streaming') // Still owned by run B
  })

  test('handleRunError WOULD clobber run B state if called without abort guard (documents why guard is needed)', () => {
    // This test proves that handleRunError resets shared state, which is why
    // the catch block in use-send-message.ts MUST guard it with abort check.

    let streamStatus: StreamStatus = 'streaming'
    let canProcessQueue = false
    let chainInProgress = true
    const isProcessingQueueRef = { current: true }
    const isQueuePausedRef = { current: false }

    // Call handleRunError without guard (simulates the bug scenario)
    handleRunError({
      error: new Error('AbortError'),
      timerController: createMockTimerController(),
      updater: createBatchedMessageUpdater('ai-1', (fn: any) => {}),
      setIsRetrying: () => {},
      setStreamStatus: (status: StreamStatus) => {
        streamStatus = status
      },
      setCanProcessQueue: (can: boolean) => {
        canProcessQueue = can
      },
      updateChainInProgress: (value: boolean) => {
        chainInProgress = value
      },
      isProcessingQueueRef,
      isQueuePausedRef,
    })

    // handleRunError resets ALL shared state — this would clobber run B
    expect(chainInProgress).toBe(false) // Clobbered!
    expect(canProcessQueue).toBe(true) // Clobbered!
    expect(isProcessingQueueRef.current).toBe(false) // Clobbered!
    expect(streamStatus as StreamStatus).toBe('idle') // Clobbered!
  })

  test('full two-run lifecycle preserves run A state before run B completion', () => {
    // End-to-end test: two complete runs sharing the SAME streamRefs instance
    // (matching production behavior where streamRefs is reused across sends).
    // Verifies that run B can start immediately after abort, and that run A's
    // late-resolving handleRunCompletion does NOT interfere with run B.

    let streamStatus: StreamStatus = 'idle'
    let canProcessQueue = false
    let chainInProgress = true
    const isProcessingQueueRef = { current: false }
    const isQueuePausedRef = { current: false }
    let previousRunState: RunState | null = null

    const setStreamStatus = (status: StreamStatus) => {
      streamStatus = status
    }
    const setCanProcessQueue = (can: boolean) => {
      canProcessQueue = can
    }
    const updateChainInProgress = (value: boolean) => {
      chainInProgress = value
    }

    // CRITICAL: Use a single shared streamRefs instance, just like production.
    // In production, streamRefsRef is created once via useRef and reused.
    const sharedStreamRefs = createStreamController()

    // === RUN A ===
    let messagesA = createBaseMessages()
    const timerA = createMockTimerController()
    const abortRefA = { current: null as AbortController | null }

    const { updater: updaterA, abortController: abortA } =
      setupStreamingContext({
        aiMessageId: 'ai-run-a',
        timerController: timerA,
        setMessages: (fn: any) => {
          messagesA = fn(messagesA)
        },
        streamRefs: sharedStreamRefs,
        abortControllerRef: abortRefA,
        setStreamStatus,
        setCanProcessQueue,
        isQueuePausedRef,
        isProcessingQueueRef,
        updateChainInProgress,
        setIsRetrying: () => {},
        setStreamingAgents: () => {},
      })

    streamStatus = 'streaming'

    // Abort run A
    abortA.abort()
    expect(chainInProgress).toBe(true)
    expect(canProcessQueue).toBe(false)
    expect(sharedStreamRefs.state.wasAbortedByUser).toBe(true)

    // === RUN B starts immediately (before A's client.run() resolves) ===
    chainInProgress = true
    canProcessQueue = false

    let messagesB: ChatMessage[] = [
      {
        id: 'ai-run-b',
        variant: 'ai',
        content: '',
        blocks: [],
        timestamp: 'now',
      },
    ]
    const timerB = createMockTimerController()
    const abortRefB = { current: null as AbortController | null }

    // Run B's setupStreamingContext calls sharedStreamRefs.reset(),
    // which clears wasAbortedByUser. This is the key race condition.
    const { updater: updaterB, abortController: abortB } =
      setupStreamingContext({
        aiMessageId: 'ai-run-b',
        timerController: timerB,
        setMessages: (fn: any) => {
          messagesB = fn(messagesB)
        },
        streamRefs: sharedStreamRefs,
        abortControllerRef: abortRefB,
        setStreamStatus,
        setCanProcessQueue,
        isQueuePausedRef,
        isProcessingQueueRef,
        updateChainInProgress,
        setIsRetrying: () => {},
        setStreamingAgents: () => {},
      })

    // After B starts, shared streamRefs.wasAbortedByUser is reset to false.
    // This is why we use per-run abortController.signal.aborted instead.
    expect(sharedStreamRefs.state.wasAbortedByUser).toBe(false)

    // Now run A's client.run() resolves (after B has already started and reset shared state).
    // handleRunCompletion uses the per-run wasAbortedByUser boolean (from abortA.signal.aborted),
    // NOT the shared streamRefs, so it correctly knows A was aborted.
    const runStateA: RunState = {
      sessionState: {
        id: 'session-abc',
        messages: [
          { role: 'user', content: 'first message' },
          { role: 'assistant', content: 'partial response before cancel' },
        ],
      } as any,
      output: { type: 'lastMessage' as const, value: [] },
    }
    previousRunState = runStateA

    handleRunCompletion({
      runState: runStateA,
      actualCredits: undefined,
      agentMode: 'DEFAULT' as any,
      timerController: timerA,
      updater: updaterA,
      aiMessageId: 'ai-run-a',
      wasAbortedByUser: abortA.signal.aborted, // per-run flag, not shared state
      setStreamStatus,
      setCanProcessQueue,
      updateChainInProgress,
      setHasReceivedPlanResponse: () => {},
      isProcessingQueueRef,
      isQueuePausedRef,
    })

    expect(chainInProgress).toBe(false)

    // Simulate run B completing normally
    const runStateB: RunState = {
      sessionState: {
        id: 'session-abc',
        messages: [
          { role: 'user', content: 'first message' },
          { role: 'assistant', content: 'partial response before cancel' },
          { role: 'user', content: 'second message' },
          { role: 'assistant', content: 'full response to second message' },
        ],
      } as any,
      output: {
        type: 'lastMessage' as const,
        value: [{ type: 'text' as const, text: 'full response' }],
      },
    }
    previousRunState = runStateB

    handleRunCompletion({
      runState: runStateB,
      actualCredits: 5,
      agentMode: 'DEFAULT' as any,
      timerController: timerB,
      updater: updaterB,
      aiMessageId: 'ai-run-b',
      wasAbortedByUser: abortB.signal.aborted, // per-run flag: false (B was not aborted)
      setStreamStatus,
      setCanProcessQueue,
      updateChainInProgress,
      setHasReceivedPlanResponse: () => {},
      isProcessingQueueRef,
      isQueuePausedRef,
    })

    // Final state: run B completed normally
    expect(previousRunState!.sessionState as any).toEqual({
      id: 'session-abc',
      messages: [
        { role: 'user', content: 'first message' },
        { role: 'assistant', content: 'partial response before cancel' },
        { role: 'user', content: 'second message' },
        { role: 'assistant', content: 'full response to second message' },
      ],
    })
    expect(chainInProgress).toBe(false)
    expect(canProcessQueue).toBe(true)
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
        updateChainInProgress: (value) => {
          chainInProgress = value
        },
        setCanProcessQueue: () => {},
      })

      expect(chainInProgress).toBe(false)
    })

    test('sets canProcessQueue to true when queue is not paused', () => {
      let canProcessQueue = false
      const isQueuePausedRef = { current: false }

      resetEarlyReturnState({
        updateChainInProgress: () => {},
        setCanProcessQueue: (can) => {
          canProcessQueue = can
        },
        isQueuePausedRef,
      })

      expect(canProcessQueue).toBe(true)
    })

    test('sets canProcessQueue to false when queue is paused', () => {
      let canProcessQueue = true
      const isQueuePausedRef = { current: true }

      resetEarlyReturnState({
        updateChainInProgress: () => {},
        setCanProcessQueue: (can) => {
          canProcessQueue = can
        },
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
        setCanProcessQueue: (can) => {
          canProcessQueue = can
        },
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
        updateChainInProgress: (value) => {
          chainInProgress = value
        },
        setCanProcessQueue: (can) => {
          canProcessQueue = can
        },
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
        updateChainInProgress: (value) => {
          chainInProgress = value
        },
        setCanProcessQueue: (can) => {
          canProcessQueue = can
        },
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
        updateChainInProgress: (value) => {
          chainInProgress = value
        },
        setCanProcessQueue: (can) => {
          canProcessQueue = can
        },
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
        setCanProcessQueue: (can) => {
          canProcessQueue = can
        },
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
        updateChainInProgress: (value) => {
          chainInProgress = value
        },
        setCanProcessQueue: (can) => {
          canProcessQueue = can
        },
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
        updateChainInProgress: (value) => {
          chainInProgress = value
        },
        setCanProcessQueue: (can) => {
          canProcessQueue = can
        },
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
        updateChainInProgress: (value) => {
          chainInProgress = value
        },
        setCanProcessQueue: (can) => {
          canProcessQueue = can
        },
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
        updateChainInProgress: (value) => {
          chainInProgress = value
        },
        setCanProcessQueue: (can) => {
          canProcessQueue = can
        },
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
