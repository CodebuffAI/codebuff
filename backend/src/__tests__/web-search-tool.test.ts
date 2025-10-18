// Set environment variables before any imports
process.env.LINKUP_API_KEY = 'test-api-key'

import { assembleLocalAgentTemplates } from '@codebuff/agent-runtime/templates/agent-registry'
import * as bigquery from '@codebuff/bigquery'
import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import {
  TEST_AGENT_RUNTIME_IMPL,
  TEST_AGENT_RUNTIME_SCOPED_IMPL,
} from '@codebuff/common/testing/impl/agent-runtime'
import { getToolCallString } from '@codebuff/common/tools/utils'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'

import researcherAgent from '../../../.agents/researcher/researcher'
import * as checkTerminalCommandModule from '../check-terminal-command'
import * as requestFilesPrompt from '../find-files/request-files-prompt'
import * as liveUserInputs from '../live-user-inputs'
import { mockFileContext } from './test-utils'
import * as linkupApi from '../llm-apis/linkup-api'
import { runAgentStep } from '../run-agent-step'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'

let agentRuntimeImpl: AgentRuntimeDeps = { ...TEST_AGENT_RUNTIME_IMPL }
function mockAgentStream(content: string | string[]) {
  agentRuntimeImpl.promptAiSdkStream = async function* ({}) {
    if (typeof content === 'string') {
      content = [content]
    }
    for (const chunk of content) {
      yield { type: 'text' as const, text: chunk }
    }
    return 'mock-message-id'
  }
}

let agentRuntimeScopedImpl: AgentRuntimeScopedDeps

describe('web_search tool with researcher agent', () => {
  beforeEach(() => {
    agentRuntimeScopedImpl = { ...TEST_AGENT_RUNTIME_SCOPED_IMPL }

    // Mock analytics and tracing
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics(agentRuntimeImpl)
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})
    spyOn(bigquery, 'insertTrace').mockImplementation(() =>
      Promise.resolve(true),
    )

    // Mock websocket actions
    agentRuntimeScopedImpl.requestFiles = async () => ({})
    agentRuntimeScopedImpl.requestOptionalFile = async () => null
    agentRuntimeScopedImpl.requestToolCall = async () => ({
      output: [
        {
          type: 'json',
          value: 'Tool call success',
        },
      ],
    })

    // Mock LLM APIs
    agentRuntimeImpl.promptAiSdk = async function () {
      return 'Test response'
    }

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
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL }
  })

  // MockWebSocket and mockFileContext imported from test-utils
  const mockFileContextWithAgents = {
    ...mockFileContext,
    agentTemplates: {
      researcher: researcherAgent,
    },
  }

  test('should call searchWeb function when web_search tool is used', async () => {
    const mockSearchResult = 'Test search result'

    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResult,
    )

    const mockResponse =
      getToolCallString('web_search', {
        query: 'test query',
      }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContextWithAgents)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext: mockFileContextWithAgents,
    })

    await runAgentStep({
      ...agentRuntimeImpl,
      ...agentRuntimeScopedImpl,
      system: 'Test system prompt',
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      agentType: 'researcher',
      fileContext: mockFileContext,
      localAgentTemplates: agentTemplates,
      agentState,
      prompt: 'Search for test',
      spawnParams: undefined,
    })

    // Just verify that searchWeb was called
    expect(linkupApi.searchWeb).toHaveBeenCalledWith({
      query: 'test query',
      depth: 'standard',
      logger: expect.anything(),
    })
  })

  test('should successfully perform web search with basic query', async () => {
    const mockSearchResult =
      'Next.js 15 introduces new features including improved performance and React 19 support. You can explore the latest features and improvements in Next.js 15.'

    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResult,
    )

    const mockResponse =
      getToolCallString('web_search', {
        query: 'Next.js 15 new features',
      }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContextWithAgents)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext: mockFileContextWithAgents,
    })

    const { agentState: newAgentState } = await runAgentStep({
      ...agentRuntimeImpl,
      ...agentRuntimeScopedImpl,
      system: 'Test system prompt',
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      agentType: 'researcher',
      fileContext: mockFileContext,
      localAgentTemplates: agentTemplates,
      agentState,
      prompt: 'Search for Next.js 15 new features',
      spawnParams: undefined,
    })

    expect(linkupApi.searchWeb).toHaveBeenCalledWith({
      query: 'Next.js 15 new features',
      depth: 'standard',
      logger: expect.anything(),
    })

    // Check that the search results were added to the message history
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) => m.role === 'tool' && m.content.toolName === 'web_search',
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(
      JSON.stringify(toolResultMessages[toolResultMessages.length - 1].content),
    ).toContain(mockSearchResult)
  })

  test('should handle custom depth parameter', async () => {
    const mockSearchResult =
      'A comprehensive guide to React Server Components and their implementation.'

    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResult,
    )

    const mockResponse =
      getToolCallString('web_search', {
        query: 'React Server Components tutorial',
        depth: 'deep',
      }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContextWithAgents)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext: mockFileContextWithAgents,
    })

    await runAgentStep({
      ...agentRuntimeImpl,
      ...agentRuntimeScopedImpl,
      system: 'Test system prompt',
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      agentType: 'researcher',
      fileContext: mockFileContext,
      localAgentTemplates: agentTemplates,
      agentState,
      prompt: 'Search for React Server Components tutorial with deep search',
      spawnParams: undefined,
    })

    expect(linkupApi.searchWeb).toHaveBeenCalledWith({
      query: 'React Server Components tutorial',
      depth: 'deep',
      logger: expect.anything(),
    })
  })

  test('should handle case when no search results are found', async () => {
    spyOn(linkupApi, 'searchWeb').mockImplementation(async () => null)

    const mockResponse =
      getToolCallString('web_search', {
        query: 'very obscure search query that returns nothing',
      }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContextWithAgents)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext: mockFileContextWithAgents,
    })

    const { agentState: newAgentState } = await runAgentStep({
      ...agentRuntimeImpl,
      ...agentRuntimeScopedImpl,
      system: 'Test system prompt',
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      agentType: 'researcher',
      fileContext: mockFileContext,
      localAgentTemplates: agentTemplates,
      agentState,
      prompt: "Search for something that doesn't exist",
      spawnParams: undefined,
    })

    // Verify that searchWeb was called
    expect(linkupApi.searchWeb).toHaveBeenCalledWith({
      query: 'very obscure search query that returns nothing',
      depth: 'standard',
      logger: expect.anything(),
    })

    // Check that the "no results found" message was added
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) => m.role === 'tool' && m.content.toolName === 'web_search',
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(
      JSON.stringify(toolResultMessages[toolResultMessages.length - 1].content),
    ).toContain('No search results found')
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

    const sessionState = getInitialSessionState(mockFileContextWithAgents)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext: mockFileContextWithAgents,
    })

    const { agentState: newAgentState } = await runAgentStep({
      ...agentRuntimeImpl,
      ...agentRuntimeScopedImpl,
      system: 'Test system prompt',
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      agentType: 'researcher',
      fileContext: mockFileContext,
      localAgentTemplates: agentTemplates,
      agentState,
      prompt: 'Search for something',
      spawnParams: undefined,
    })

    // Verify that searchWeb was called
    expect(linkupApi.searchWeb).toHaveBeenCalledWith({
      query: 'test query',
      depth: 'standard',
      logger: expect.anything(),
    })

    // Check that the error message was added
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) => m.role === 'tool' && m.content.toolName === 'web_search',
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(
      JSON.stringify(toolResultMessages[toolResultMessages.length - 1].content),
    ).toContain('Error performing web search')
    expect(
      JSON.stringify(toolResultMessages[toolResultMessages.length - 1].content),
    ).toContain('Linkup API timeout')
  })

  test('should handle null response from searchWeb', async () => {
    spyOn(linkupApi, 'searchWeb').mockImplementation(async () => null)

    const mockResponse =
      getToolCallString('web_search', {
        query: 'test query',
      }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContextWithAgents)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext: mockFileContextWithAgents,
    })

    const { agentState: newAgentState } = await runAgentStep({
      ...agentRuntimeImpl,
      ...agentRuntimeScopedImpl,
      system: 'Test system prompt',
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      agentType: 'researcher',
      fileContext: mockFileContext,
      localAgentTemplates: agentTemplates,
      agentState,
      prompt: 'Search for something',
      spawnParams: undefined,
    })

    // Verify that searchWeb was called
    expect(linkupApi.searchWeb).toHaveBeenCalledWith({
      query: 'test query',
      depth: 'standard',
      logger: expect.anything(),
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

    const sessionState = getInitialSessionState(mockFileContextWithAgents)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext: mockFileContextWithAgents,
    })

    const { agentState: newAgentState } = await runAgentStep({
      ...agentRuntimeImpl,
      ...agentRuntimeScopedImpl,
      system: 'Test system prompt',
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      agentType: 'researcher',
      fileContext: mockFileContext,
      localAgentTemplates: agentTemplates,
      agentState,
      prompt: 'Search for something',
      spawnParams: undefined,
    })

    // Verify that searchWeb was called
    expect(linkupApi.searchWeb).toHaveBeenCalledWith({
      query: 'test query',
      depth: 'standard',
      logger: expect.anything(),
    })

    // Check that the error message was added
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) => m.role === 'tool' && m.content.toolName === 'web_search',
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(
      JSON.stringify(toolResultMessages[toolResultMessages.length - 1].content),
    ).toContain('Error performing web search')
  })

  test('should format search results correctly', async () => {
    const mockSearchResult =
      'This is the first search result content. This is the second search result content.'

    spyOn(linkupApi, 'searchWeb').mockImplementation(
      async () => mockSearchResult,
    )

    const mockResponse =
      getToolCallString('web_search', {
        query: 'test formatting',
      }) + getToolCallString('end_turn', {})

    mockAgentStream(mockResponse)

    const sessionState = getInitialSessionState(mockFileContextWithAgents)
    const agentState = {
      ...sessionState.mainAgentState,
      agentType: 'researcher' as const,
    }
    const { agentTemplates } = assembleLocalAgentTemplates({
      ...agentRuntimeImpl,
      fileContext: mockFileContextWithAgents,
    })

    const { agentState: newAgentState } = await runAgentStep({
      ...agentRuntimeImpl,
      ...agentRuntimeScopedImpl,
      system: 'Test system prompt',
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      agentType: 'researcher',
      fileContext: mockFileContextWithAgents,
      localAgentTemplates: agentTemplates,
      agentState,
      prompt: 'Test search result formatting',
      spawnParams: undefined,
    })

    // Verify that searchWeb was called
    expect(linkupApi.searchWeb).toHaveBeenCalledWith({
      query: 'test formatting',
      depth: 'standard',
      logger: expect.anything(),
    })

    // Check that the search results were formatted correctly
    const toolResultMessages = newAgentState.messageHistory.filter(
      (m) => m.role === 'tool' && m.content.toolName === 'web_search',
    )
    expect(toolResultMessages.length).toBeGreaterThan(0)
    expect(
      JSON.stringify(toolResultMessages[toolResultMessages.length - 1].content),
    ).toContain(mockSearchResult)
  })
})
