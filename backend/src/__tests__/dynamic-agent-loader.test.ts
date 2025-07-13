import { describe, it, expect, mock } from 'bun:test'
import { ProjectFileContext } from '@codebuff/common/util/file'
import {
  dynamicAgentService,
  DynamicAgentService,
} from '../templates/dynamic-agent-service'

// Mock backend utility module
mock.module('../util/file-resolver', () => ({
  resolvePromptField: (field: string | { path: string }, basePath: string) => {
    if (typeof field === 'string') {
      return field
    }
    if (field.path?.includes('brainstormer-system.md')) {
      return 'You are a creative brainstormer.'
    }
    if (field.path?.includes('brainstormer-user-input.md')) {
      return 'Help brainstorm ideas.'
    }
    return 'Mock content'
  },
  resolveFileContent: (filePath: string, basePath: string) => {
    if (filePath.includes('brainstormer-system.md')) {
      return 'You are a creative brainstormer.'
    }
    if (filePath.includes('brainstormer-user-input.md')) {
      return 'Help brainstorm ideas.'
    }
    return 'Mock content'
  },
}))

describe('Dynamic Agent Loader', () => {
  const mockFileContext: ProjectFileContext = {
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
      platform: 'darwin',
      shell: 'bash',
      nodeVersion: '18.0.0',
      arch: 'x64',
      homedir: '/home/test',
      cpus: 4,
    },
  }

  it('should load valid dynamic agent template', async () => {
    const fileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/brainstormer.json': JSON.stringify({
          id: 'brainstormer',
          version: '1.0.0',
          override: false,
          name: 'Brainy',
          description: 'Creative thought partner',
          model: 'anthropic/claude-4-sonnet-20250522',
          systemPrompt: 'You are a creative brainstormer.',
          userInputPrompt: 'Help brainstorm ideas.',
          agentStepPrompt: 'Continue brainstorming.',
          toolNames: ['end_turn'],
          spawnableAgents: ['thinker', 'researcher'],
        }),
      },
    }

    const result = await dynamicAgentService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(0)
    expect(result.templates).toHaveProperty('brainstormer')
    expect(result.templates.brainstormer.name).toBe('Brainy')
    expect(result.templates.brainstormer.id).toBe('brainstormer')
  })

  it('should skip templates with override: true', async () => {
    const fileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/override.json': JSON.stringify({
          id: 'reviewer',
          version: '1.0.0',
          override: true,
          systemPrompt: 'Override system prompt',
        }),
      },
    }

    const result = await dynamicAgentService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(0)
    expect(Object.keys(result.templates)).toHaveLength(0)
  })

  it('should validate spawnable agents', async () => {
    const fileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/invalid.json': JSON.stringify({
          id: 'invalid_agent',
          version: '1.0.0',
          override: false,
          name: 'Invalid',
          description: 'Invalid agent',
          model: 'anthropic/claude-4-sonnet-20250522',
          systemPrompt: 'Test',
          userInputPrompt: 'Test',
          agentStepPrompt: 'Test',
          spawnableAgents: ['nonexistent_agent'],
        }),
      },
    }

    const result = await dynamicAgentService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(1)
    expect(result.validationErrors[0].message).toContain(
      'Invalid spawnable agents: nonexistent_agent'
    )
  })

  it('should handle invalid JSON', async () => {
    const fileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/broken.json': 'invalid json{',
      },
    }

    const result = await dynamicAgentService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(1)
    expect(result.validationErrors[0].message).toContain(
      'Error in agent template'
    )
  })

  it('should merge static and dynamic templates', async () => {
    const fileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/custom.json': JSON.stringify({
          id: 'custom_agent',
          version: '1.0.0',
          override: false,
          name: 'Custom',
          description: 'Custom agent',
          model: 'anthropic/claude-4-sonnet-20250522',
          systemPrompt: 'Custom system prompt',
          userInputPrompt: 'Custom user prompt',
          agentStepPrompt: 'Custom step prompt',
        }),
      },
    }

    const result = await dynamicAgentService.loadAgents(fileContext)

    // Should have dynamic templates
    expect(result.templates).toHaveProperty('custom_agent') // Dynamic
  })

  it('should handle agents with JSON schemas', async () => {
    // Create a new service instance to avoid global state issues
    const testService = new DynamicAgentService()

    const fileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/schema-agent.json': JSON.stringify({
          id: 'schema_agent',
          version: '1.0.0',
          override: false,
          name: 'Schema Agent',
          description: 'Agent with JSON schemas',
          model: 'anthropic/claude-4-sonnet-20250522',
          systemPrompt: 'Test system prompt',
          userInputPrompt: 'Test user prompt',
          agentStepPrompt: 'Test step prompt',
          promptSchema: {
            prompt: {
              type: 'string',
              description: 'A test prompt',
            },
            params: {
              type: 'object',
              properties: {
                temperature: { type: 'number', minimum: 0, maximum: 1 },
              },
            },
          },
        }),
      },
    }

    const result = await testService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(0)
    expect(result.templates).toHaveProperty('schema_agent')
    expect(result.templates.schema_agent.promptSchema.prompt).toBeDefined()
    expect(result.templates.schema_agent.promptSchema.params).toBeDefined()
  })

  it('should return validation errors for invalid schemas', async () => {
    // Create a new service instance to avoid global state issues
    const testService = new DynamicAgentService()

    const fileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/invalid-schema-agent.json': JSON.stringify({
          id: 'invalid_schema_agent',
          version: '1.0.0',
          override: false,
          name: 'Invalid Schema Agent',
          description: 'Agent with invalid schemas',
          model: 'anthropic/claude-4-sonnet-20250522',
          systemPrompt: 'Test system prompt',
          userInputPrompt: 'Test user prompt',
          agentStepPrompt: 'Test step prompt',
          promptSchema: {
            prompt: {
              type: 'number', // Invalid - should allow strings
            },
          },
        }),
      },
    }

    const result = await testService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(1)
    expect(result.validationErrors[0].message).toContain(
      'Invalid promptSchema.prompt'
    )
    expect(result.validationErrors[0].message).toContain(
      'Schema must allow string or undefined values'
    )
    expect(result.templates).not.toHaveProperty('invalid_schema_agent')
  })

  it('should resolve prompts from agentTemplates', async () => {
    const testService = new DynamicAgentService()

    const fileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/prompt-ref-agent.json': JSON.stringify({
          id: 'prompt_ref_agent',
          version: '1.0.0',
          override: false,
          name: 'Prompt Reference Agent',
          description: 'Agent with prompt references',
          model: 'anthropic/claude-4-sonnet-20250522',
          systemPrompt: { path: '.agents/templates/system-prompt.md' },
          userInputPrompt: 'Direct user prompt',
          agentStepPrompt: { path: '.agents/templates/step-prompt.md' },
        }),
        '.agents/templates/system-prompt.md':
          'System prompt from agentTemplates',
        '.agents/templates/step-prompt.md': 'Step prompt from agentTemplates',
      },
    }

    const result = await testService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(0)
    expect(result.templates).toHaveProperty('prompt_ref_agent')
    expect(result.templates.prompt_ref_agent.systemPrompt).toBe(
      'System prompt from agentTemplates'
    )
    expect(result.templates.prompt_ref_agent.userInputPrompt).toBe(
      'Direct user prompt'
    )
    expect(result.templates.prompt_ref_agent.agentStepPrompt).toBe(
      'Step prompt from agentTemplates'
    )
  })
})
