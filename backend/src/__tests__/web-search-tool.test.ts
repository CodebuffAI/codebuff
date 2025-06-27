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
    const mockSearchResults = [
      {
        title: 'Next.js 15 Release Notes',
        url: 'https://nextjs.org/blog/next-15',
        content: 'Next.js 15 introduces new features including improved performance and React 19 support.',
      },
      {
        title: 'What\'s New in Next.js 15',
        url: 'https://vercel.com/blog/next-15',
        content: 'Explore the latest features and improvements in Next.js 15.',
      },
    ]
    
    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResults
    )

    const mockResponse = getToolCallString('web_search', {
      query: 'Next.js 15 new features',
    }) + getToolCallString('end_turn', {})

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

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
        maxResults: 5,
      }
    )

    // Check that the search results were added to the message history
    const toolResultMessages = newSessionState.mainAgentState.messageHistory.filter(
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('web_search')
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[0].content).toContain('Found 2 search results')
    expect(toolResultMessages[0].content).toContain('Next.js 15 Release Notes')
    expect(toolResultMessages[0].content).toContain('https://nextjs.org/blog/next-15')
  })

  test('should handle custom depth and max_results parameters', async () => {
    const mockSearchResults = [
      {
        title: 'React Server Components Deep Dive',
        url: 'https://react.dev/blog/2023/03/22/react-labs-what-we-have-been-working-on-march-2023',
        content: 'A comprehensive guide to React Server Components and their implementation.',
      },
    ]
    
    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResults
    )

    const mockResponse = getToolCallString('web_search', {
      query: 'React Server Components tutorial',
      depth: 'deep',
      max_results: 3,
    }) + getToolCallString('end_turn', {})

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

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
        maxResults: 3,
      }
    )
  })

  test('should handle case when no search results are found', async () => {
    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => []
    )

    const mockResponse = getToolCallString('web_search', {
      query: 'very obscure search query that returns nothing',
    }) + getToolCallString('end_turn', {})

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

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
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('web_search')
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

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

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
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('web_search')
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

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

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
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('web_search')
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

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

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
      (m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('web_search')
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[0].content).toContain('Error performing web search for "test query"')
    expect(toolResultMessages[0].content).toContain('Unknown error')
  })

  test('should format search results correctly', async () => {
    const mockSearchResults = [
      {
        title: 'First Result',
        url: 'https://example.com/1',
        content: 'This is the first search result content.',
      },
      {
        title: 'Second Result',
        url: 'https://example.com/2',
        content: 'This is the second search result content.',
      },
    ]
    
    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResults
    )

    const mockResponse = getToolCallString('web_search', {
      query: 'test formatting',
    }) + getToolCallString('end_turn', {})

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

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
    
    const resultContent = toolResultMessages[0].content
    
    // Check formatting
    expect(resultContent).toContain('Found 2 search results for "test formatting"')
    expect(resultContent).toContain('1. **First Result**')
    expect(resultContent).toContain('   URL: https://example.com/1')
    expect(resultContent).toContain('   This is the first search result content.')
    expect(resultContent).toContain('2. **Second Result**')
    expect(resultContent).toContain('   URL: https://example.com/2')
    expect(resultContent).toContain('   This is the second search result content.')
  })
})
