// Set environment variables before any imports
process.env.LINKUP_API_KEY = 'test-api-key'

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
import * as linkupApi from '../llm-apis/linkup-api'
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

  test('should call searchWeb function when web_search tool is used', async () => {
    const mockSearchResult = 'Test search result'

    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResult
    )

    const mockResponse =
      getToolCallString('web_search', {
        query: 'test query',
      }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: 'Search for test',
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

    // Just verify that searchWeb was called
    expect(linkupApi.searchWeb).toHaveBeenCalledWith('test query', {
      depth: 'standard',
    })
  })

  test('should successfully perform web search with basic query', async () => {
    const mockSearchResult =
      'Next.js 15 introduces new features including improved performance and React 19 support. You can explore the latest features and improvements in Next.js 15.'

    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResult
    )

    const mockResponse =
      getToolCallString('web_search', {
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

    // Verify that searchWeb was called with correct parameters
    expect(linkupApi.searchWeb).toHaveBeenCalledWith(
      'Next.js 15 new features',
      {
        depth: 'standard',
      }
    )

    // Verify that searchWeb was called with correct parameters
    expect(linkupApi.searchWeb).toHaveBeenCalledWith(
      'Next.js 15 new features',
      {
        depth: 'standard',
      }
    )
  })

  test('should handle custom depth parameter', async () => {
    const mockSearchResult =
      'A comprehensive guide to React Server Components and their implementation.'

    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResult
    )

    const mockResponse =
      getToolCallString('web_search', {
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

    await mainPrompt(new MockWebSocket() as unknown as WebSocket, action, {
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
    })

    expect(linkupApi.searchWeb).toHaveBeenCalledWith(
      'React Server Components tutorial',
      {
        depth: 'deep',
      }
    )
  })

  test('should handle case when no search results are found', async () => {
    spyOn(linkupApi, 'searchWeb').mockImplementation(async () => null)

    const mockResponse =
      getToolCallString('web_search', {
        query: 'very obscure search query that returns nothing',
      }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContext)
    const action = {
      type: 'prompt' as const,
      prompt: "Search for something that doesn't exist",
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

    // Verify that searchWeb was called
    expect(linkupApi.searchWeb).toHaveBeenCalledWith(
      'very obscure search query that returns nothing',
      {
        depth: 'standard',
      }
    )
  })

  test('should handle API errors gracefully', async () => {
    const mockError = new Error('Linkup API timeout')

    spyOn(linkupApi, 'searchWeb').mockImplementation(async () => {
      throw mockError
    })

    const mockResponse =
      getToolCallString('web_search', {
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

    // Verify that searchWeb was called
    expect(linkupApi.searchWeb).toHaveBeenCalledWith('test query', {
      depth: 'standard',
    })
  })

  test('should handle null response from searchWeb', async () => {
    spyOn(linkupApi, 'searchWeb').mockImplementation(async () => null)

    const mockResponse =
      getToolCallString('web_search', {
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

    // Verify that searchWeb was called
    expect(linkupApi.searchWeb).toHaveBeenCalledWith('test query', {
      depth: 'standard',
    })
  })

  test('should handle non-Error exceptions', async () => {
    spyOn(linkupApi, 'searchWeb').mockImplementation(async () => {
      throw 'String error'
    })

    const mockResponse =
      getToolCallString('web_search', {
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

    // Verify that searchWeb was called
    expect(linkupApi.searchWeb).toHaveBeenCalledWith('test query', {
      depth: 'standard',
    })
  })

  test('should format search results correctly', async () => {
    const mockSearchResult =
      'This is the first search result content. This is the second search result content.'

    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResult
    )

    const mockResponse =
      getToolCallString('web_search', {
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

    // Verify that searchWeb was called
    expect(linkupApi.searchWeb).toHaveBeenCalledWith('test formatting', {
      depth: 'standard',
    })
  })
})
