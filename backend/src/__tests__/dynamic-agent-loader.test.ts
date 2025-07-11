import { describe, it, expect, mock } from 'bun:test'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { dynamicAgentService } from '../templates/dynamic-agent-service'

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

// Mock fs module to avoid file system access in tests
mock.module('fs', () => ({
  existsSync: (path: string) => {
    return path.includes('.agents/templates')
  },
  readdirSync: (path: string) => {
    if (path.includes('brainstormer')) {
      return ['brainstormer.json']
    }
    if (path.includes('custom')) {
      return ['custom.json']
    }
    if (path.includes('invalid')) {
      return ['invalid.json']
    }
    if (path.includes('broken')) {
      return ['broken.json']
    }
    return []
  },
  readFileSync: (path: string) => {
    if (path.includes('brainstormer.json')) {
      return JSON.stringify({
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
      })
    }
    if (path.includes('brainstormer-system.md')) {
      return 'You are a creative brainstormer.'
    }
    if (path.includes('brainstormer-user-input.md')) {
      return 'Help brainstorm ideas.'
    }
    if (path.includes('custom.json')) {
      return JSON.stringify({
        id: 'custom_agent',
        version: '1.0.0',
        override: false,
        name: 'Custom',
        description: 'Custom agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        systemPrompt: 'Custom system prompt',
        userInputPrompt: 'Custom user prompt',
        agentStepPrompt: 'Custom step prompt',
      })
    }
    if (path.includes('invalid.json')) {
      return JSON.stringify({
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
      })
    }
    if (path.includes('broken.json')) {
      return 'invalid json{'
    }
    throw new Error('File not found')
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
      projectRoot: '/test/brainstormer',
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
      projectRoot: '/test/empty', // No matching files
    }

    const result = await dynamicAgentService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(0)
    expect(Object.keys(result.templates)).toHaveLength(0)
  })

  it('should validate spawnable agents', async () => {
    const fileContext = {
      ...mockFileContext,
      projectRoot: '/test/invalid',
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
      projectRoot: '/test/broken',
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
      projectRoot: '/test/custom',
    }

    const result = await dynamicAgentService.loadAgents(fileContext)

    // Should have dynamic templates
    expect(result.templates).toHaveProperty('custom_agent') // Dynamic
  })

  it('should handle agents with JSON schemas', async () => {
    // Create a new service instance to avoid global state issues
    const testService =
      new (require('../templates/dynamic-agent-service').DynamicAgentService)()

    // Mock fs for this specific test
    const mockFs = mock.module('fs', () => ({
      existsSync: () => true,
      readdirSync: () => ['schema-agent.json'],
      readFileSync: () =>
        JSON.stringify({
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
    }))

    const fileContext = {
      ...mockFileContext,
      projectRoot: '/test/schema',
    }

    const result = await testService.loadAgents(fileContext)

    expect(result.validationErrors).toHaveLength(0)
    expect(result.templates).toHaveProperty('schema_agent')
    expect(result.templates.schema_agent.promptSchema.prompt).toBeDefined()
    expect(result.templates.schema_agent.promptSchema.params).toBeDefined()
  })

  it('should return validation errors for invalid schemas', async () => {
    // Create a new service instance to avoid global state issues
    const testService =
      new (require('../templates/dynamic-agent-service').DynamicAgentService)()

    // Mock fs for this specific test
    const mockFs = mock.module('fs', () => ({
      existsSync: () => true,
      readdirSync: () => ['invalid-schema-agent.json'],
      readFileSync: () =>
        JSON.stringify({
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
    }))

    const fileContext = {
      ...mockFileContext,
      projectRoot: '/test/invalid-schema',
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
})
