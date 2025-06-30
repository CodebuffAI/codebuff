// Set environment variables before any imports
process.env.LINKUP_API_KEY = 'test-api-key'

import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from 'bun:test'
import { WebSocket } from 'ws'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { TEST_USER_ID } from '@codebuff/common/constants'
import * as bigquery from '@codebuff/bigquery'
import * as analytics from '@codebuff/common/analytics'
import * as linkupApi from '../llm-apis/linkup-api'
import * as aisdk from '../llm-apis/vercel-ai-sdk/ai-sdk'
import * as websocketAction from '../websockets/websocket-action'
import * as checkTerminalCommandModule from '../check-terminal-command'
import * as requestFilesPrompt from '../find-files/request-files-prompt'
import * as liveUserInputs from '../live-user-inputs'
import { mainPrompt } from '../main-prompt'

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

describe('web_search tool', () => {
  const mockAgentStream = (streamOutput: string) => {
    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield streamOutput
    })
  }

  beforeEach(() => {
    // Mock analytics and tracing
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics()
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})
    spyOn(bigquery, 'insertTrace').mockImplementation(() => Promise.resolve(true))

    // Mock websocket actions
    spyOn(websocketAction, 'requestFiles').mockImplementation(async () => ({}))
    spyOn(websocketAction, 'requestFile').mockImplementation(async () => null)
    spyOn(websocketAction, 'requestToolCall').mockImplementation(async () => ({
      success: true,
      result: 'Tool call success',
    }))

    // Mock LLM APIs
    spyOn(aisdk, 'promptAiSdk').mockImplementation(() => Promise.resolve('Test response'))
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

  test('should successfully perform web search with basic query', async () => {
    const mockSearchResult = 'Next.js 15 introduces new features including improved performance and React 19 support. You can explore the latest features and improvements in Next.js 15.'
    
    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResult
    )

    const mockResponse = getToolCallString('web_search', {
      query: 'Next.js 15 new features',
    }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'Search for Next.js 15 new features',
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

    expect(linkupApi.searchWeb).toHaveBeenCalledWith(
      'Next.js 15 new features',
      {
        depth: 'standard',
      }
    )

    // Check that the search result was added to the message history
    const toolResultMessages = newSessionState.mainAgentState.messageHistory.filter(
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('web_search')
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[0].content).toContain('Next.js 15 introduces new features')
    expect(toolResultMessages[0].content).toContain('improved performance')
  })

  test('should handle custom depth parameter', async () => {
    const mockSearchResult = 'A comprehensive guide to React Server Components and their implementation.'
    
    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResult
    )

    const mockResponse = getToolCallString('web_search', {
      query: 'React Server Components tutorial',
      depth: 'deep',

    }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'Search for React Server Components tutorial with deep search',
      sessionState,
      fingerprintId: 'test',
      costMode: 'max' as const,
      promptId: 'test',
      toolResults: [],
    }

    await mainPrompt(
      new MockWebSocket() as unknown as WebSocket,
      action,
      {
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      }
    )

    expect(linkupApi.searchWeb).toHaveBeenCalledWith(
      'React Server Components tutorial',
      {
        depth: 'deep',
      }
    )
  })

  test('should handle case when no search results are found', async () => {
    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => null
    )

    const mockResponse = getToolCallString('web_search', {
      query: 'very obscure search query that returns nothing',
    }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'Search for something that doesn\'t exist',
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

    // Check that the "no results found" message was added
    const toolResultMessages = newSessionState.mainAgentState.messageHistory.filter(
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('No search results found')
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[0].content).toContain('No search results found for "very obscure search query that returns nothing"')
    expect(toolResultMessages[0].content).toContain('Try refining your search query')
  })

  test('should handle API errors gracefully', async () => {
    const mockError = new Error('Linkup API timeout')
    
    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => {
        throw mockError
      }
    )

    const mockResponse = getToolCallString('web_search', {
      query: 'test query',
    }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'Search for something',
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
    const toolResultMessages = newSessionState.mainAgentState.messageHistory.filter(
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('Error performing web search')
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[0].content).toContain('Error performing web search for "test query"')
    expect(toolResultMessages[0].content).toContain('Linkup API timeout')
  })

  test('should handle null response from searchWeb', async () => {
    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => null
    )

    const mockResponse = getToolCallString('web_search', {
      query: 'test query',
    }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'Search for something',
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

    // Check that the "no results found" message was added
    const toolResultMessages = newSessionState.mainAgentState.messageHistory.filter(
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('No search results found')
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[0].content).toContain('No search results found for "test query"')
  })

  test('should handle non-Error exceptions', async () => {
    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => {
        throw 'String error'
      }
    )

    const mockResponse = getToolCallString('web_search', {
      query: 'test query',
    }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'Search for something',
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
    const toolResultMessages = newSessionState.mainAgentState.messageHistory.filter(
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('Error performing web search')
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[0].content).toContain('Error performing web search for "test query"')
    expect(toolResultMessages[0].content).toContain('Unknown error')
  })

  test('should format search results correctly', async () => {
    const mockSearchResult = 'This is the first search result content. This is the second search result content.'
    
    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResult
    )

    const mockResponse = getToolCallString('web_search', {
      query: 'test formatting',
    }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'Test search result formatting',
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

    const toolResultMessages = newSessionState.mainAgentState.messageHistory.filter(
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('web_search')
    )
    
    expect(toolResultMessages.length).toBeGreaterThan(0)
    const resultContent = toolResultMessages[0].content
    
    // Check formatting
    expect(resultContent).toContain('This is the first search result content')
    expect(resultContent).toContain('This is the second search result content')
  })
})
