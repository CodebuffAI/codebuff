import * as bigquery from '@codebuff/bigquery'
import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/constants'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import { WebSocket } from 'ws'
import * as checkTerminalCommandModule from '../check-terminal-command'
import * as requestFilesPrompt from '../features/files/processing/request-files-prompt'
import * as liveUserInputs from '../live-user-inputs'
import * as context7Api from '../llm-apis/context7-api'
import * as aisdk from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { runAgentStep } from '../run-agent-step'
import * as websocketAction from '../features/websockets/websocket-action'
import { MockWebSocket, mockFileContext } from './test-utils'

// Mock logger
mock.module('../util/logger', () => ({
  logger: {
    debug: () => {},
    error: () => {},
    info: () => {},
    warn: () => {},
  },
  withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
}))

describe('read_docs tool with researcher agent', () => {
  beforeEach(() => {
    // Mock analytics and tracing
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics()
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})
    spyOn(bigquery, 'insertTrace').mockImplementation(() =>
      Promise.resolve(true)
    )

    // Mock websocket actions
    spyOn(websocketAction, 'requestFiles').mockImplementation(async () => ({}))
    spyOn(websocketAction, 'requestFile').mockImplementation(async () => null)
    spyOn(websocketAction, 'requestToolCall').mockImplementation(async () => ({
      success: true,
      result: 'Tool call success' as any,
    }))

    // Mock LLM APIs
    spyOn(aisdk, 'promptAiSdk').mockImplementation(() =>
      Promise.resolve('Test response')
    )

    // Mock other required modules
    spyOn(requestFilesPrompt, 'requestRelevantFiles').mockImplementation(
      async () => []
    )
    spyOn(
      checkTerminalCommandModule,
      'checkTerminalCommand'
    ).mockImplementation(async () => null)

    // Mock live user inputs
    spyOn(liveUserInputs, 'checkLiveUserInput').mockImplementation(() => true)
  })

  afterEach(() => {
    mock.restore()
  })

  // MockWebSocket and mockFileContext imported from test-utils

  test('should successfully fetch documentation with basic query', async () => {
    const mockDocumentation =
      'React is a JavaScript library for building user interfaces...'

    spyOn(context7Api, 'fetchContext7LibraryDocumentation').mockImplementation(
      async () => mockDocumentation
    )

    const mockResponse =
      getToolCallString('read_docs', {
        libraryTitle: 'React',
      }) + getToolCallString('end_turn', {})

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }

    const { agentState: newAgentState } = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'researcher',
        fileContext: mockFileContext,
        agentState,
        prompt: 'Get React documentation',
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined,
      }
    )

    expect(context7Api.fetchContext7LibraryDocumentation).toHaveBeenCalledWith(
      'React',
      {}
    )

    // Check that the documentation was added to the message history
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('read_docs')
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      mockDocumentation
    )
  })

  test('should fetch documentation with topic and max_tokens', async () => {
    const mockDocumentation =
      'React hooks allow you to use state and other React features...'

    spyOn(context7Api, 'fetchContext7LibraryDocumentation').mockImplementation(
      async () => mockDocumentation
    )

    const mockResponse =
      getToolCallString('read_docs', {
        libraryTitle: 'React',
        topic: 'hooks',
        max_tokens: 5000,
      }) + getToolCallString('end_turn', {})

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }

    await runAgentStep(new MockWebSocket() as unknown as WebSocket, {
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      agentType: 'researcher',
      fileContext: mockFileContext,
      agentState,
      prompt: 'Get React hooks documentation',
      params: undefined,
      assistantMessage: undefined,
      assistantPrefix: undefined,
    })

    expect(context7Api.fetchContext7LibraryDocumentation).toHaveBeenCalledWith(
      'React',
      {
        topic: 'hooks',
        tokens: 5000,
      }
    )
  })

  test('should handle case when no documentation is found', async () => {
    spyOn(context7Api, 'fetchContext7LibraryDocumentation').mockImplementation(
      async () => null
    )

    const mockResponse =
      getToolCallString('read_docs', {
        libraryTitle: 'NonExistentLibrary',
      }) + getToolCallString('end_turn', {})

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }

    const { agentState: newAgentState } = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'researcher',
        fileContext: mockFileContext,
        agentState,
        prompt: 'Get documentation for NonExistentLibrary',
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined,
      }
    )

    // Check that the "no documentation found" message was added
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('read_docs')
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      'No documentation found for "NonExistentLibrary"'
    )
  })

  test('should handle API errors gracefully', async () => {
    const mockError = new Error('Network timeout')

    spyOn(context7Api, 'fetchContext7LibraryDocumentation').mockImplementation(
      async () => {
        throw mockError
      }
    )

    const mockResponse =
      getToolCallString('read_docs', {
        libraryTitle: 'React',
      }) + getToolCallString('end_turn', {})

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }

    const { agentState: newAgentState } = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'researcher',
        fileContext: mockFileContext,
        agentState,
        prompt: 'Get React documentation',
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined,
      }
    )

    // Check that the error message was added
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('read_docs')
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      'Error fetching documentation for "React"'
    )
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      'Network timeout'
    )
  })

  test('should include topic in error message when specified', async () => {
    spyOn(context7Api, 'fetchContext7LibraryDocumentation').mockImplementation(
      async () => null
    )

    const mockResponse =
      getToolCallString('read_docs', {
        libraryTitle: 'React',
        topic: 'server-components',
      }) + getToolCallString('end_turn', {})

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }

    const { agentState: newAgentState } = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'researcher',
        fileContext: mockFileContext,
        agentState,
        prompt: 'Get React server components documentation',
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined,
      }
    )

    // Check that the topic is included in the error message
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('read_docs')
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      'No documentation found for "React" with topic "server-components"'
    )
  })

  test('should handle non-Error exceptions', async () => {
    spyOn(context7Api, 'fetchContext7LibraryDocumentation').mockImplementation(
      async () => {
        throw 'String error'
      }
    )

    const mockResponse =
      getToolCallString('read_docs', {
        libraryTitle: 'React',
      }) + getToolCallString('end_turn', {})

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }

    const { agentState: newAgentState } = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'researcher',
        fileContext: mockFileContext,
        agentState,
        prompt: 'Get React documentation',
        params: undefined,
        assistantMessage: undefined,
        assistantPrefix: undefined,
      }
    )

    // Check that the generic error message was added
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('read_docs')
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      'Error fetching documentation for "React"'
    )
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      'Unknown error'
    )
  })
})
