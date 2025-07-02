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
import * as requestFilesPrompt from '../find-files/request-files-prompt'
import * as liveUserInputs from '../live-user-inputs'
import * as context7Api from '../llm-apis/context7-api'
import * as aisdk from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { mainPrompt } from '../main-prompt'
import * as websocketAction from '../websockets/websocket-action'

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

describe('read_docs tool', () => {
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
    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield 'Test response'
      return
    })

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

  class MockWebSocket {
    send(msg: string) {}
    close() {}
    on(event: string, listener: (...args: any[]) => void) {}
    removeListener(event: string, listener: (...args: any[]) => void) {}
  }

  const mockFileContext: ProjectFileContext = {
    projectRoot: '/test',
    cwd: '/test',
    fileTree: [],
    fileTokenScores: {},
    knowledgeFiles: {},
    gitChanges: {
      status: '',
      diff: '',
      diffCached: '',
      lastCommitMessages: '',
    },
    changesSinceLastChat: {},
    shellConfigFiles: {},
    systemInfo: {
      platform: 'test',
      shell: 'test',
      nodeVersion: 'test',
      arch: 'test',
      homedir: '/home/test',
      cpus: 1,
    },
    fileVersions: [],
  }

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
    const action = {
      type: 'prompt' as const,
      prompt: 'Get React documentation',
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [],
    }

    const { sessionState: newSessionState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      }
    )

    expect(context7Api.fetchContext7LibraryDocumentation).toHaveBeenCalledWith(
      'React',
      {}
    )

    // Check that the documentation was added to the message history
    const toolResultMessages =
      newSessionState.mainAgentState.messageHistory.filter(
        (m) =>
          m.role === 'user' &&
          typeof m.content === 'string' &&
          m.content.includes('read_docs')
      )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[0].content).toContain(mockDocumentation)
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
    const action = {
      type: 'prompt' as const,
      prompt: 'Get React hooks documentation',
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [],
    }

    await mainPrompt(new MockWebSocket() as unknown as WebSocket, action, {
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
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
    const action = {
      type: 'prompt' as const,
      prompt: 'Get documentation for NonExistentLibrary',
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [],
    }

    const { sessionState: newSessionState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      }
    )

    // Check that the "no documentation found" message was added
    const toolResultMessages =
      newSessionState.mainAgentState.messageHistory.filter(
        (m) =>
          m.role === 'user' &&
          typeof m.content === 'string' &&
          m.content.includes('read_docs')
      )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[0].content).toContain(
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
    const action = {
      type: 'prompt' as const,
      prompt: 'Get React documentation',
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [],
    }

    const { sessionState: newSessionState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      }
    )

    // Check that the error message was added
    const toolResultMessages =
      newSessionState.mainAgentState.messageHistory.filter(
        (m) =>
          m.role === 'user' &&
          typeof m.content === 'string' &&
          m.content.includes('read_docs')
      )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[0].content).toContain(
      'Error fetching documentation for "React"'
    )
    expect(toolResultMessages[0].content).toContain('Network timeout')
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
    const action = {
      type: 'prompt' as const,
      prompt: 'Get React server components documentation',
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [],
    }

    const { sessionState: newSessionState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      }
    )

    // Check that the topic is included in the error message
    const toolResultMessages =
      newSessionState.mainAgentState.messageHistory.filter(
        (m) =>
          m.role === 'user' &&
          typeof m.content === 'string' &&
          m.content.includes('read_docs')
      )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[0].content).toContain(
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
    const action = {
      type: 'prompt' as const,
      prompt: 'Get React documentation',
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [],
    }

    const { sessionState: newSessionState } = await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      }
    )

    // Check that the generic error message was added
    const toolResultMessages =
      newSessionState.mainAgentState.messageHistory.filter(
        (m) =>
          m.role === 'user' &&
          typeof m.content === 'string' &&
          m.content.includes('read_docs')
      )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[0].content).toContain(
      'Error fetching documentation for "React"'
    )
    expect(toolResultMessages[0].content).toContain('Unknown error')
  })
})
