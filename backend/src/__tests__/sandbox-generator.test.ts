import { AgentState } from '@codebuff/common/types/session-state'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { WebSocket } from 'ws'
import {
  clearAgentGeneratorCache,
  runProgrammaticStep,
} from '../run-programmatic-step'
import { AgentTemplate } from '../templates/types'
import { mockFileContext, MockWebSocket } from './test-utils'

describe('QuickJS Sandbox Generator', () => {
  let mockAgentState: AgentState
  let mockParams: any
  let mockTemplate: AgentTemplate

  beforeEach(() => {
    clearAgentGeneratorCache()

    // Reuse common test data structure
    mockAgentState = {
      agentId: 'test-agent-123',
      agentType: 'test-vm-agent',
      messageHistory: [],
      report: {},
      agentContext: {},
      subagents: [],
      stepsRemaining: 10,
    }

    // Base template structure - will be customized per test
    mockTemplate = {
      id: 'test-vm-agent',
      name: 'Test VM Agent',
      purpose: 'Test VM isolation',
      model: 'anthropic/claude-4-sonnet-20250522',
      outputMode: 'json',
      includeMessageHistory: false,
      toolNames: ['update_report'],
      spawnableAgents: [],
      promptSchema: {},
      systemPrompt: '',
      userInputPrompt: '',
      agentStepPrompt: '',
      initialAssistantMessage: '',
      initialAssistantPrefix: '',
      stepAssistantMessage: '',
      stepAssistantPrefix: '',
      handleSteps: '', // Will be set per test
    }

    // Common params structure
    mockParams = {
      template: mockTemplate,
      prompt: 'Test prompt',
      params: { testParam: 'value' },
      userId: 'test-user',
      userInputId: 'test-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      agentType: 'test-vm-agent',
      fileContext: mockFileContext,
      assistantMessage: undefined,
      assistantPrefix: undefined,
      ws: new MockWebSocket() as unknown as WebSocket,
    }
  })

  afterEach(() => {
    clearAgentGeneratorCache()
  })

  test('should execute string-based generator in QuickJS sandbox', async () => {
    // Customize template for this test
    mockTemplate.handleSteps = `
      function* ({ agentState, prompt, params }) {
        yield {
          toolName: 'update_report',
          args: {
            json_update: {
              message: 'Hello from QuickJS sandbox!',
              prompt: prompt,
              agentId: agentState.agentId
            }
          }
        }
      }
    `
    mockParams.template = mockTemplate

    const result = await runProgrammaticStep(mockAgentState, mockParams)

    expect(result.agentState.report).toEqual({
      message: 'Hello from QuickJS sandbox!',
      prompt: 'Test prompt',
      agentId: 'test-agent-123',
    })
    expect(result.endTurn).toBe(true)
  })

  test('should handle QuickJS sandbox errors gracefully', async () => {
    // Customize for error test
    mockTemplate.id = 'test-vm-agent-error'
    mockTemplate.name = 'Test VM Agent Error'
    mockTemplate.purpose = 'Test QuickJS error handling'
    mockTemplate.toolNames = []
    mockTemplate.handleSteps = `
      function* ({ agentState, prompt, params }) {
        throw new Error('QuickJS error test')
      }
    `

    mockAgentState.agentId = 'test-agent-error-123'
    mockAgentState.agentType = 'test-vm-agent-error'

    mockParams.template = mockTemplate
    mockParams.agentType = 'test-vm-agent-error'
    mockParams.params = {}

    const result = await runProgrammaticStep(mockAgentState, mockParams)

    expect(result.endTurn).toBe(true)
    expect(result.agentState.report.error).toContain(
      'Error executing programmatic agent'
    )
  })
})
