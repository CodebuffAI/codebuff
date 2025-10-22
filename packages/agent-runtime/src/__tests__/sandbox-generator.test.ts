import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import {
  getInitialAgentState,
  type AgentState,
} from '@codebuff/common/types/session-state'
import { afterEach, beforeEach, describe, expect, test, spyOn } from 'bun:test'

import {
  clearAgentGeneratorCache,
  runProgrammaticStep,
} from '../run-programmatic-step'
import { mockFileContext } from './test-utils'

import type { AgentTemplate } from '../templates/types'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { ParamsOf } from '@codebuff/common/types/function-params'

describe('QuickJS Sandbox Generator', () => {
  let mockAgentState: AgentState
  let mockParams: ParamsOf<typeof runProgrammaticStep>
  let mockTemplate: AgentTemplate
  let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

  beforeEach(() => {
    agentRuntimeImpl = { ...TEST_AGENT_RUNTIME_IMPL, sendAction: () => {} }

    clearAgentGeneratorCache(agentRuntimeImpl)

    // Mock dependencies
    spyOn(crypto, 'randomUUID').mockImplementation(
      () =>
        'mock-uuid-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    )

    // Reuse common test data structure
    mockAgentState = {
      ...getInitialAgentState(),
      agentId: 'test-agent-123',
      agentType: 'test-vm-agent',
      runId:
        'test-run-id' as `${string}-${string}-${string}-${string}-${string}`,
      directCreditsUsed: 0,
      childRunIds: [],
    }

    // Base template structure - will be customized per test
    mockTemplate = {
      id: 'test-vm-agent',
      displayName: 'Test VM Agent',
      spawnerPrompt: 'Test VM isolation',
      model: 'anthropic/claude-4-sonnet-20250522',
      outputMode: 'structured_output',
      includeMessageHistory: false,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['set_output'],
      spawnableAgents: [],
      inputSchema: {},
      systemPrompt: '',
      instructionsPrompt: '',
      stepPrompt: '',

      handleSteps: '', // Will be set per test
    }

    // Common params structure
    mockParams = {
      ...agentRuntimeImpl,
      repoId: undefined,
      repoUrl: undefined,
      system: undefined,
      agentState: mockAgentState,
      template: mockTemplate,
      prompt: 'Test prompt',
      toolCallParams: { testParam: 'value' },
      userId: 'test-user',
      userInputId: 'test-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      fileContext: mockFileContext,
      localAgentTemplates: {},
      stepsComplete: false,
      stepNumber: 1,
    }
  })

  afterEach(() => {
    clearAgentGeneratorCache(agentRuntimeImpl)
  })

  test('should execute string-based generator in QuickJS sandbox', async () => {
    // Customize template for this test
    mockTemplate.handleSteps = `
      function* ({ agentState, prompt, params }) {
        yield {
          toolName: 'set_output',
          input: {
            message: 'Hello from QuickJS sandbox!',
            prompt: prompt,
            agentId: agentState.agentId
          }
        }
      }
    `
    mockParams.template = mockTemplate
    mockParams.localAgentTemplates = { 'test-vm-agent': mockTemplate }

    const result = await runProgrammaticStep(mockParams)

    expect(result.agentState.output).toEqual({
      message: 'Hello from QuickJS sandbox!',
      prompt: 'Test prompt',
      agentId: 'test-agent-123',
    })
    expect(result.endTurn).toBe(true)
  })

  test('should handle QuickJS sandbox errors gracefully', async () => {
    // Customize for error test
    mockTemplate.id = 'test-vm-agent-error'
    mockTemplate.displayName = 'Test VM Agent Error'
    mockTemplate.spawnerPrompt = 'Test QuickJS error handling'
    mockTemplate.toolNames = []
    mockTemplate.handleSteps = `
      function* ({ agentState, prompt, params }) {
        throw new Error('QuickJS error test')
      }
    `

    mockAgentState.agentId = 'test-agent-error-123'
    mockAgentState.agentType = 'test-vm-agent-error'

    mockParams.template = mockTemplate
    mockParams.toolCallParams = {}
    mockParams.localAgentTemplates = { 'test-vm-agent-error': mockTemplate }

    const result = await runProgrammaticStep(mockParams)

    expect(result.endTurn).toBe(true)
    expect(result.agentState.output?.error).toContain(
      'Error executing handleSteps for agent test-vm-agent-error',
    )
  })
})
