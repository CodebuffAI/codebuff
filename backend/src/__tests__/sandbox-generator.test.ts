import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import {
  getInitialAgentState,
  type AgentState,
} from '@codebuff/common/types/session-state'
import { afterEach, beforeEach, describe, expect, test, spyOn } from 'bun:test'

import {
  clearAgentGeneratorCache,
  runProgrammaticStep,
} from '../run-programmatic-step'
import { mockFileContext, MockWebSocket } from './test-utils'
import * as agentRun from '../agent-run'
import * as requestContext from '../websockets/request-context'
import * as websocketAction from '../websockets/websocket-action'

import type { AgentTemplate } from '../templates/types'
import type { WebSocket } from 'ws'

describe('QuickJS Sandbox Generator', () => {
  let mockAgentState: AgentState
  let mockParams: any
  let mockTemplate: AgentTemplate

  beforeEach(() => {
    clearAgentGeneratorCache()

    // Mock dependencies
    spyOn(agentRun, 'addAgentStep').mockImplementation(
      async () => 'test-step-id',
    )
    spyOn(requestContext, 'getRequestContext').mockImplementation(() => ({
      processedRepoId: 'test-repo-id',
    }))
    spyOn(websocketAction, 'sendAction').mockImplementation(() => {})
    spyOn(crypto, 'randomUUID').mockImplementation(
      () =>
        'mock-uuid-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`,
    )

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
      localAgentTemplates: {},
      stepsComplete: false,
      stepNumber: 1,
    }
  })

  afterEach(() => {
    clearAgentGeneratorCache()
    clearMockedModules()
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

    const result = await runProgrammaticStep(mockAgentState, mockParams)

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
    mockParams.params = {}
    mockParams.localAgentTemplates = { 'test-vm-agent-error': mockTemplate }

    const result = await runProgrammaticStep(mockAgentState, mockParams)

    expect(result.endTurn).toBe(true)
    expect(result.agentState.output?.error).toContain(
      'Error executing handleSteps for agent test-vm-agent-error',
    )
  })
})
