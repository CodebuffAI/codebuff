import * as bigquery from '@codebuff/bigquery'
import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/constants'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import { WebSocket } from 'ws'

// Mock imports
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import * as aisdk from '../llm-apis/vercel-ai-sdk/ai-sdk'
import { runAgentStep } from '../run-agent-step'
import { clearAgentGeneratorCache } from '../run-programmatic-step'
import { getAllAgentTemplates } from '../templates/agent-registry'
import { AgentTemplate } from '../templates/types'
import * as websocketAction from '../websockets/websocket-action'

describe('runAgentStep - set_output tool', () => {
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
  })

  beforeEach(async () => {
    // Mock analytics and tracing
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics()
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})
    spyOn(bigquery, 'insertTrace').mockImplementation(() =>
      Promise.resolve(true)
    )

    spyOn(websocketAction, 'requestFiles').mockImplementation(
      async (ws: any, paths: string[]) => {
        const results: Record<string, string | null> = {}
        paths.forEach((p) => {
          if (p === 'src/auth.ts') {
            results[p] = 'export function authenticate() { return true; }'
          } else if (p === 'src/user.ts') {
            results[p] = 'export interface User { id: string; name: string; }'
          } else {
            results[p] = null
          }
        })
        return results
      }
    )

    spyOn(websocketAction, 'requestFile').mockImplementation(
      async (ws: any, path: string) => {
        if (path === 'src/auth.ts') {
          return 'export function authenticate() { return true; }'
        } else if (path === 'src/user.ts') {
          return 'export interface User { id: string; name: string; }'
        }
        return null
      }
    )

    spyOn(websocketAction, 'requestToolCall').mockImplementation(async () => ({
      success: true,
      result: 'Tool call success' as any,
    }))

    // Mock LLM APIs
    spyOn(aisdk, 'promptAiSdk').mockImplementation(() =>
      Promise.resolve('Test response')
    )
    clearAgentGeneratorCache()
  })

  afterEach(() => {
    mock.restore()
  })

  afterAll(() => {
    clearMockedModules()
    clearAgentGeneratorCache()
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
    agentTemplates: {},
  }

  it('should set output with simple key-value pair', async () => {
    const mockResponse =
      getToolCallString(
        'set_output',
        {
          message: 'Hi',
        },
        false
      ) +
      '\n\n' +
      getToolCallString('end_turn', {}, true)

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    const { agentRegistry } = await getAllAgentTemplates({
      fileContext: mockFileContext,
    })

    const result = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'base',
        fileContext: mockFileContext,
        agentRegistry,
        agentState,
        prompt: 'Analyze the codebase',
        params: undefined,
      }
    )

    expect(result.agentState.output).toEqual({
      message: 'Hi',
    })
    expect(result.shouldEndTurn).toBe(true)
  })

  it('should set output with complex data', async () => {
    const mockResponse =
      getToolCallString(
        'set_output',
        {
          message: 'Analysis complete',
          status: 'success',
          findings: ['Bug in auth.ts', 'Missing validation'],
        },
        false
      ) + getToolCallString('end_turn', {}, true)
    console.log('mockResponse', mockResponse)

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    const { agentRegistry } = await getAllAgentTemplates({
      fileContext: mockFileContext,
    })

    const result = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'base',
        fileContext: mockFileContext,
        agentRegistry,
        agentState,
        prompt: 'Analyze the codebase',
        params: undefined,
      }
    )

    expect(result.agentState.output).toEqual({
      message: 'Analysis complete',
      status: 'success',
      findings: ['Bug in auth.ts', 'Missing validation'],
    })
    expect(result.shouldEndTurn).toBe(true)
  })

  it('should replace existing output data', async () => {
    const mockResponse =
      getToolCallString(
        'set_output',
        {
          newField: 'new value',
          existingField: 'updated value',
        },
        false
      ) + getToolCallString('end_turn', {}, true)

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    // Pre-populate the output with existing data
    agentState.output = {
      existingField: 'original value',
      anotherField: 'unchanged',
    }
    const { agentRegistry } = await getAllAgentTemplates({
      fileContext: mockFileContext,
    })

    const result = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'base',
        fileContext: mockFileContext,
        agentRegistry,
        agentState,
        prompt: 'Update the output',
        params: undefined,
      }
    )

    expect(result.agentState.output).toEqual({
      newField: 'new value',
      existingField: 'updated value',
    })
  })

  it('should handle empty output parameter', async () => {
    const mockResponse =
      getToolCallString('set_output', {}, false) +
      getToolCallString('end_turn', {}, true)

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield mockResponse
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    agentState.output = { existingField: 'value' }
    const { agentRegistry } = await getAllAgentTemplates({
      fileContext: mockFileContext,
    })

    const result = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'base',
        fileContext: mockFileContext,
        agentRegistry,
        agentState,
        prompt: 'Update with empty object',
        params: undefined,
      }
    )

    // Should replace with empty object
    expect(result.agentState.output).toEqual({})
  })

  it('should handle handleSteps with one tool call and STEP_ALL', async () => {
    // Create a mock agent template with handleSteps
    const mockAgentTemplate: AgentTemplate = {
      id: 'test-handlesteps-agent',
      displayName: 'Test HandleSteps Agent',
      parentPrompt: 'Testing handleSteps functionality',
      model: 'claude-3-5-sonnet-20241022',
      promptSchema: {},
      outputMode: 'json' as const,
      includeMessageHistory: true,
      toolNames: ['read_files', 'end_turn'],
      subagents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test user prompt',
      stepPrompt: 'Test agent step prompt',
      handleSteps: function* ({ agentState, prompt, params }) {
        // Yield one tool call
        yield {
          toolName: 'read_files',
          args: { paths: ['src/test.ts'] },
        }
        // Then yield STEP_ALL to continue processing
        yield 'STEP_ALL'
      },
    }

    // Mock the agent registry to include our test agent
    const mockAgentRegistry = {
      'test-handlesteps-agent': mockAgentTemplate,
    }

    // Mock requestFiles to return test file content
    spyOn(websocketAction, 'requestFiles').mockImplementation(
      async (ws: any, paths: string[]) => {
        const results: Record<string, string | null> = {}
        paths.forEach((p) => {
          if (p === 'src/test.ts') {
            results[p] = 'export function testFunction() { return "test"; }'
          } else {
            results[p] = null
          }
        })
        return results
      }
    )

    // Mock the LLM stream to return a response that doesn't end the turn
    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* () {
      yield 'Continuing with the analysis...' // Non-empty response, no tool calls
    })

    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    const initialMessageCount = agentState.messageHistory.length

    const result = await runAgentStep(
      new MockWebSocket() as unknown as WebSocket,
      {
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        agentType: 'test-handlesteps-agent' as any,
        fileContext: mockFileContext,
        agentRegistry: mockAgentRegistry,
        agentState,
        prompt: 'Test the handleSteps functionality',
        params: undefined,
      }
    )

    // Should end turn because toolCalls.length === 0 && toolResults.length === 0 from LLM processing
    // (The programmatic step tool results don't count toward this calculation)
    expect(result.shouldEndTurn).toBe(true)

    const messageHistory = result.agentState.messageHistory

    // Verify exactly five messages were added: user prompt, user input prompt, tool call, tool result, and assistant response
    expect(messageHistory.length).toBe(initialMessageCount + 5)

    // Get the five new messages
    const newMessages = messageHistory.slice(initialMessageCount)

    // First message: user prompt (user role)
    const userPromptMessage = newMessages[0]
    expect(userPromptMessage.role).toBe('user')
    expect(typeof userPromptMessage.content).toBe('string')
    expect(userPromptMessage.content).toContain(
      'Test the handleSteps functionality'
    )

    // Second message: user input prompt (user role)
    const instructionsPromptMessage = newMessages[1]
    expect(instructionsPromptMessage.role).toBe('user')
    expect(typeof instructionsPromptMessage.content).toBe('string')
    expect(instructionsPromptMessage.content).toContain('Test user prompt')

    // Third message: read_files tool call (user role)
    const toolCallMessage = newMessages[2]
    expect(toolCallMessage.role).toBe('user')
    expect(typeof toolCallMessage.content).toBe('string')
    expect(toolCallMessage.content).toContain('read_files')
    expect(toolCallMessage.content).toContain('src/test.ts')

    // Fourth message: read_files tool result (user role)
    const toolResultMessage = newMessages[3]
    expect(toolResultMessage.role).toBe('user')
    expect(typeof toolResultMessage.content).toBe('string')
    expect(toolResultMessage.content).toContain('testFunction')

    // Fifth message: assistant response (assistant role)
    const assistantMessage = newMessages[4]
    expect(assistantMessage.role).toBe('assistant')
    expect(typeof assistantMessage.content).toBe('string')
    expect(assistantMessage.content).toBe('Continuing with the analysis...')

    // Verify requestFiles was called with correct parameters
    expect(websocketAction.requestFiles).toHaveBeenCalledWith(
      expect.any(Object), // WebSocket
      ['src/test.ts']
    )
  })
})
