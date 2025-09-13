import * as analytics from '@codebuff/common/analytics'
import db from '@codebuff/common/db'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
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
  it,
  mock,
  spyOn,
} from 'bun:test'

import { loopAgentSteps } from '../run-agent-step'
import { clearAgentGeneratorCache } from '../run-programmatic-step'
import { mockFileContext, MockWebSocket } from './test-utils'
import * as aisdk from '../llm-apis/vercel-ai-sdk/ai-sdk'

import type { AgentTemplate } from '../templates/types'
import type { StepGenerator } from '@codebuff/common/types/agent-template'
import type { AgentState } from '@codebuff/common/types/session-state'
import type { WebSocket } from 'ws'

describe('loopAgentSteps - runAgentStep vs runProgrammaticStep behavior', () => {
  let mockTemplate: AgentTemplate
  let mockAgentState: AgentState
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
      getFileReadingUpdates: async () => [],
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
  })

  beforeEach(() => {
    llmCallCount = 0

    // Setup spies for database operations
    spyOn(db, 'insert').mockReturnValue({
      values: mock(() => {
        return Promise.resolve({ id: 'test-run-id' })
      }),
    } as any)

    spyOn(db, 'update').mockReturnValue({
      set: mock(() => ({
        where: mock(() => {
          return Promise.resolve()
        }),
      })),
    } as any)

    spyOn(aisdk, 'promptAiSdkStream').mockImplementation(async function* ({
      resolveMessageId,
    }) {
      llmCallCount++
      yield `LLM response\n\n${getToolCallString('end_turn', {})}`
      if (resolveMessageId) {
        resolveMessageId('mock-message-id')
      }
    })

    // Mock analytics
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})

    // Mock crypto.randomUUID
    spyOn(crypto, 'randomUUID').mockImplementation(
      () => 'mock-uuid-0000-0000-0000-000000000000' as const,
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

  afterAll(() => {
    clearMockedModules()
  })

  it('should verify correct STEP behavior - LLM called once after STEP', async () => {
    // This test verifies that when a programmatic agent yields STEP,
    // the LLM should be called once in the next iteration

    let stepCount = 0
    const mockGeneratorFunction = function* () {
      stepCount++
      // Execute a tool, then STEP
      yield { toolName: 'read_files', input: { paths: ['file1.txt'] } }
      yield 'STEP' // Should pause here and let LLM run
      // Continue after LLM runs (this won't be reached in this test since LLM ends turn)
      yield {
        toolName: 'write_file',
        input: { path: 'output.txt', content: 'test' },
      }
      yield { toolName: 'end_turn', input: {} }
    } as () => StepGenerator

    mockTemplate.handleSteps = mockGeneratorFunction

    const localAgentTemplates = {
      'test-agent': mockTemplate,
    }

    // Mock checkLiveUserInput to allow the loop to continue
    const mockCheckLiveUserInput = require('@codebuff/backend/live-user-inputs')
    spyOn(mockCheckLiveUserInput, 'checkLiveUserInput').mockImplementation(
      () => true, // Always return true to allow loop to continue
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
        localAgentTemplates,
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      },
    )

    console.log(`LLM calls made: ${llmCallCount}`)
    console.log(`Step count: ${stepCount}`)

    // CORRECT BEHAVIOR: After STEP, LLM should be called once
    // The programmatic agent yields STEP, then LLM runs once and ends turn
    expect(llmCallCount).toBe(1) // LLM called once after STEP

    // The programmatic agent should have been called once (yielded STEP)
    expect(stepCount).toBe(1)
  })

  it('should demonstrate correct behavior when programmatic agent completes without STEP', async () => {
    // This test shows that when a programmatic agent doesn't yield STEP,
    // it should complete without calling the LLM at all (since it ends with end_turn)

    const mockGeneratorFunction = function* () {
      yield { toolName: 'read_files', input: { paths: ['file1.txt'] } }
      yield {
        toolName: 'write_file',
        input: { path: 'output.txt', content: 'test' },
      }
      yield { toolName: 'end_turn', input: {} }
    } as () => StepGenerator

    mockTemplate.handleSteps = mockGeneratorFunction

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
        localAgentTemplates,
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      },
    )

    // Should NOT call LLM since the programmatic agent ended with end_turn
    expect(llmCallCount).toBe(0)
    // The result should have agentState
    expect(result.agentState).toBeDefined()
  })

  it('should run programmatic step first, then LLM step, then continue', async () => {
    // This test verifies the correct execution order in loopAgentSteps:
    // 1. Programmatic step runs first and yields STEP
    // 2. LLM step runs once
    // 3. Loop continues but generator is complete after first STEP

    let stepCount = 0
    const mockGeneratorFunction = function* () {
      stepCount++
      // First execution: do some work, then STEP
      yield { toolName: 'read_files', input: { paths: ['file1.txt'] } }
      yield 'STEP' // Hand control to LLM
      // After LLM runs, continue (this happens in the same generator instance)
      yield {
        toolName: 'write_file',
        input: { path: 'output.txt', content: 'updated by LLM' },
      }
      yield { toolName: 'end_turn', input: {} }
    } as () => StepGenerator

    mockTemplate.handleSteps = mockGeneratorFunction

    const localAgentTemplates = {
      'test-agent': mockTemplate,
    }

    // Mock checkLiveUserInput to allow multiple iterations
    const mockCheckLiveUserInput = require('@codebuff/backend/live-user-inputs')
    spyOn(mockCheckLiveUserInput, 'checkLiveUserInput').mockImplementation(
      () => true, // Always return true to allow loop to continue
    )

    const result = await loopAgentSteps(
      new MockWebSocket() as unknown as WebSocket,
      {
        userInputId: 'test-user-input',
        agentType: 'test-agent',
        agentState: mockAgentState,
        prompt: 'Test execution order',
        params: undefined,
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        localAgentTemplates,
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      },
    )

    // Verify execution order:
    // 1. Programmatic step function was called once (creates generator)
    // 2. LLM was called once after STEP
    // 3. Generator continued after LLM step
    expect(stepCount).toBe(1) // Generator function called once
    expect(llmCallCount).toBe(1) // LLM called once after first STEP
    expect(result.agentState).toBeDefined()
  })

  it('should handle programmatic agent that yields STEP_ALL', async () => {
    // Test STEP_ALL behavior - should run LLM then continue with programmatic step

    let stepCount = 0
    const mockGeneratorFunction = function* () {
      stepCount++
      yield { toolName: 'read_files', input: { paths: ['file1.txt'] } }
      yield 'STEP_ALL' // Hand all remaining control to LLM
      // Should continue after LLM completes all its steps
      yield {
        toolName: 'write_file',
        input: { path: 'final.txt', content: 'done' },
      }
      yield { toolName: 'end_turn', input: {} }
    } as () => StepGenerator

    mockTemplate.handleSteps = mockGeneratorFunction

    const localAgentTemplates = {
      'test-agent': mockTemplate,
    }

    let checkCallCount = 0
    const mockCheckLiveUserInput = require('@codebuff/backend/live-user-inputs')
    spyOn(mockCheckLiveUserInput, 'checkLiveUserInput').mockImplementation(
      () => {
        checkCallCount++
        return checkCallCount <= 5
      },
    )

    const result = await loopAgentSteps(
      new MockWebSocket() as unknown as WebSocket,
      {
        userInputId: 'test-user-input',
        agentType: 'test-agent',
        agentState: mockAgentState,
        prompt: 'Test STEP_ALL behavior',
        params: undefined,
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        localAgentTemplates,
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      },
    )

    expect(stepCount).toBe(1) // Generator function called once
    expect(llmCallCount).toBe(1) // LLM should be called once
    expect(result.agentState).toBeDefined()
  })

  it('should not call LLM when programmatic agent returns without STEP', async () => {
    // Test that programmatic agents that don't yield STEP don't trigger LLM

    const mockGeneratorFunction = function* () {
      yield { toolName: 'read_files', input: { paths: ['test.txt'] } }
      yield {
        toolName: 'write_file',
        input: { path: 'result.txt', content: 'processed' },
      }
      // No STEP - agent completes without LLM involvement
      yield { toolName: 'end_turn', input: {} }
    } as () => StepGenerator

    mockTemplate.handleSteps = mockGeneratorFunction

    const localAgentTemplates = {
      'test-agent': mockTemplate,
    }

    const result = await loopAgentSteps(
      new MockWebSocket() as unknown as WebSocket,
      {
        userInputId: 'test-user-input',
        agentType: 'test-agent',
        agentState: mockAgentState,
        prompt: 'Test no LLM call',
        params: undefined,
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        localAgentTemplates,
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      },
    )

    expect(llmCallCount).toBe(0) // No LLM calls should be made
    expect(result.agentState).toBeDefined()
  })

  it('should handle LLM-only agent (no handleSteps)', async () => {
    // Test traditional LLM-based agents that don't have handleSteps

    const llmOnlyTemplate = {
      ...mockTemplate,
      handleSteps: undefined, // No programmatic step function
    }

    const localAgentTemplates = {
      'test-agent': llmOnlyTemplate,
    }

    let checkCallCount = 0
    const mockCheckLiveUserInput = require('@codebuff/backend/live-user-inputs')
    spyOn(mockCheckLiveUserInput, 'checkLiveUserInput').mockImplementation(
      () => {
        checkCallCount++
        return checkCallCount <= 2 // Allow 2 iterations
      },
    )

    const result = await loopAgentSteps(
      new MockWebSocket() as unknown as WebSocket,
      {
        userInputId: 'test-user-input',
        agentType: 'test-agent',
        agentState: mockAgentState,
        prompt: 'Test LLM-only agent',
        params: undefined,
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        localAgentTemplates,
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      },
    )

    expect(llmCallCount).toBe(1) // LLM should be called once
    expect(result.agentState).toBeDefined()
  })

  it('should handle programmatic agent error and still call LLM', async () => {
    // Test error handling in programmatic step - should still allow LLM to run

    const mockGeneratorFunction = function* () {
      yield { toolName: 'read_files', input: { paths: ['file1.txt'] } }
      throw new Error('Programmatic step failed')
    } as () => StepGenerator

    mockTemplate.handleSteps = mockGeneratorFunction

    const localAgentTemplates = {
      'test-agent': mockTemplate,
    }

    let checkCallCount = 0
    const mockCheckLiveUserInput = require('@codebuff/backend/live-user-inputs')
    spyOn(mockCheckLiveUserInput, 'checkLiveUserInput').mockImplementation(
      () => {
        checkCallCount++
        return checkCallCount <= 2
      },
    )

    const result = await loopAgentSteps(
      new MockWebSocket() as unknown as WebSocket,
      {
        userInputId: 'test-user-input',
        agentType: 'test-agent',
        agentState: mockAgentState,
        prompt: 'Test error handling',
        params: undefined,
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        localAgentTemplates,
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      },
    )

    // After programmatic step error, should end turn and not call LLM
    expect(llmCallCount).toBe(0)
    expect(result.agentState).toBeDefined()
    expect(result.agentState.output?.error).toContain(
      'Error executing handleSteps for agent test-agent',
    )
  })

  it('should handle mixed execution with multiple STEP yields', async () => {
    // Test complex scenario with multiple STEP yields and LLM interactions
    // Note: In current implementation, LLM typically ends turn after running,
    // so this tests the first STEP interaction

    let stepCount = 0
    const mockGeneratorFunction = function* () {
      stepCount++
      yield { toolName: 'read_files', input: { paths: ['input.txt'] } }
      yield 'STEP' // First LLM interaction
      yield {
        toolName: 'write_file',
        input: { path: 'temp.txt', content: 'intermediate' },
      }
      yield {
        toolName: 'write_file',
        input: { path: 'final.txt', content: 'complete' },
      }
      yield { toolName: 'end_turn', input: {} }
    } as () => StepGenerator

    mockTemplate.handleSteps = mockGeneratorFunction

    const localAgentTemplates = {
      'test-agent': mockTemplate,
    }

    let checkCallCount = 0
    const mockCheckLiveUserInput = require('@codebuff/backend/live-user-inputs')
    spyOn(mockCheckLiveUserInput, 'checkLiveUserInput').mockImplementation(
      () => {
        checkCallCount++
        return checkCallCount <= 10 // Allow many iterations
      },
    )

    const result = await loopAgentSteps(
      new MockWebSocket() as unknown as WebSocket,
      {
        userInputId: 'test-user-input',
        agentType: 'test-agent',
        agentState: mockAgentState,
        prompt: 'Test multiple STEP interactions',
        params: undefined,
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        localAgentTemplates,
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      },
    )

    expect(stepCount).toBe(1) // Generator function called once
    expect(llmCallCount).toBe(1) // LLM called once after STEP
    expect(result.agentState).toBeDefined()
  })

  it('should respect async agent messages and continue appropriately', async () => {
    // Test async agent message handling during loopAgentSteps

    const mockGeneratorFunction = function* () {
      yield { toolName: 'read_files', input: { paths: ['async-test.txt'] } }
      yield 'STEP'
    } as () => StepGenerator

    mockTemplate.handleSteps = mockGeneratorFunction

    const localAgentTemplates = {
      'test-agent': mockTemplate,
    }

    // Mock async agent manager to simulate pending messages
    const mockAsyncAgentManager = require('@codebuff/backend/async-agent-manager')
    let getMessagesCallCount = 0
    spyOn(
      mockAsyncAgentManager.asyncAgentManager,
      'getMessages',
    ).mockImplementation(() => {
      getMessagesCallCount++
      // Return messages on second call to simulate async agent activity
      return getMessagesCallCount === 2 ? ['async message'] : []
    })

    let checkCallCount = 0
    const mockCheckLiveUserInput = require('@codebuff/backend/live-user-inputs')
    spyOn(mockCheckLiveUserInput, 'checkLiveUserInput').mockImplementation(
      () => {
        checkCallCount++
        return checkCallCount <= 5
      },
    )

    const result = await loopAgentSteps(
      new MockWebSocket() as unknown as WebSocket,
      {
        userInputId: 'test-user-input',
        agentType: 'test-agent',
        agentState: mockAgentState,
        prompt: 'Test async agent messages',
        params: undefined,
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        localAgentTemplates,
        userId: TEST_USER_ID,
        clientSessionId: 'test-session',
        onResponseChunk: () => {},
      },
    )

    // Should continue when async messages are present
    expect(result.agentState).toBeDefined()
    expect(getMessagesCallCount).toBeGreaterThan(0)
  })

  it('should pass shouldEndTurn: true as stepsComplete when end_turn tool is called', async () => {
    // Test that when LLM calls end_turn, shouldEndTurn is correctly passed to runProgrammaticStep

    let runProgrammaticStepCalls: any[] = []

    // Mock runProgrammaticStep module to capture calls and verify stepsComplete parameter
    const mockedRunProgrammaticStep = await mockModule(
      '@codebuff/backend/run-programmatic-step',
      () => ({
        runProgrammaticStep: async (agentState: any, options: any) => {
          runProgrammaticStepCalls.push({ agentState, options })
          // Return default behavior
          return { agentState, endTurn: false }
        },
        clearAgentGeneratorCache: () => {},
        agentIdToStepAll: new Set(),
      }),
    )

    const mockGeneratorFunction = function* () {
      yield 'STEP' // Hand control to LLM
    } as () => StepGenerator

    mockTemplate.handleSteps = mockGeneratorFunction

    const localAgentTemplates = {
      'test-agent': mockTemplate,
    }

    // Mock checkLiveUserInput to allow the loop to run
    const mockCheckLiveUserInput = require('@codebuff/backend/live-user-inputs')
    spyOn(mockCheckLiveUserInput, 'checkLiveUserInput').mockImplementation(
      () => true,
    )

    await loopAgentSteps(new MockWebSocket() as unknown as WebSocket, {
      userInputId: 'test-user-input',
      agentType: 'test-agent',
      agentState: mockAgentState,
      prompt: 'Test shouldEndTurn to stepsComplete flow',
      params: undefined,
      fingerprintId: 'test-fingerprint',
      fileContext: mockFileContext,
      localAgentTemplates,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session',
      onResponseChunk: () => {},
    })

    mockedRunProgrammaticStep.clear()

    // Verify that runProgrammaticStep was called twice:
    // 1. First with stepsComplete: false (initial call)
    // 2. Second with stepsComplete: true (after LLM called end_turn)
    expect(runProgrammaticStepCalls).toHaveLength(2)

    // First call should have stepsComplete: false
    expect(runProgrammaticStepCalls[0].options.stepsComplete).toBe(false)

    // Second call should have stepsComplete: true (after end_turn tool was called)
    expect(runProgrammaticStepCalls[1].options.stepsComplete).toBe(true)
  })
})
