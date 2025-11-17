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

  describe('Integration: programmatic step -> n parameter -> nResponses', () => {})
})
