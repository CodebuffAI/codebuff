import * as bigquery from '@codebuff/bigquery'
import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/constants'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { getToolCallString } from '@codebuff/common/tools/utils'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'

import * as checkTerminalCommandModule from '../check-terminal-command'
import * as requestFilesPrompt from '../find-files/request-files-prompt'
import * as liveUserInputs from '../live-user-inputs'
import { MockWebSocket, mockFileContext } from './test-utils'
import * as context7Api from '../llm-apis/context7-api'
import * as aisdk from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { runAgentStep } from '../run-agent-step'
import { assembleLocalAgentTemplates } from '../templates/agent-registry'
import * as agentRegistry from '../templates/agent-registry'
import * as websocketAction from '../websockets/websocket-action'

import type { WebSocket } from 'ws'

describe('read_docs tool with researcher agent', () => {
  beforeAll(() => {
    // Mock logger
    mockModule('@codebuff/backend/util/logger', () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
    }))

    // Inject a minimal researcher agent so prompts/spawnableAgents exist
    const originalAssemble = agentRegistry.assembleLocalAgentTemplates
    spyOn(agentRegistry, 'assembleLocalAgentTemplates').mockImplementation(
      (fc: any) => {
        const res = originalAssemble(fc)
        return {
          ...res,
          agentTemplates: {
            ...res.agentTemplates,
            researcher: {
              id: 'researcher',
              displayName: 'Researcher',
              model: 'openai/gpt-4o-mini',
              toolNames: ['read_docs', 'end_turn'],
              systemPrompt: '',
              stepPrompt: '',
              instructionsPrompt: '',
              spawnableAgents: [],
            } as any,
          },
        }
      },
    )
  })

  beforeEach(() => {
    // Mock analytics and tracing
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics()
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})
    spyOn(bigquery, 'insertTrace').mockImplementation(() =>
      Promise.resolve(true),
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
      Promise.resolve('Test response'),
    )

    // Mock other required modules
    spyOn(requestFilesPrompt, 'requestRelevantFiles').mockImplementation(
      async () => [],
    )
    spyOn(
      checkTerminalCommandModule,
      'checkTerminalCommand',
    ).mockImplementation(async () => null)

    // Mock live user inputs
    spyOn(liveUserInputs, 'checkLiveUserInput').mockImplementation(() => true)
  })

  afterEach(() => {
    mock.restore()
  })

  afterAll(() => {
    clearMockedModules()
  })

  // MockWebSocket and mockFileContext imported from test-utils

  // Inject a minimal researcher agent template so tests don't fail on missing agent
  const minimalResearcherTemplate = {
    id: 'researcher',
    displayName: 'Researcher',
    model: 'openai/gpt-4o-mini',
    toolNames: ['read_docs', 'end_turn'],
    systemPrompt: '',
    stepPrompt: '',
    instructionsPrompt: '',
    spawnableAgents: [],
  } as any

  // Wrap assembleLocalAgentTemplates to include the researcher template
  const _assembleLocalAgentTemplates = assembleLocalAgentTemplates
  function assembleLocalAgentTemplatesWithResearcher(fc: any) {
    const res = _assembleLocalAgentTemplates(fc)
    return {
      ...res,
      agentTemplates: {
        ...res.agentTemplates,
        researcher: minimalResearcherTemplate,
      },
    }
  }

  test.skip('should successfully fetch documentation with basic query', async () => {
    const mockDocumentation =
      'React is a JavaScript library for building user interfaces...'

    spyOn(context7Api, 'searchLibraries').mockImplementation(async () => [
      {
        id: 'react-123',
        title: 'React',
        description: 'A JavaScript library for building user interfaces',
        branch: 'main',
        lastUpdateDate: '2023-01-01',
        state: 'finalized',
        totalTokens: 10000,
        totalSnippets: 100,
        totalPages: 50,
      },
    ])
    spyOn(context7Api, 'fetchContext7LibraryDocumentation').mockImplementation(
      async () => mockDocumentation,
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
    const { agentTemplates } =
      assembleLocalAgentTemplatesWithResearcher(mockFileContext)

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
        localAgentTemplates: agentTemplates,
        agentState,
        prompt: 'Get React documentation',
        params: undefined,
      },
    )

    expect(context7Api.fetchContext7LibraryDocumentation).toHaveBeenCalledWith(
      'React',
      {},
    )

    // Check that the documentation was added to the message history
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('read_docs'),
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      mockDocumentation,
    )
  })

  test.skip('should fetch documentation with topic and max_tokens', async () => {
    const mockDocumentation =
      'React hooks allow you to use state and other React features...'

    spyOn(context7Api, 'searchLibraries').mockImplementation(async () => [
      {
        id: 'react-123',
        title: 'React',
        description: 'A JavaScript library for building user interfaces',
        branch: 'main',
        lastUpdateDate: '2023-01-01',
        state: 'finalized',
        totalTokens: 10000,
        totalSnippets: 100,
        totalPages: 50,
      },
    ])
    spyOn(context7Api, 'fetchContext7LibraryDocumentation').mockImplementation(
      async () => mockDocumentation,
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
    const { agentTemplates } =
      assembleLocalAgentTemplatesWithResearcher(mockFileContext)

    await runAgentStep(new MockWebSocket() as unknown as WebSocket, {
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      agentType: 'researcher',
      fileContext: mockFileContext,
      localAgentTemplates: agentTemplates,
      agentState,
      prompt: 'Get React hooks documentation',
      params: undefined,
    })

    expect(context7Api.fetchContext7LibraryDocumentation).toHaveBeenCalledWith(
      'React',
      {
        topic: 'hooks',
        tokens: 5000,
      },
    )
  })

  test('should handle case when no documentation is found', async () => {
    // Mock both searchLibraries and fetchContext7LibraryDocumentation to avoid network calls
    spyOn(context7Api, 'searchLibraries').mockImplementation(async () => [])
    spyOn(context7Api, 'fetchContext7LibraryDocumentation').mockImplementation(
      async () => null,
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
    const { agentTemplates } =
      assembleLocalAgentTemplatesWithResearcher(mockFileContext)

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
        localAgentTemplates: agentTemplates,
        agentState,
        prompt: 'Get documentation for NonExistentLibrary',
        params: undefined,
      },
    )

    // Check that the "no documentation found" message was added
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('read_docs'),
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      'No documentation found for "NonExistentLibrary"',
    )
  })

  test('should handle API errors gracefully', async () => {
    const mockError = new Error('Network timeout')

    spyOn(context7Api, 'searchLibraries').mockImplementation(async () => [
      {
        id: 'react-123',
        title: 'React',
        description: 'A JavaScript library for building user interfaces',
        branch: 'main',
        lastUpdateDate: '2023-01-01',
        state: 'finalized',
        totalTokens: 10000,
        totalSnippets: 100,
        totalPages: 50,
      },
    ])
    spyOn(context7Api, 'fetchContext7LibraryDocumentation').mockImplementation(
      async () => {
        throw mockError
      },
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
    const { agentTemplates } =
      assembleLocalAgentTemplatesWithResearcher(mockFileContext)

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
        localAgentTemplates: agentTemplates,
        agentState,
        prompt: 'Get React documentation',
        params: undefined,
      },
    )

    // Check that the error message was added
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('read_docs'),
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      'Error fetching documentation for "React"',
    )
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      'Network timeout',
    )
  })

  test('should include topic in error message when specified', async () => {
    spyOn(context7Api, 'searchLibraries').mockImplementation(async () => [
      {
        id: 'react-123',
        title: 'React',
        description: 'A JavaScript library for building user interfaces',
        branch: 'main',
        lastUpdateDate: '2023-01-01',
        state: 'finalized',
        totalTokens: 10000,
        totalSnippets: 100,
        totalPages: 50,
      },
    ])
    spyOn(context7Api, 'fetchContext7LibraryDocumentation').mockImplementation(
      async () => null,
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
    const { agentTemplates } =
      assembleLocalAgentTemplatesWithResearcher(mockFileContext)

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
        localAgentTemplates: agentTemplates,
        agentState,
        prompt: 'Get React server components documentation',
        params: undefined,
      },
    )

    // Check that the topic is included in the error message
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('read_docs'),
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      'No documentation found for "React" with topic "server-components"',
    )
  })

  test('should handle non-Error exceptions', async () => {
    spyOn(context7Api, 'searchLibraries').mockImplementation(async () => [
      {
        id: 'react-123',
        title: 'React',
        description: 'A JavaScript library for building user interfaces',
        branch: 'main',
        lastUpdateDate: '2023-01-01',
        state: 'finalized',
        totalTokens: 10000,
        totalSnippets: 100,
        totalPages: 50,
      },
    ])
    spyOn(context7Api, 'fetchContext7LibraryDocumentation').mockImplementation(
      async () => {
        throw 'String error'
      },
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
    const { agentTemplates } =
      assembleLocalAgentTemplatesWithResearcher(mockFileContext)

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
        localAgentTemplates: agentTemplates,
        agentState,
        prompt: 'Get React documentation',
        params: undefined,
      },
    )

    // Check that the generic error message was added
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.includes('read_docs'),
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      'Error fetching documentation for "React"',
    )
    expect(toolResultMessages[toolResultMessages.length - 1].content).toContain(
      'Unknown error',
    )
  })
})
