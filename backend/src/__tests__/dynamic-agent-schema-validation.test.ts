import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import {
  getStubProjectFileContext,
  ProjectFileContext,
} from '@codebuff/common/util/file'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { DynamicAgentService } from '../templates/dynamic-agent-service'

describe('Dynamic Agent Schema Validation', () => {
  let service: DynamicAgentService
  let mockFileContext: ProjectFileContext

  beforeAll(() => {
    // Mock logger to avoid console output during tests
    mockModule('@codebuff/backend/util/logger', () => ({
      logger: {
        debug: () => {},
        warn: () => {},
        error: () => {},
      },
    }))
  })

  beforeEach(() => {
    service = new DynamicAgentService()
    mockFileContext = getStubProjectFileContext()
  })

  afterAll(() => {
    clearMockedModules()
  })

  describe('Default Schema Behavior', () => {
    it('should have no prompt schema when no promptSchema provided', async () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'no-prompt-schema': {
            id: 'no_prompt_schema_agent',
            version: '1.0.0',
            override: false,
            name: 'No Prompt Schema Agent',
            purpose: 'Test agent without prompt schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',

            outputMode: 'last_message',
            includeMessageHistory: true,
            toolNames: ['end_turn'],
            spawnableAgents: [],
            // No promptSchema or paramsSchema
          },
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('no_prompt_schema_agent')
      expect(
        result.templates.no_prompt_schema_agent.promptSchema.prompt
      ).toBeUndefined()
    })

    it('should not have params schema when no paramsSchema provided', async () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'no-params-schema': {
            id: 'no_params_schema_agent',
            version: '1.0.0',
            override: false,
            name: 'No Params Schema Agent',
            purpose: 'Test agent without params schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',

            outputMode: 'last_message',
            includeMessageHistory: true,
            toolNames: ['end_turn'],
            spawnableAgents: [],
            // No paramsSchema
          },
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('no_params_schema_agent')
      expect(
        result.templates.no_params_schema_agent.promptSchema.params
      ).toBeUndefined()
    })
  })

  describe('Complex Schema Scenarios', () => {
    it('should handle both promptSchema and paramsSchema together', async () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'both-schemas': {
            id: 'both_schemas_agent',
            version: '1.0.0',
            override: false,
            name: 'Both Schemas Agent',
            purpose: 'Test agent with both schemas',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',

            promptSchema: {
              prompt: {
                type: 'string',
                minLength: 1,
                description: 'A required prompt',
              },
              params: {
                type: 'object',
                properties: {
                  mode: {
                    type: 'string',
                    enum: ['fast', 'thorough'],
                  },
                  iterations: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 10,
                    default: 3,
                  },
                },
                required: ['mode'],
              },
            },
            spawnableAgents: [],
            outputMode: 'last_message',
            includeMessageHistory: true,
            toolNames: ['end_turn'],
          },
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('both_schemas_agent')

      const template = result.templates.both_schemas_agent
      expect(template.promptSchema.prompt).toBeDefined()
      expect(template.promptSchema.params).toBeDefined()

      const promptSchema = template.promptSchema.prompt!
      const paramsSchema = template.promptSchema.params!

      // Test prompt schema
      expect(promptSchema.safeParse('valid prompt').success).toBe(true)
      expect(promptSchema.safeParse('').success).toBe(false) // Too short

      // Test params schema
      expect(
        paramsSchema.safeParse({ mode: 'fast', iterations: 5 }).success
      ).toBe(true)
      expect(paramsSchema.safeParse({ mode: 'invalid' }).success).toBe(false) // Invalid enum
      expect(paramsSchema.safeParse({ iterations: 5 }).success).toBe(false) // Missing required field
    })

    it('should handle schema with nested objects and arrays', async () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'complex-schema': {
            id: 'complex_schema_agent',
            version: '1.0.0',
            override: false,
            name: 'Complex Schema Agent',
            purpose: 'Test agent with complex nested schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',

            promptSchema: {
              params: {
                type: 'object',
                properties: {
                  config: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      settings: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            key: { type: 'string' },
                            value: { type: 'string' },
                          },
                          required: ['key', 'value'],
                        },
                      },
                    },
                    required: ['name'],
                  },
                },
                required: ['config'],
              },
            },
            outputMode: 'last_message',
            includeMessageHistory: true,
            toolNames: ['end_turn'],
            spawnableAgents: [],
          },
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('complex_schema_agent')

      const paramsSchema =
        result.templates.complex_schema_agent.promptSchema.params!

      // Test valid complex object
      const validParams = {
        config: {
          name: 'test config',
          settings: [
            { key: 'setting1', value: 'value1' },
            { key: 'setting2', value: 'value2' },
          ],
        },
      }
      expect(paramsSchema.safeParse(validParams).success).toBe(true)

      // Test invalid nested structure
      const invalidParams = {
        config: {
          name: 'test config',
          settings: [
            { key: 'setting1' }, // Missing required 'value' field
          ],
        },
      }
      expect(paramsSchema.safeParse(invalidParams).success).toBe(false)
    })
  })

  describe('Error Message Quality', () => {
    it('should include file path in error messages', async () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'error-context': {
            id: 'error_context_agent',
            version: '1.0.0',
            override: false,
            name: 'Error Context Agent',
            purpose: 'Test agent for error context',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',

            promptSchema: {
              prompt: {
                type: 'boolean', // Invalid for prompt schema
              },
            },
            outputMode: 'last_message',
            includeMessageHistory: true,
            toolNames: ['end_turn'],
            spawnableAgents: [],
          },
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(1)
      expect(result.validationErrors[0].message).toContain('in error-context')
      expect(result.validationErrors[0].filePath).toBe('error-context')
    })
  })

  describe('Edge Cases', () => {
    it('should handle git-committer agent schema correctly', async () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'git-committer': {
            id: 'CodebuffAI/git-committer',
            version: '0.0.1',
            override: false,
            name: 'Git Committer',
            purpose:
              'A git committer agent specialized to commit current changes with an appropriate commit message.',
            model: 'google/gemini-2.5-pro',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',
            promptSchema: {
              prompt: {
                type: 'string',
                description: 'What changes to commit',
              },
              params: {
                type: 'object',
                properties: {
                  message: {
                    type: 'string',
                  },
                },
                required: ['message'],
              },
            },

            outputMode: 'last_message',
            includeMessageHistory: true,
            toolNames: ['end_turn'],
            spawnableAgents: [],
          },
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('CodebuffAI/git-committer')

      const template = result.templates['CodebuffAI/git-committer']
      expect(template.promptSchema.params).toBeDefined()

      // Test that the params schema properly validates the message property
      const paramsSchema = template.promptSchema.params!

      // This should succeed with a message property
      const validResult = paramsSchema.safeParse({
        message: 'test commit message',
      })
      expect(validResult.success).toBe(true)

      // This should fail without the required message property
      const invalidResult = paramsSchema.safeParse({})
      expect(invalidResult.success).toBe(false)
    })

    it('should handle empty promptSchema object', async () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'empty-schema': {
            id: 'empty_schema_agent',
            version: '1.0.0',
            override: false,
            name: 'Empty Schema Agent',
            purpose: 'Test agent with empty schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',
            promptSchema: {},

            outputMode: 'last_message',
            includeMessageHistory: true,
            toolNames: ['end_turn'],
            spawnableAgents: [],
          },
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('empty_schema_agent')

      // Empty schemas should have no prompt schema
      expect(
        result.templates.empty_schema_agent.promptSchema.prompt
      ).toBeUndefined()
    })
  })
})
