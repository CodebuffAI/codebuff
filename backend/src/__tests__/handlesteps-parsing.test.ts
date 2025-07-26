import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  DynamicAgentConfigSchema,
  DynamicAgentTemplate,
} from '@codebuff/common/types/dynamic-agent-template'
import { dynamicAgentService } from '../templates/dynamic-agent-service'
import { AgentState } from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'

describe('handleSteps Parsing Tests', () => {
  let mockFileContext: ProjectFileContext
  let mockAgentTemplate: DynamicAgentTemplate

  beforeEach(() => {
    dynamicAgentService.reset()

    // Setup common mock data
    mockFileContext = {
      projectRoot: '/test',
      cwd: '/test',
      fileTree: [],
      fileTokenScores: {},
      knowledgeFiles: {},
      agentTemplates: {},
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
        homedir: '/test',
        cpus: 1,
      },
      tokenCallers: {},
    }

    mockAgentTemplate = {
      id: 'test-agent',
      version: '1.0.0',
      name: 'Test Agent',
      purpose: 'Testing',
      model: 'claude-3-5-sonnet-20241022',
      outputMode: 'json' as const,
      toolNames: ['set_output'],
      spawnableAgents: [],
      override: false as const,
      includeMessageHistory: true,
      systemPrompt: 'Test system prompt',
      userInputPrompt: 'Test user prompt',
      agentStepPrompt: 'Test agent step prompt',
    }
  })

  afterEach(() => {
    dynamicAgentService.reset()
  })

  test('should validate agent config with handleSteps function', () => {
    const agentConfig = {
      id: 'test-agent',
      version: '1.0.0',
      name: 'Test Agent',
      purpose: 'Testing handleSteps',
      model: 'claude-3-5-sonnet-20241022',
      outputMode: 'json' as const,
      toolNames: ['set_output'],
      systemPrompt: 'You are a test agent',
      userInputPrompt: 'Process: {prompt}',
      agentStepPrompt: 'Continue processing',
      handleSteps: function* ({
        agentState,
        prompt,
        params,
      }: {
        agentState: AgentState
        prompt?: string
        params?: any
      }) {
        yield {
          toolName: 'set_output',
          args: { message: 'Test completed' },
        }
      },
    }

    const result = DynamicAgentConfigSchema.safeParse(agentConfig)
    expect(result.success).toBe(true)

    if (result.success) {
      expect(typeof result.data.handleSteps).toBe('function')
    }
  })

  test('should convert handleSteps function to string', async () => {
    const handleStepsFunction = function* ({
      agentState,
      prompt,
      params,
    }: {
      agentState: AgentState
      prompt?: string
      params?: any
    }) {
      yield {
        toolName: 'set_output',
        args: { message: 'Hello from generator' },
      }
    }

    const agentTemplates = {
      'test-agent': {
        ...mockAgentTemplate,
        handleSteps: handleStepsFunction.toString(),
      },
    }

    const fileContext: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates,
    }

    const result = await dynamicAgentService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(0)
    expect(result.templates['test-agent']).toBeDefined()
    expect(typeof result.templates['test-agent'].handleSteps).toBe('string')
  })

  test('should require set_output tool for handleSteps with json output mode', () => {
    const {
      DynamicAgentTemplateSchema,
    } = require('@codebuff/common/types/dynamic-agent-template')

    const agentConfig = {
      id: 'test-agent',
      version: '1.0.0',
      name: 'Test Agent',
      purpose: 'Testing',
      model: 'claude-3-5-sonnet-20241022',
      outputMode: 'json' as const,
      toolNames: ['end_turn'], // Missing set_output
      spawnableAgents: [],
      systemPrompt: 'Test',
      userInputPrompt: 'Test',
      agentStepPrompt: 'Test',

      handleSteps:
        'function* () { yield { toolName: "set_output", args: {} } }',
    }

    const result = DynamicAgentTemplateSchema.safeParse(agentConfig)
    expect(result.success).toBe(false)
    if (!result.success) {
      const errorMessage = result.error.issues[0]?.message || ''
      expect(errorMessage).toContain('set_output')
    }
  })

  test('should validate that handleSteps is a generator function', async () => {
    const agentTemplates = {
      'test-agent': {
        ...mockAgentTemplate,
        handleSteps: 'function () { return "not a generator" }', // Missing *
      },
    }

    const fileContext: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates,
    }

    const result = await dynamicAgentService.loadAgents(fileContext)

    expect(result.validationErrors.length).toBeGreaterThan(0)
    expect(result.validationErrors[0].message).toContain('generator function')
    expect(result.validationErrors[0].message).toContain('function*')
  })

  test('should verify loaded template handleSteps matches original function toString', async () => {
    // Create a generator function
    const originalFunction = function* ({
      agentState,
      prompt,
      params,
    }: {
      agentState: AgentState
      prompt?: string
      params?: any
    }) {
      yield {
        toolName: 'set_output',
        args: { message: 'Test output', data: params },
      }
    }

    // Get the string representation
    const expectedStringified = originalFunction.toString()

    // Create agent templates with the function
    const agentTemplates = {
      'test-agent': {
        ...mockAgentTemplate,
        handleSteps: expectedStringified,
      },
    }

    const fileContext: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates,
    }

    // Load agents through the service
    const result = await dynamicAgentService.loadAgents(fileContext)

    // Verify no validation errors
    expect(result.validationErrors).toHaveLength(0)
    expect(result.templates['test-agent']).toBeDefined()

    // Verify the loaded template's handleSteps field matches the original toString
    expect(result.templates['test-agent'].handleSteps).toBe(expectedStringified)
    expect(typeof result.templates['test-agent'].handleSteps).toBe('string')
  })
})
