import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/constants'
import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
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

import { loopAgentSteps } from '../run-agent-step'
import { clearAgentGeneratorCache } from '../run-programmatic-step'
import { mockFileContext, MockWebSocket } from './test-utils'
import * as promptAgentStream from '../prompt-agent-stream'
import * as requestContext from '../websockets/request-context'

import type { AgentTemplate, StepGenerator } from '../templates/types'
import type { AgentState } from '@codebuff/common/types/session-state'
import type { WebSocket } from 'ws'

describe('loopAgentSteps STEP behavior', () => {
  let mockTemplate: AgentTemplate
  let mockAgentState: AgentState
  let getAgentStreamFromTemplateSpy: any
  let getRequestContextSpy: any
  let llmCallCount: number

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

    // Mock bigquery
    mockModule('@codebuff/bigquery', () => ({
      insertTrace: () => {},
    }))

    // Mock agent registry
    mockModule('@codebuff/backend/templates/agent-registry', () => ({
      getAgentTemplate: async (agentType: string, localTemplates: any) => {
        return localTemplates[agentType] || mockTemplate
      },
    }))

    // Mock template strings
    mockModule('@codebuff/backend/templates/strings', () => ({
      getAgentPrompt: async () => 'Mock prompt',
    }))

    // Mock live user inputs - will be overridden in individual tests
    mockModule('@codebuff/backend/live-user-inputs', () => ({
      checkLiveUserInput: () => false, // Default to false, override in tests
    }))

    // Mock file reading updates
    mockModule('@codebuff/backend/get-file-reading-updates', () => ({
      getFileReadingUpdates: async () => ({
        addedFiles: [],
        updatedFilePaths: [],
        clearReadFileToolResults: false,
      }),
    }))

    // Mock async agent manager
    mockModule('@codebuff/backend/async-agent-manager', () => ({
      asyncAgentManager: {
        getAgent: () => null,
        registerAgent: () => {},
        updateAgentState: () => {},
        getAndClearMessages: () => [],
        getMessages: () => [],
      },
    }))

    // Mock stream parser
    mockModule('@codebuff/backend/tools/stream-parser', () => ({
      processStreamWithTools: async (options: any) => {
        llmCallCount++ // Count LLM calls here since this is where the stream is processed
        return {
          toolCalls: [],
          toolResults: [],
          state: {
            agentState: options.agentState || mockAgentState,
            agentContext: {},
            messages: options.messages || [],
          },
          fullResponse: 'LLM response',
          fullResponseChunks: ['LLM response'],
        }
      },
    }))
  })

  beforeEach(() => {
    llmCallCount = 0

    // Mock analytics
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics()
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})

    // Mock getAgentStreamFromTemplate
    getAgentStreamFromTemplateSpy = spyOn(
      promptAgentStream,
      'getAgentStreamFromTemplate',
    ).mockImplementation(() => {
      return (messages: any) => {
        // Return a mock stream
        return (async function* () {
          yield 'Mock LLM response'
        })()
      }
    })

    // Mock getRequestContext
    getRequestContextSpy = spyOn(
      requestContext,
      'getRequestContext',
    ).mockImplementation(() => ({
      processedRepoId: 'test-repo-id',
    }))

    // Mock crypto.randomUUID
    spyOn(crypto, 'randomUUID').mockImplementation(
      () =>
        'mock-uuid-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    )

    // Create mock template with programmatic agent
    mockTemplate = {
      id: 'test-agent',
      displayName: 'Test Agent',
      spawnerPrompt: 'Testing',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output',
      includeMessageHistory: true,
      toolNames: ['read_files', 'write_file', 'end_turn'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test user prompt',
      stepPrompt: 'Test agent step prompt',
      handleSteps: undefined, // Will be set in individual tests
    } as AgentTemplate

    // Create mock agent state
    const sessionState = getInitialSessionState(mockFileContext)
    mockAgentState = {
      ...sessionState.mainAgentState,
      agentId: 'test-agent-id',
      messageHistory: [
        { role: 'user', content: 'Initial message' },
        { role: 'assistant', content: 'Initial response' },
      ],
      output: undefined,
      stepsRemaining: 10, // Ensure we don't hit the limit
    }
  })

  afterEach(() => {
    mock.restore()
    clearAgentGeneratorCache()
  })

  llmCallCount = 0 // Reset LLM call count
  afterAll(() => {
    clearMockedModules()
  })

  it('should verify correct STEP behavior - LLM called once after STEP', async () => {
    // This test verifies that programmatic agents don't call the LLM,
    // and that STEP yielding works correctly without LLM involvement

    let stepCount = 0
    const mockGenerator = (function* () {
      stepCount++

      if (stepCount === 1) {
        // First call: Execute a tool, then STEP
        yield { toolName: 'read_files', args: { paths: ['file1.txt'] } }
        yield 'STEP' // Should pause here
      } else if (stepCount === 2) {
        // Second call: Should continue from here, not call LLM
        yield {
          toolName: 'write_file',
          args: { path: 'output.txt', content: 'test' },
        }
        yield { toolName: 'end_turn', args: {} }
      }
    })() as StepGenerator

    mockTemplate.handleSteps = () => mockGenerator

    const localAgentTemplates = {
      'test-agent': mockTemplate,
    }

    // Mock checkLiveUserInput to return true for multiple iterations
    let checkCallCount = 0
    const mockCheckLiveUserInput = require('@codebuff/backend/live-user-inputs')
    spyOn(mockCheckLiveUserInput, 'checkLiveUserInput').mockImplementation(
      () => {
        checkCallCount++
        // Allow enough iterations to see the bug
        return checkCallCount <= 3
      },
    )

    const result = await loopAgentSteps(
      new MockWebSocket() as unknown as WebSocket,
      {
        userInputId: 'test-user-input',
        agentType: 'test-agent',
        agentState: mockAgentState,
        prompt: 'Test prompt',
        params: undefined,
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        toolResults: [],
        localAgentTemplates,
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      },
    )

    console.log(`LLM calls made: ${llmCallCount}`)
    console.log(`Step count: ${stepCount}`)

    // CORRECT BEHAVIOR: After STEP, LLM should be called once, then no more
    // The programmatic agent yields STEP, then LLM runs once
    expect(llmCallCount).toBe(1) // LLM called once after STEP

    // The programmatic agent should have been called once (yielded STEP)
    expect(stepCount).toBe(1)

    // After STEP, the LLM should run once, then the loop should continue correctly
  })

  it('should demonstrate correct behavior when programmatic agent completes without STEP', async () => {
    // This test shows that when a programmatic agent doesn't yield STEP,
    // it should complete without calling the LLM at all (since it ends with end_turn)

    const mockGenerator = (function* () {
      yield { toolName: 'read_files', args: { paths: ['file1.txt'] } }
      yield {
        toolName: 'write_file',
        args: { path: 'output.txt', content: 'test' },
      }
      yield { toolName: 'end_turn', args: {} }
    })() as StepGenerator

    mockTemplate.handleSteps = () => mockGenerator

    const localAgentTemplates = {
      'test-agent': mockTemplate,
    }

    const result = await loopAgentSteps(
      new MockWebSocket() as unknown as WebSocket,
      {
        userInputId: 'test-user-input',
        agentType: 'test-agent',
        agentState: mockAgentState,
        prompt: 'Test prompt',
        params: undefined,
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        toolResults: [],
        localAgentTemplates,
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      },
    )

    // Should NOT call LLM since the programmatic agent ended with end_turn
    expect(llmCallCount).toBe(0)
    // The result should have agentState but hasEndTurn might be undefined
    expect(result.agentState).toBeDefined()
  })
})
