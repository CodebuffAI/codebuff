import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import {
  dynamicAgentService,
  DynamicAgentService,
} from '../templates/dynamic-agent-service'

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

  beforeAll(() => {
    // Mock backend utility module
    mockModule('@codebuff/backend/util/file-resolver', () => ({
      resolvePromptField: (
        field: string | { path: string },
        basePath: string
      ) => {
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
  })

  afterAll(() => {
    clearMockedModules()
  })

  it('should load valid dynamic agent template', async () => {
    const fileContext: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        brainstormer: {
          id: 'brainstormer',
          version: '1.0.0',
          override: false,
          name: 'Brainy',
          purpose: 'Creative thought partner',
          model: 'anthropic/claude-4-sonnet-20250522',
          systemPrompt: 'You are a creative brainstormer.',
          userInputPrompt: 'Help brainstorm ideas.',
          agentStepPrompt: 'Continue brainstorming.',
          toolNames: ['end_turn'],
          spawnableAgents: ['thinker', 'researcher'],
          initialAssistantMessage: '',
          initialAssistantPrefix: '',
          stepAssistantMessage: '',
          stepAssistantPrefix: '',
          outputMode: 'last_message',
          includeMessageHistory: true,
        },
      },
    }

    const result = await dynamicAgentService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(0)
    expect(result.templates).toHaveProperty('brainstormer')
    expect(result.templates.brainstormer.name).toBe('Brainy')
    expect(result.templates.brainstormer.id).toBe('brainstormer')
  })

  it('should validate spawnable agents', async () => {
    const fileContext: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        invalid: {
          id: 'invalid_agent',
          version: '1.0.0',
          override: false,
          name: 'Invalid',
          purpose: 'Invalid agent',
          model: 'anthropic/claude-4-sonnet-20250522',
          systemPrompt: 'Test',
          userInputPrompt: 'Test',
          agentStepPrompt: 'Test',
          spawnableAgents: ['nonexistent_agent'],
          outputMode: 'last_message',
          includeMessageHistory: true,
          toolNames: ['end_turn'],
          initialAssistantMessage: '',
          initialAssistantPrefix: '',
          stepAssistantMessage: '',
          stepAssistantPrefix: '',
        },
      },
    }

    const result = await dynamicAgentService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(1)
    expect(result.validationErrors[0].message).toContain(
      'Invalid spawnable agents: nonexistent_agent'
    )
  })

  it('should merge static and dynamic templates', async () => {
    const fileContext: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        custom: {
          id: 'custom_agent',
          version: '1.0.0',
          override: false,
          name: 'Custom',
          purpose: 'Custom agent',
          model: 'anthropic/claude-4-sonnet-20250522',
          systemPrompt: 'Custom system prompt',
          userInputPrompt: 'Custom user prompt',
          agentStepPrompt: 'Custom step prompt',
          outputMode: 'last_message',
          includeMessageHistory: true,
          toolNames: ['end_turn'],
          spawnableAgents: [],
          initialAssistantMessage: '',
          initialAssistantPrefix: '',
          stepAssistantMessage: '',
          stepAssistantPrefix: '',
        },
      },
    }

    const result = await dynamicAgentService.loadAgents(fileContext)

    // Should have dynamic templates
    expect(result.templates).toHaveProperty('custom_agent') // Dynamic
  })

  it('should handle agents with JSON schemas', async () => {
    // Create a new service instance to avoid global state issues
    const testService = new DynamicAgentService()

    const fileContext: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        'schema-agent': {
          id: 'schema_agent',
          version: '1.0.0',
          override: false,
          name: 'Schema Agent',
          purpose: 'Agent with JSON schemas',
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
          outputMode: 'last_message',
          includeMessageHistory: true,
          toolNames: ['end_turn'],
          spawnableAgents: [],
          initialAssistantMessage: '',
          initialAssistantPrefix: '',
          stepAssistantMessage: '',
          stepAssistantPrefix: '',
        },
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

    const fileContext: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        'invalid-schema-agent': {
          id: 'invalid_schema_agent',
          version: '1.0.0',
          override: false,
          name: 'Invalid Schema Agent',
          purpose: 'Agent with invalid schemas',
          model: 'anthropic/claude-4-sonnet-20250522',
          systemPrompt: 'Test system prompt',
          userInputPrompt: 'Test user prompt',
          agentStepPrompt: 'Test step prompt',
          promptSchema: {
            prompt: {
              type: 'number', // Invalid - should allow strings
            },
          },
          outputMode: 'last_message',
          includeMessageHistory: true,
          toolNames: ['end_turn'],
          spawnableAgents: [],
          initialAssistantMessage: '',
          initialAssistantPrefix: '',
          stepAssistantMessage: '',
          stepAssistantPrefix: '',
        },
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

  it('should handle missing override field as non-override template', async () => {
    const testService = new DynamicAgentService()

    const fileContext: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        'no-override-field': {
          id: 'no_override_agent',
          version: '1.0.0',
          // No override field - should be treated as non-override
          name: 'No Override Agent',
          purpose: 'Agent without override field',
          model: 'anthropic/claude-4-sonnet-20250522',
          systemPrompt: 'Test system prompt',
          userInputPrompt: 'Test user prompt',
          agentStepPrompt: 'Test step prompt',
          override: false,
          outputMode: 'last_message',
          includeMessageHistory: true,
          toolNames: ['end_turn'],
          spawnableAgents: [],
          initialAssistantMessage: '',
          initialAssistantPrefix: '',
          stepAssistantMessage: '',
          stepAssistantPrefix: '',
        },
      },
    }

    const result = await testService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(0)
    expect(result.templates).toHaveProperty('no_override_agent')
  })

  it('should validate spawnable agents including dynamic agents from first pass', async () => {
    const testService = new DynamicAgentService()

    const fileContext: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        'git-committer': {
          id: 'CodebuffAI/git-committer',
          version: '0.0.1',
          override: false,
          name: 'Git Committer',
          purpose: 'A git committer agent',
          model: 'google/gemini-2.5-pro',
          systemPrompt: 'You are an expert software developer.',
          userInputPrompt: 'Create a commit message.',
          agentStepPrompt: 'Make sure to end your response.',
          spawnableAgents: [], // No spawnable agents
          outputMode: 'last_message',
          includeMessageHistory: true,
          toolNames: ['end_turn'],
          initialAssistantMessage: '',
          initialAssistantPrefix: '',
          stepAssistantMessage: '',
          stepAssistantPrefix: '',
        },
        spawner: {
          id: 'spawner_agent',
          version: '1.0.0',
          override: false,
          name: 'Spawner Agent',
          purpose: 'Agent that can spawn git-committer',
          model: 'anthropic/claude-4-sonnet-20250522',
          systemPrompt: 'Test system prompt',
          userInputPrompt: 'Test user prompt',
          agentStepPrompt: 'Test step prompt',
          spawnableAgents: ['CodebuffAI/git-committer'], // Should be valid after first pass
          outputMode: 'last_message',
          includeMessageHistory: true,
          toolNames: ['end_turn'],
          initialAssistantMessage: '',
          initialAssistantPrefix: '',
          stepAssistantMessage: '',
          stepAssistantPrefix: '',
        },
      },
    }

    const result = await testService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(0)
    expect(result.templates).toHaveProperty('CodebuffAI/git-committer')
    expect(result.templates).toHaveProperty('spawner_agent')
    expect(result.templates.spawner_agent.spawnableAgents).toContain(
      'git-committer' // Normalized without prefix
    )
  })
})
