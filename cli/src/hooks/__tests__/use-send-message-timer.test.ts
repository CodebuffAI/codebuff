import { renderHook, waitFor, act } from '@testing-library/react'
import { JSDOM } from 'jsdom'
import { mock, spyOn } from 'bun:test'
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import { useSendMessage } from '../use-send-message'
import type { ElapsedTimeTracker } from '../use-elapsed-time'
import * as codebuffClient from '../../utils/codebuff-client'
import * as loadAgentDefs from '../../utils/load-agent-definitions'
import * as localAgentRegistry from '../../utils/local-agent-registry'
import { logger } from '../../utils/logger'

// Type for logger call arguments
type LoggerInfoCall = [data: Record<string, any>, message: string]

// TODO(2024-11-19, #cli-timer-tests): the timer-related tests exercise a large
// portion of the streaming pipeline and currently require the full TUI runtime.
// Until we have a lightweight harness to simulate those events, skip the suite
// to avoid spurious failures in standard CI runs.
const timerDescribe = describe.skip

if (typeof document === 'undefined') {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const { window } = dom

  const globalWindow = window as unknown as Window & typeof globalThis

  ;(globalThis as any).window = globalWindow
  ;(globalThis as any).document = globalWindow.document

  if (typeof (globalThis as any).navigator === 'undefined') {
    Object.defineProperty(globalThis, 'navigator', {
      value: globalWindow.navigator,
      configurable: true,
    })
  }

  const descriptors = Object.getOwnPropertyDescriptors(globalWindow)
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (typeof (globalThis as any)[key] === 'undefined') {
      Object.defineProperty(globalThis, key, descriptor)
    }
  }

  if (typeof globalThis.requestAnimationFrame === 'undefined') {
    ;(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
      setTimeout(cb, 0)
  }
  if (typeof globalThis.cancelAnimationFrame === 'undefined') {
    ;(globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id)
  }
}

timerDescribe('useSendMessage timer', () => {
  let mockSetMessages: ReturnType<typeof mock>
  let mockSetFocusedAgentId: ReturnType<typeof mock>
  let mockSetInputFocused: ReturnType<typeof mock>
  let mockSetStreamingAgents: ReturnType<typeof mock>
  let mockSetCollapsedAgents: ReturnType<typeof mock>
  let mockSetActiveSubagents: ReturnType<typeof mock>
  let mockSetIsChainInProgress: ReturnType<typeof mock>
  let mockSetIsWaitingForResponse: ReturnType<typeof mock>
  let mockStartStreaming: ReturnType<typeof mock>
  let mockStopStreaming: ReturnType<typeof mock>
  let mockSetIsStreaming: ReturnType<typeof mock>
  let mockSetCanProcessQueue: ReturnType<typeof mock>
  let mockSetMainAgentStreamStartTime: ReturnType<typeof mock>
  let mockScrollToLatest: ReturnType<typeof mock>
  let inputRef: React.MutableRefObject<any>
  let activeSubagentsRef: React.MutableRefObject<Set<string>>
  let isChainInProgressRef: React.MutableRefObject<boolean>
  let abortControllerRef: React.MutableRefObject<AbortController | null>
  let onBeforeMessageSend: ReturnType<typeof mock>
  let mainAgentTimer: ElapsedTimeTracker

  beforeEach(() => {
    // Setup state setter mocks
    mockSetMessages = mock((fn: any) => {
      if (typeof fn === 'function') {
        fn([])
      }
    })
    mockSetFocusedAgentId = mock(() => {})
    mockSetInputFocused = mock(() => {})
    mockSetStreamingAgents = mock((fn: any) => {
      if (typeof fn === 'function') {
        return fn(new Set())
      }
    })
    mockSetCollapsedAgents = mock((fn: any) => {
      if (typeof fn === 'function') {
        return fn(new Set())
      }
    })
    mockSetActiveSubagents = mock((fn: any) => {
      if (typeof fn === 'function') {
        return fn(new Set())
      }
    })
    mockSetIsChainInProgress = mock(() => {})
    mockSetIsWaitingForResponse = mock(() => {})
    mockStartStreaming = mock(() => {})
    mockStopStreaming = mock(() => {})
    mockSetIsStreaming = mock(() => {})
    mockSetCanProcessQueue = mock(() => {})
    mockSetMainAgentStreamStartTime = mock(() => {})
    mockScrollToLatest = mock(() => {})
    inputRef = { current: { focus: mock(() => {}) } }
    activeSubagentsRef = { current: new Set() }
    isChainInProgressRef = { current: false }
    abortControllerRef = { current: null }
    onBeforeMessageSend = mock(async () => ({ success: true, errors: [] }))
    mainAgentTimer = {
      start: () => {},
      stop: () => {},
      elapsedSeconds: 0,
      startTime: null,
    }

    // Spy on external module functions
    spyOn(codebuffClient, 'getCodebuffClient').mockReturnValue({
      run: mock(async () => ({ credits: 100 })),
    } as any)
    spyOn(codebuffClient, 'formatToolOutput').mockReturnValue('formatted output')
    spyOn(loadAgentDefs, 'loadAgentDefinitions').mockReturnValue([])
    spyOn(localAgentRegistry, 'getLoadedAgentsData').mockReturnValue({
      agents: [],
      agentsDir: '',
    })
    spyOn(logger, 'info').mockImplementation(() => {})
    spyOn(logger, 'error').mockImplementation(() => {})
    spyOn(logger, 'warn').mockImplementation(() => {})
    spyOn(logger, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    mock.restore()
  })

  test('logs timer start and end when sending a message', async () => {
    const { result } = renderHook(() =>
      useSendMessage({
        setMessages: mockSetMessages,
        setFocusedAgentId: mockSetFocusedAgentId,
        setInputFocused: mockSetInputFocused,
        inputRef,
        setStreamingAgents: mockSetStreamingAgents,
        setCollapsedAgents: mockSetCollapsedAgents,
        activeSubagentsRef,
        isChainInProgressRef,
        setActiveSubagents: mockSetActiveSubagents,
        setIsChainInProgress: mockSetIsChainInProgress,
        setIsWaitingForResponse: mockSetIsWaitingForResponse,
        startStreaming: mockStartStreaming,
        stopStreaming: mockStopStreaming,
        setIsStreaming: mockSetIsStreaming,
        setCanProcessQueue: mockSetCanProcessQueue,
        abortControllerRef,
        onBeforeMessageSend,
        mainAgentTimer,
        scrollToLatest: mockScrollToLatest,
        availableWidth: 80,
      }),
    )

    await waitFor(() => expect(result.current).toBeTruthy())

    await act(async () => {
      await result.current!.sendMessage('test message', { agentMode: 'FAST' })
    })

    await waitFor(() => {
      const loggerInfoSpy = logger.info as ReturnType<typeof spyOn>
      // Find timer start log
      const timerStartLog = (loggerInfoSpy.mock.calls as LoggerInfoCall[]).find(
        (call) =>
          call &&
          call[1] &&
          typeof call[1] === 'string' &&
          call[1].includes('[TIMER] Timer START'),
      )
      expect(timerStartLog).toBeDefined()
      expect(timerStartLog?.[0]).toHaveProperty('startTime')

      // Find timer end log
      const timerEndLog = (loggerInfoSpy.mock.calls as LoggerInfoCall[]).find(
        (call) =>
          call &&
          call[1] &&
          typeof call[1] === 'string' &&
          call[1].includes('[TIMER] Timer END'),
      )
      expect(timerEndLog).toBeDefined()
      expect(timerEndLog?.[0]).toHaveProperty('startTime')
      expect(timerEndLog?.[0]).toHaveProperty('endTime')
      expect(timerEndLog?.[0]).toHaveProperty('elapsedMs')
      expect(timerEndLog?.[0]).toHaveProperty('elapsedTime')
    })
  })

  test('calculates elapsed time correctly', async () => {
    const startTime = Date.now()

    const { result } = renderHook(() =>
      useSendMessage({
        setMessages: mockSetMessages,
        setFocusedAgentId: mockSetFocusedAgentId,
        setInputFocused: mockSetInputFocused,
        inputRef,
        setStreamingAgents: mockSetStreamingAgents,
        setCollapsedAgents: mockSetCollapsedAgents,
        activeSubagentsRef,
        isChainInProgressRef,
        setActiveSubagents: mockSetActiveSubagents,
        setIsChainInProgress: mockSetIsChainInProgress,
        setIsWaitingForResponse: mockSetIsWaitingForResponse,
        startStreaming: mockStartStreaming,
        stopStreaming: mockStopStreaming,
        setIsStreaming: mockSetIsStreaming,
        setCanProcessQueue: mockSetCanProcessQueue,
        abortControllerRef,
        onBeforeMessageSend,
        mainAgentTimer,
        scrollToLatest: mockScrollToLatest,
        availableWidth: 80,
      }),
    )

    await waitFor(() => expect(result.current).toBeTruthy())

    await act(async () => {
      await result.current!.sendMessage('test message', { agentMode: 'FAST' })
    })

    await waitFor(() => {
      const loggerInfoSpy = logger.info as ReturnType<typeof spyOn>
      const timerEndLog = (loggerInfoSpy.mock.calls as LoggerInfoCall[]).find(
        (call) =>
          call &&
          call[1] &&
          typeof call[1] === 'string' &&
          call[1].includes('[TIMER] Timer END'),
      )

      expect(timerEndLog).toBeDefined()
      const logData = timerEndLog?.[0]
      expect(logData?.elapsedMs).toBeGreaterThanOrEqual(0)
      expect(logData?.endTime).toBeGreaterThanOrEqual(logData?.startTime)
      expect(logData?.elapsedMs).toBe(logData?.endTime - logData?.startTime)

      // Verify elapsed time string format
      const elapsedTimeStr = logData?.elapsedTime
      expect(typeof elapsedTimeStr).toBe('string')
      expect(parseFloat(elapsedTimeStr)).toBeGreaterThanOrEqual(0)
    })
  })

  test('includes completion time in message metadata', async () => {
    const { result } = renderHook(() =>
      useSendMessage({
        setMessages: mockSetMessages,
        setFocusedAgentId: mockSetFocusedAgentId,
        setInputFocused: mockSetInputFocused,
        inputRef,
        setStreamingAgents: mockSetStreamingAgents,
        setCollapsedAgents: mockSetCollapsedAgents,
        activeSubagentsRef,
        isChainInProgressRef,
        setActiveSubagents: mockSetActiveSubagents,
        setIsChainInProgress: mockSetIsChainInProgress,
        setIsWaitingForResponse: mockSetIsWaitingForResponse,
        startStreaming: mockStartStreaming,
        stopStreaming: mockStopStreaming,
        setIsStreaming: mockSetIsStreaming,
        setCanProcessQueue: mockSetCanProcessQueue,
        abortControllerRef,
        onBeforeMessageSend,
        mainAgentTimer,
        scrollToLatest: mockScrollToLatest,
        availableWidth: 80,
      }),
    )

    await waitFor(() => expect(result.current).toBeTruthy())

    await act(async () => {
      await result.current!.sendMessage('test message', { agentMode: 'FAST' })
    })

    await waitFor(() => {
      // Find the setMessages call that marks completion
      const completionCall = mockSetMessages.mock.calls.find((call) => {
        const fn = call[0]
        if (typeof fn !== 'function') return false

        const testMessages = [
          {
            id: 'ai-123',
            variant: 'ai' as const,
            content: '',
            blocks: [],
            timestamp: '0',
            metadata: { completionTimeSeconds: 12.34 } as Record<
              string,
              unknown
            >,
          },
        ]

        fn(testMessages as any)
        const metadata = (testMessages[0] as any).metadata
        return Boolean(metadata && 'completionTimeSeconds' in metadata)
      })

      expect(completionCall).toBeDefined()

      if (completionCall) {
        const fn = completionCall[0] as (messages: any[]) => any[]
        const testMessages = [
          {
            id: 'ai-456',
            variant: 'ai' as const,
            content: '',
            blocks: [],
            timestamp: '0',
            metadata: {} as Record<string, unknown>,
          },
        ]

        fn(testMessages as any)

        const metadata = (testMessages[0] as any).metadata
        expect(metadata).toBeDefined()
        expect(typeof metadata?.completionTimeSeconds).toBe('number')
        expect((metadata?.completionTimeSeconds ?? 0)).toBeGreaterThanOrEqual(0)
      }
    })
  })

  test('scrolls to latest when validation errors occur', async () => {
    const validationErrors = [
      { id: 'agent-1', message: 'Field is required' },
    ]
    onBeforeMessageSend.mockResolvedValue({ success: false, errors: validationErrors })

    const { result } = renderHook(() =>
      useSendMessage({
        setMessages: mockSetMessages,
        setFocusedAgentId: mockSetFocusedAgentId,
        setInputFocused: mockSetInputFocused,
        inputRef,
        setStreamingAgents: mockSetStreamingAgents,
        setCollapsedAgents: mockSetCollapsedAgents,
        activeSubagentsRef,
        isChainInProgressRef,
        setActiveSubagents: mockSetActiveSubagents,
        setIsChainInProgress: mockSetIsChainInProgress,
        setIsWaitingForResponse: mockSetIsWaitingForResponse,
        startStreaming: mockStartStreaming,
        stopStreaming: mockStopStreaming,
        setIsStreaming: mockSetIsStreaming,
        setCanProcessQueue: mockSetCanProcessQueue,
        abortControllerRef,
        onBeforeMessageSend,
        mainAgentTimer: {
          start: mockSetMainAgentStreamStartTime.bind(null, Date.now()),
          stop: mockSetMainAgentStreamStartTime.bind(null, null),
          elapsedSeconds: 0,
          startTime: null,
        },
        scrollToLatest: mockScrollToLatest,
        availableWidth: 80,
      }),
    )

    await waitFor(() => expect(result.current).toBeTruthy())

    await act(async () => {
      await result.current!.sendMessage('test message', { agentMode: 'FAST' })
    })

    await waitFor(() => {
      expect(mockScrollToLatest.mock.calls.length).toBeGreaterThanOrEqual(1)
    })
    await waitFor(() => {
      expect(mockScrollToLatest.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })
})
