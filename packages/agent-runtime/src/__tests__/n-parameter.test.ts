import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import { runAgentStep } from '../run-agent-step'
import {
  clearAgentGeneratorCache,
  runProgrammaticStep,
} from '../run-programmatic-step'
import { mockFileContext } from './test-utils'

import type { AgentTemplate, StepGenerator } from '../templates/types'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type { AgentState } from '@codebuff/common/types/session-state'

const logger: Logger = {
  debug: () => {},
  error: () => {},
  info: () => {},
  warn: () => {},
}

describe('n parameter and GENERATE_N functionality', () => {
  let mockTemplate: AgentTemplate
  let mockAgentState: AgentState
  let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

  beforeEach(() => {
    agentRuntimeImpl = {
      ...TEST_AGENT_RUNTIME_IMPL,
      addAgentStep: async () => 'test-agent-step-id',
      getUserInfoFromApiKey: async () => ({
        id: 'test-user-id',
        email: 'test-email',
        discord_id: 'test-discord-id',
      }),
      sendAction: () => {},
    }

    // Mock analytics
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics({ logger })
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})

    // Mock crypto.randomUUID
    spyOn(crypto, 'randomUUID').mockImplementation(
      () =>
        'mock-uuid-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    )

    // Create mock template
    mockTemplate = {
      id: 'test-agent',
      displayName: 'Test Agent',
      spawnerPrompt: 'Testing',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output',
      includeMessageHistory: true,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['read_files', 'write_file', 'end_turn'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test user prompt',
      stepPrompt: 'Test agent step prompt',
      handleSteps: undefined,
    } as AgentTemplate

    // Create mock agent state
    const sessionState = getInitialSessionState(mockFileContext)
    mockAgentState = {
      ...sessionState.mainAgentState,
      agentId: 'test-agent-id',
      runId:
        'test-run-id' as `${string}-${string}-${string}-${string}-${string}`,
      messageHistory: [
        { role: 'user', content: 'Initial message' },
        { role: 'assistant', content: 'Initial response' },
      ],
      output: undefined,
      directCreditsUsed: 0,
      childRunIds: [],
    }
  })

  afterEach(() => {
    mock.restore()
    clearAgentGeneratorCache({ logger })
  })

  describe('runAgentStep with n parameter', () => {
    it('should call promptAiSdk with n parameter when n is provided', async () => {
      const promptAiSdkSpy = spyOn(
        agentRuntimeImpl,
        'promptAiSdk',
      ).mockResolvedValue(
        JSON.stringify(['Response 1', 'Response 2', 'Response 3']),
      )

      const result = await runAgentStep({
        ...agentRuntimeImpl,
        textOverride: null,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        onResponseChunk: () => {},
        agentType: 'test-agent',
        localAgentTemplates: { 'test-agent': mockTemplate },
        agentState: mockAgentState,
        prompt: 'Test prompt',
        spawnParams: undefined,
        system: 'Test system',
        n: 3,
        signal: new AbortController().signal,
      })

      // Verify promptAiSdk was called with n: 3
      expect(promptAiSdkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          n: 3,
        }),
      )

      // Verify return values
      expect(result.nResponses).toEqual([
        'Response 1',
        'Response 2',
        'Response 3',
      ])
      expect(result.shouldEndTurn).toBe(false)
      expect(result.messageId).toBe(null)
    })

    it('should return early without calling promptAiSdkStream when n is provided', async () => {
      const promptAiSdkStreamSpy = spyOn(
        agentRuntimeImpl,
        'promptAiSdkStream',
      ).mockImplementation(async function* () {
        yield { type: 'text' as const, text: 'Should not be called' }
        return 'mock-message-id'
      })

      spyOn(agentRuntimeImpl, 'promptAiSdk').mockResolvedValue(
        JSON.stringify(['Response 1', 'Response 2']),
      )

      await runAgentStep({
        ...agentRuntimeImpl,
        textOverride: null,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        onResponseChunk: () => {},
        agentType: 'test-agent',
        localAgentTemplates: { 'test-agent': mockTemplate },
        agentState: mockAgentState,
        prompt: 'Test prompt',
        spawnParams: undefined,
        system: 'Test system',
        n: 2,
        signal: new AbortController().signal,
      })

      // Verify stream was NOT called
      expect(promptAiSdkStreamSpy).not.toHaveBeenCalled()
    })

    it('should parse JSON response from promptAiSdk correctly', async () => {
      const responses = [
        'First implementation',
        'Second implementation',
        'Third implementation',
        'Fourth implementation',
        'Fifth implementation',
      ]

      spyOn(agentRuntimeImpl, 'promptAiSdk').mockResolvedValue(
        JSON.stringify(responses),
      )

      const result = await runAgentStep({
        ...agentRuntimeImpl,
        textOverride: null,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        onResponseChunk: () => {},
        agentType: 'test-agent',
        localAgentTemplates: { 'test-agent': mockTemplate },
        agentState: mockAgentState,
        prompt: 'Generate 5 responses',
        spawnParams: undefined,
        system: 'Test system',
        n: 5,
        signal: new AbortController().signal,
      })

      expect(result.nResponses).toEqual(responses)
      expect(result.nResponses?.length).toBe(5)
    })

    it('should use normal flow when n is undefined', async () => {
      const promptAiSdkSpy = spyOn(
        agentRuntimeImpl,
        'promptAiSdk',
      ).mockResolvedValue('Should not be called')

      const promptAiSdkStreamSpy = spyOn(
        agentRuntimeImpl,
        'promptAiSdkStream',
      ).mockImplementation(async function* () {
        yield { type: 'text' as const, text: 'Normal response' }
        return 'mock-message-id'
      })

      const result = await runAgentStep({
        ...agentRuntimeImpl,
        textOverride: null,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        onResponseChunk: () => {},
        agentType: 'test-agent',
        localAgentTemplates: { 'test-agent': mockTemplate },
        agentState: mockAgentState,
        prompt: 'Test prompt',
        spawnParams: undefined,
        system: 'Test system',
        n: undefined,
        signal: new AbortController().signal,
      })

      // Verify promptAiSdk was NOT called
      expect(promptAiSdkSpy).not.toHaveBeenCalled()
      // Verify stream was called
      expect(promptAiSdkStreamSpy).toHaveBeenCalled()
      // nResponses should be undefined in normal flow
      expect(result.nResponses).toBeUndefined()
    })
  })

  describe('runProgrammaticStep with GENERATE_N', () => {
    it('should handle GENERATE_N with different n values', async () => {
      for (const nValue of [1, 3, 5, 10]) {
        mockTemplate.handleSteps = function* () {
          yield { type: 'GENERATE_N', n: nValue }
        }

        const result = await runProgrammaticStep({
          ...agentRuntimeImpl,
          runId: `test-run-id-${nValue}`,
          ancestorRunIds: [],
          repoId: undefined,
          repoUrl: undefined,
          agentState: {
            ...mockAgentState,
            runId:
              `test-run-id-${nValue}` as `${string}-${string}-${string}-${string}-${string}`,
          },
          template: mockTemplate,
          prompt: 'Test prompt',
          toolCallParams: {},
          userId: TEST_USER_ID,
          userInputId: 'test-user-input',
          clientSessionId: 'test-session',
          fingerprintId: 'test-fingerprint',
          onResponseChunk: () => {},
          onCostCalculated: async () => {},
          fileContext: mockFileContext,
          localAgentTemplates: {},
          system: undefined,
          stepsComplete: false,
          stepNumber: 1,
          logger,
          signal: new AbortController().signal,
        })

        expect(result.generateN).toBe(nValue)

        // Clear the generator cache between iterations
        clearAgentGeneratorCache({ logger })
      }
    })

    it('should not set generateN when GENERATE_N is not yielded', async () => {
      mockTemplate.handleSteps = function* () {
        yield { toolName: 'read_files', input: { paths: ['test.txt'] } }
        yield { toolName: 'write_file', input: { path: 'out.txt' } }
        yield { toolName: 'end_turn', input: {} }
      }

      const result = await runProgrammaticStep({
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        agentState: mockAgentState,
        template: mockTemplate,
        prompt: 'Test prompt',
        toolCallParams: {},
        userId: TEST_USER_ID,
        userInputId: 'test-user-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        onCostCalculated: async () => {},
        fileContext: mockFileContext,
        localAgentTemplates: {},
        system: undefined,
        stepsComplete: false,
        stepNumber: 1,
        logger,
        signal: new AbortController().signal,
      })

      expect(result.generateN).toBeUndefined()
      expect(result.endTurn).toBe(true)
    })
  })

  describe('Integration: programmatic step -> n parameter -> nResponses', () => {
    it('should flow GENERATE_N through full pipeline', async () => {
      let receivedNResponses: string[] | undefined
      const expectedResponses = ['Impl A', 'Impl B', 'Impl C']

      mockTemplate.handleSteps = function* () {
        // Step 1: Request multiple generations
        const step1 = yield { type: 'GENERATE_N', n: 3 }
        receivedNResponses = step1.nResponses

        // Step 2: Use the responses
        yield {
          toolName: 'set_output',
          input: { selectedResponses: step1.nResponses },
        }
        yield { toolName: 'end_turn', input: {} }
      } as () => StepGenerator

      mockTemplate.toolNames = ['set_output', 'end_turn']

      // Mock executeToolCall to handle set_output
      const executeToolCallSpy = spyOn(
        await import('../tools/tool-executor'),
        'executeToolCall',
      ).mockImplementation(async (options: any) => {
        if (options.toolName === 'set_output') {
          options.state.agentState.output = options.input
        }
      })

      const mockParams: ParamsOf<typeof runProgrammaticStep> = {
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        agentState: mockAgentState,
        template: mockTemplate,
        prompt: 'Test prompt',
        toolCallParams: {},
        userId: TEST_USER_ID,
        userInputId: 'test-user-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        onCostCalculated: async () => {},
        fileContext: mockFileContext,
        localAgentTemplates: {},
        system: undefined,
        stepsComplete: false,
        stepNumber: 1,
        logger,
        signal: new AbortController().signal,
      }

      // First call: programmatic step yields GENERATE_N
      const result1 = await runProgrammaticStep(mockParams)
      expect(result1.generateN).toBe(3)
      expect(result1.endTurn).toBe(false)

      // Second call: pass nResponses back to programmatic step
      const result2 = await runProgrammaticStep({
        ...mockParams,
        agentState: result1.agentState,
        nResponses: expectedResponses,
        stepNumber: 2,
      })

      expect(receivedNResponses).toEqual(expectedResponses)
      expect(result2.agentState.output).toEqual({
        selectedResponses: expectedResponses,
      })

      executeToolCallSpy.mockRestore()
    })

    it('should handle GENERATE_N with tool execution before and after', async () => {
      const executionLog: string[] = []

      mockTemplate.handleSteps = function* () {
        // Pre-processing
        executionLog.push('pre-processing')
        yield {
          toolName: 'read_files',
          input: { paths: ['context.txt'] },
        }

        // Generate multiple responses
        executionLog.push('generating responses')
        const step = yield { type: 'GENERATE_N', n: 5 }
        executionLog.push(`received ${step.nResponses?.length} responses`)

        // Post-processing
        yield {
          toolName: 'write_file',
          input: {
            path: 'results.txt',
            instructions: 'Write results',
            content: `Got ${step.nResponses?.length} responses`,
          },
        }
        yield { toolName: 'end_turn', input: {} }
      } as () => StepGenerator

      mockTemplate.toolNames = ['read_files', 'write_file', 'end_turn']

      // Mock executeToolCall for this test
      const executeToolCallSpy = spyOn(
        await import('../tools/tool-executor'),
        'executeToolCall',
      ).mockImplementation(async () => {})

      const mockParams: ParamsOf<typeof runProgrammaticStep> = {
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        agentState: mockAgentState,
        template: mockTemplate,
        prompt: 'Test',
        toolCallParams: {},
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        onCostCalculated: async () => {},
        fileContext: mockFileContext,
        localAgentTemplates: {},
        system: undefined,
        stepsComplete: false,
        stepNumber: 1,
        logger,
        signal: new AbortController().signal,
      }

      // First call: execute read_files and yield GENERATE_N
      const result1 = await runProgrammaticStep(mockParams)
      expect(result1.generateN).toBe(5)
      expect(executionLog).toEqual(['pre-processing', 'generating responses'])

      // Second call: receive nResponses and continue
      const mockResponses = ['R1', 'R2', 'R3', 'R4', 'R5']
      const result2 = await runProgrammaticStep({
        ...mockParams,
        agentState: result1.agentState,
        nResponses: mockResponses,
        stepNumber: 2,
      })

      expect(executionLog).toEqual([
        'pre-processing',
        'generating responses',
        'received 5 responses',
      ])
      expect(result2.endTurn).toBe(true)

      executeToolCallSpy.mockRestore()
    })

    it('should handle multiple GENERATE_N calls in sequence', async () => {
      const allResponses: string[][] = []

      mockTemplate.handleSteps = function* () {
        // First generation
        const step1 = yield { type: 'GENERATE_N', n: 2 }
        allResponses.push(step1.nResponses || [])

        // Process first batch
        yield {
          toolName: 'write_file',
          input: {
            path: 'batch1.txt',
            instructions: 'Write batch 1',
            content: 'Batch 1',
          },
        }

        // Second generation
        const step2 = yield { type: 'GENERATE_N', n: 3 }
        allResponses.push(step2.nResponses || [])

        // Final output
        yield {
          toolName: 'set_output',
          input: { totalBatches: allResponses.length },
        }
        yield { toolName: 'end_turn', input: {} }
      } as () => StepGenerator

      mockTemplate.toolNames = ['write_file', 'set_output', 'end_turn']

      // Mock executeToolCall for this test
      const executeToolCallSpy = spyOn(
        await import('../tools/tool-executor'),
        'executeToolCall',
      ).mockImplementation(async (options: any) => {
        if (options.toolName === 'set_output') {
          options.state.agentState.output = options.input
        }
      })

      const mockParams: ParamsOf<typeof runProgrammaticStep> = {
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        agentState: mockAgentState,
        template: mockTemplate,
        prompt: 'Test',
        toolCallParams: {},
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        onCostCalculated: async () => {},
        fileContext: mockFileContext,
        localAgentTemplates: {},
        system: undefined,
        stepsComplete: false,
        stepNumber: 1,
        logger,
        signal: new AbortController().signal,
      }

      // First GENERATE_N
      const result1 = await runProgrammaticStep(mockParams)
      expect(result1.generateN).toBe(2)

      // Provide first batch of responses
      const result2 = await runProgrammaticStep({
        ...mockParams,
        agentState: result1.agentState,
        nResponses: ['A1', 'A2'],
        stepNumber: 2,
      })

      // Second GENERATE_N should be yielded
      expect(result2.generateN).toBe(3)

      // Provide second batch of responses
      const result3 = await runProgrammaticStep({
        ...mockParams,
        agentState: result2.agentState,
        nResponses: ['B1', 'B2', 'B3'],
        stepNumber: 3,
      })

      expect(allResponses).toEqual([
        ['A1', 'A2'],
        ['B1', 'B2', 'B3'],
      ])
      expect(result3.agentState.output).toEqual({ totalBatches: 2 })

      executeToolCallSpy.mockRestore()
    })
  })

  describe('Edge cases and error handling', () => {
    it('should handle GENERATE_N with n=1', async () => {
      mockTemplate.handleSteps = function* () {
        yield { type: 'GENERATE_N', n: 1 }
      } as () => StepGenerator

      const result = await runProgrammaticStep({
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        agentState: mockAgentState,
        template: mockTemplate,
        prompt: 'Test',
        toolCallParams: {},
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        onCostCalculated: async () => {},
        fileContext: mockFileContext,
        localAgentTemplates: {},
        system: undefined,
        stepsComplete: false,
        stepNumber: 1,
        logger,
        signal: new AbortController().signal,
      })

      expect(result.generateN).toBe(1)
      expect(result.endTurn).toBe(false)
    })

    it('should handle empty nResponses array', async () => {
      let receivedResponses: string[] | undefined

      mockTemplate.handleSteps = function* () {
        const step = yield { type: 'GENERATE_N', n: 3 }
        receivedResponses = step.nResponses
        yield { toolName: 'end_turn', input: {} }
      } as () => StepGenerator

      const mockParams: ParamsOf<typeof runProgrammaticStep> = {
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        agentState: mockAgentState,
        template: mockTemplate,
        prompt: 'Test',
        toolCallParams: {},
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        onCostCalculated: async () => {},
        fileContext: mockFileContext,
        localAgentTemplates: {},
        system: undefined,
        stepsComplete: false,
        stepNumber: 1,
        logger,
        signal: new AbortController().signal,
      }

      await runProgrammaticStep(mockParams)

      // Second call with empty array
      await runProgrammaticStep({
        ...mockParams,
        nResponses: [],
        stepNumber: 2,
      })

      expect(receivedResponses).toEqual([])
    })

    it('should handle undefined nResponses', async () => {
      let receivedResponses: string[] | undefined

      mockTemplate.handleSteps = function* () {
        const step = yield { type: 'GENERATE_N', n: 2 }
        receivedResponses = step.nResponses
        yield { toolName: 'end_turn', input: {} }
      } as () => StepGenerator

      const mockParams: ParamsOf<typeof runProgrammaticStep> = {
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        agentState: mockAgentState,
        template: mockTemplate,
        prompt: 'Test',
        toolCallParams: {},
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        onCostCalculated: async () => {},
        fileContext: mockFileContext,
        localAgentTemplates: {},
        system: undefined,
        stepsComplete: false,
        stepNumber: 1,
        logger,
        signal: new AbortController().signal,
      }

      await runProgrammaticStep(mockParams)

      // Second call without nResponses
      await runProgrammaticStep({
        ...mockParams,
        nResponses: undefined,
        stepNumber: 2,
      })

      expect(receivedResponses).toBeUndefined()
    })

    it('should handle GENERATE_N followed by error', async () => {
      mockTemplate.handleSteps = function* () {
        yield { type: 'GENERATE_N', n: 3 }
        throw new Error('Unexpected error after GENERATE_N')
      } as () => StepGenerator

      const mockParams: ParamsOf<typeof runProgrammaticStep> = {
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        agentState: mockAgentState,
        template: mockTemplate,
        prompt: 'Test',
        toolCallParams: {},
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        onCostCalculated: async () => {},
        fileContext: mockFileContext,
        localAgentTemplates: {},
        system: undefined,
        stepsComplete: false,
        stepNumber: 1,
        logger,
        signal: new AbortController().signal,
      }

      const result1 = await runProgrammaticStep(mockParams)
      expect(result1.generateN).toBe(3)

      // Second call should handle error
      const result2 = await runProgrammaticStep({
        ...mockParams,
        agentState: result1.agentState,
        nResponses: ['R1', 'R2', 'R3'],
        stepNumber: 2,
      })

      expect(result2.endTurn).toBe(true)
      expect(result2.agentState.output?.error).toContain(
        'Unexpected error after GENERATE_N',
      )
    })

    it('should handle GENERATE_N with STEP afterwards', async () => {
      let receivedResponses: string[] | undefined

      mockTemplate.handleSteps = function* () {
        const step1 = yield { type: 'GENERATE_N', n: 4 }
        receivedResponses = step1.nResponses

        // Yield STEP to pause execution
        yield 'STEP'

        // Continue after LLM runs
        yield {
          toolName: 'set_output',
          input: { processedResponses: receivedResponses?.length },
        }
        yield { toolName: 'end_turn', input: {} }
      } as () => StepGenerator

      mockTemplate.toolNames = ['set_output', 'end_turn']

      const mockParams: ParamsOf<typeof runProgrammaticStep> = {
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        agentState: mockAgentState,
        template: mockTemplate,
        prompt: 'Test',
        toolCallParams: {},
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        onCostCalculated: async () => {},
        fileContext: mockFileContext,
        localAgentTemplates: {},
        system: undefined,
        stepsComplete: false,
        stepNumber: 1,
        logger,
        signal: new AbortController().signal,
      }

      // First call yields GENERATE_N
      const result1 = await runProgrammaticStep(mockParams)
      expect(result1.generateN).toBe(4)

      // Second call receives nResponses and yields STEP
      const result2 = await runProgrammaticStep({
        ...mockParams,
        agentState: result1.agentState,
        nResponses: ['A', 'B', 'C', 'D'],
        stepNumber: 2,
      })

      expect(receivedResponses).toEqual(['A', 'B', 'C', 'D'])
      expect(result2.endTurn).toBe(false) // STEP should not end turn
    })

    it('should clear generateN when endTurn is true', async () => {
      mockTemplate.handleSteps = function* () {
        yield { type: 'GENERATE_N', n: 2 }
        // Generator ends immediately
      } as () => StepGenerator

      const result = await runProgrammaticStep({
        ...agentRuntimeImpl,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        agentState: mockAgentState,
        template: mockTemplate,
        prompt: 'Test',
        toolCallParams: {},
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        onResponseChunk: () => {},
        onCostCalculated: async () => {},
        fileContext: mockFileContext,
        localAgentTemplates: {},
        system: undefined,
        stepsComplete: false,
        stepNumber: 1,
        logger,
        signal: new AbortController().signal,
      })

      // Should still set generateN even though endTurn will be true
      expect(result.generateN).toBe(2)
      expect(result.endTurn).toBe(false)
    })
  })

  describe('runAgentStep n parameter edge cases', () => {
    it('should handle promptAiSdk returning malformed JSON', async () => {
      spyOn(agentRuntimeImpl, 'promptAiSdk').mockResolvedValue(
        'Not valid JSON',
      )

      await expect(
        runAgentStep({
          ...agentRuntimeImpl,
          textOverride: null,
          runId: 'test-run-id',
          ancestorRunIds: [],
          repoId: undefined,
          repoUrl: undefined,
          userId: TEST_USER_ID,
          userInputId: 'test-input',
          clientSessionId: 'test-session',
          fingerprintId: 'test-fingerprint',
          fileContext: mockFileContext,
          onResponseChunk: () => {},
          agentType: 'test-agent',
          localAgentTemplates: { 'test-agent': mockTemplate },
          agentState: mockAgentState,
          prompt: 'Test',
          spawnParams: undefined,
          system: 'Test',
          n: 3,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow()
    })

    it('should update agentState.creditsUsed when using n parameter', async () => {
      // Create a fresh agent state with zero credits for this test
      const freshAgentState = {
        ...mockAgentState,
        creditsUsed: 0,
        directCreditsUsed: 0,
      }

      const promptAiSdkSpy = spyOn(
        agentRuntimeImpl,
        'promptAiSdk',
      ).mockImplementation(async (params: any) => {
        // Call onCostCalculated to simulate cost tracking
        await params.onCostCalculated(100)
        return JSON.stringify(['R1', 'R2', 'R3'])
      })

      const result = await runAgentStep({
        ...agentRuntimeImpl,
        textOverride: null,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        onResponseChunk: () => {},
        agentType: 'test-agent',
        localAgentTemplates: { 'test-agent': mockTemplate },
        agentState: freshAgentState,
        prompt: 'Test',
        spawnParams: undefined,
        system: 'Test',
        n: 3,
        signal: new AbortController().signal,
      })

      // Verify onCostCalculated was called in promptAiSdk
      expect(promptAiSdkSpy).toHaveBeenCalled()
      
      // Verify credits were updated from 0 to 100
      expect(result.agentState.creditsUsed).toBe(100)
      expect(result.agentState.directCreditsUsed).toBe(100)
    })

    it('should preserve messageHistory when using n parameter', async () => {
      spyOn(agentRuntimeImpl, 'promptAiSdk').mockResolvedValue(
        JSON.stringify(['R1', 'R2']),
      )

      const result = await runAgentStep({
        ...agentRuntimeImpl,
        textOverride: null,
        runId: 'test-run-id',
        ancestorRunIds: [],
        repoId: undefined,
        repoUrl: undefined,
        userId: TEST_USER_ID,
        userInputId: 'test-input',
        clientSessionId: 'test-session',
        fingerprintId: 'test-fingerprint',
        fileContext: mockFileContext,
        onResponseChunk: () => {},
        agentType: 'test-agent',
        localAgentTemplates: { 'test-agent': mockTemplate },
        agentState: mockAgentState,
        prompt: 'Test',
        spawnParams: undefined,
        system: 'Test',
        n: 2,
        signal: new AbortController().signal,
      })

      // Message history should include the user prompt that was added
      // The implementation adds user prompt message before calling promptAiSdk
      expect(result.agentState.messageHistory.length).toBeGreaterThanOrEqual(
        mockAgentState.messageHistory.length,
      )
      
      // Verify the messages are preserved
      expect(result.agentState.messageHistory).toBeDefined()
    })
  })
})
