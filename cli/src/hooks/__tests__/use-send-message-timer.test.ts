import { renderHook, waitFor } from '@testing-library/react'
import { mock } from 'bun:test'
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import { useSendMessage } from '../use-send-message'
import * as codebuffClient from '../../utils/codebuff-client'
import { logger } from '../../utils/logger'

// Mock the codebuff client
const mockRun = mock(async () => ({ credits: 100 }))
const mockGetCodebuffClient = mock(() => ({
  run: mockRun,
}))

mock.module('../../utils/codebuff-client', () => ({
  getCodebuffClient: mockGetCodebuffClient,
  formatToolOutput: mock(() => 'formatted output'),
}))

mock.module('../../utils/load-agent-definitions', () => ({
  loadAgentDefinitions: mock(() => []),
}))

const mockLoggerInfo = mock(() => {})
mock.module('../../utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    error: mock(() => {}),
    warn: mock(() => {}),
    debug: mock(() => {}),
  },
}))

describe('useSendMessage timer', () => {
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
  let inputRef: React.MutableRefObject<any>
  let activeSubagentsRef: React.MutableRefObject<Set<string>>
  let isChainInProgressRef: React.MutableRefObject<boolean>
  let abortControllerRef: React.MutableRefObject<AbortController | null>

  beforeEach(() => {
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
    inputRef = { current: { focus: mock(() => {}) } }
    activeSubagentsRef = { current: new Set() }
    isChainInProgressRef = { current: false }
    abortControllerRef = { current: null }

    mockLoggerInfo.mockClear()
    mockRun.mockClear()
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
      }),
    )

    await result.current.sendMessage('test message', { agentMode: 'FAST' })

    await waitFor(() => {
      // Find timer start log
      const timerStartLog = mockLoggerInfo.mock.calls.find(
        (call) =>
          call[1] && typeof call[1] === 'string' && call[1].includes('[TIMER] Timer START'),
      )
      expect(timerStartLog).toBeDefined()
      expect(timerStartLog?.[0]).toHaveProperty('startTime')

      // Find timer end log
      const timerEndLog = mockLoggerInfo.mock.calls.find(
        (call) =>
          call[1] && typeof call[1] === 'string' && call[1].includes('[TIMER] Timer END'),
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
      }),
    )

    await result.current.sendMessage('test message', { agentMode: 'FAST' })

    await waitFor(() => {
      const timerEndLog = mockLoggerInfo.mock.calls.find(
        (call) =>
          call[1] && typeof call[1] === 'string' && call[1].includes('[TIMER] Timer END'),
      )

      expect(timerEndLog).toBeDefined()
      const logData = timerEndLog?.[0]
      expect(logData.elapsedMs).toBeGreaterThanOrEqual(0)
      expect(logData.endTime).toBeGreaterThanOrEqual(logData.startTime)
      expect(logData.elapsedMs).toBe(logData.endTime - logData.startTime)

      // Verify elapsed time string format
      const elapsedTimeStr = logData.elapsedTime
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
      }),
    )

    await result.current.sendMessage('test message', { agentMode: 'FAST' })

    await waitFor(() => {
      // Find the setMessages call that marks completion
      const completionCall = mockSetMessages.mock.calls.find((call) => {
        const fn = call[0]
        if (typeof fn !== 'function') return false

        const testMessages = [
          {
            id: 'ai-123',
            variant: 'ai',
            content: '',
            blocks: [],
          },
        ]
        const result = fn(testMessages)
        return result.some((msg: any) => msg.isComplete && msg.completionTime)
      })

      expect(completionCall).toBeDefined()
    })
  })
})
