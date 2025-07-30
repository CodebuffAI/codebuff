import {
  clearMockedModules,
  mockModule,
} from '../testing/mock-modules'
import {
  getStubProjectFileContext,
  ProjectFileContext,
} from '../util/file'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { DynamicAgentService } from '../templates/dynamic-agent-service'

describe('Dynamic Agent Schema Validation', () => {
  let service: DynamicAgentService
  let mockFileContext: ProjectFileContext

  beforeAll(() => {
    // Mock logger to avoid console output during tests
    mockModule('../util/logger', () => ({
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
    it('should have no prompt schema when no inputSchema provided', async () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'no-prompt-schema.ts': {
            id: 'no_prompt_schema_agent',
            version: '1.0.0',
            displayName: 'No Prompt Schema Agent',
            parentPrompt: 'Test agent without prompt schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            instructionsPrompt: 'Test user prompt',
            stepPrompt: 'Test step prompt',

            outputMode: 'last_message',
            includeMessageHistory: true,
            toolNames: ['end_turn'],
            subagents: [],
            // No inputSchema
          },
        },
      }

      const result = await service.loadAgents(fileContext.agentTemplates || {})

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('no_prompt_schema_agent')
      expect(
        result.templates.no_prompt_schema_agent.inputSchema.prompt
      ).toBeUndefined()
    })

    it('should not have params schema when no paramsSchema provided', async () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'no-params-schema.ts': {
            id: 'no_params_schema_agent',
            version: '1.0.0',
            displayName: 'No Params Schema Agent',
            parentPrompt: 'Test agent without params schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            instructionsPrompt: 'Test user prompt',
            stepPrompt: 'Test step prompt',

            outputMode: 'last_message',
            includeMessageHistory: true,
            toolNames: ['end_turn'],
            subagents: [],
            // No paramsSchema
          },
        },
      }

      const result = await service.loadAgents(fileContext.agentTemplates || {})

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('no_params_schema_agent')
      expect(
        result.templates.no_params_schema_agent.inputSchema.params
      ).toBeUndefined()
    })
  })

  describe('Complex Schema Scenarios', () => {
    it('should handle both inputSchema prompt and params together', async () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'both-schemas.ts': {
            id: 'both_schemas_agent',
            version: '1.0.0',
            displayName: 'Both Schemas Agent',
            parentPrompt: 'Test agent with both schemas',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            instructionsPrompt: 'Test user prompt',
            stepPrompt: 'Test step prompt',

            inputSchema: {
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
            subagents: [],
            outputMode: 'last_message',
            includeMessageHistory: true,
            toolNames: ['end_turn'],
          },
        },
      }

      const result = await service.loadAgents(fileContext.agentTemplates || {})

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('both_schemas_agent')

      const template = result.templates.both_schemas_agent
      expect(template.inputSchema.prompt).toBeDefined()
      expect(template.inputSchema.params).toBeDefined()

      const inputPromptSchema = template.inputSchema.prompt!
      const paramsSchema = template.inputSchema.params!

      // Test prompt schema
      expect(inputPromptSchema.safeParse('valid prompt').success).toBe(true)
      expect(inputPromptSchema.safeParse('').success).toBe(false) // Too short

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
          'complex-schema.ts': {
            id: 'complex_schema_agent',
            version: '1.0.0',
            displayName: 'Complex Schema Agent',
            parentPrompt: 'Test agent with complex nested schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            instructionsPrompt: 'Test user prompt',
            stepPrompt: 'Test step prompt',

            inputSchema: {
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
            subagents: [],
          },
        },
      }

      const result = await service.loadAgents(fileContext.agentTemplates || {})

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('complex_schema_agent')

      const paramsSchema =
        result.templates.complex_schema_agent.inputSchema.params!

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
          'error-context.ts': {
            id: 'error_context_agent',
            version: '1.0.0',
            displayName: 'Error Context Agent',
            parentPrompt: 'Test agent for error context',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            instructionsPrompt: 'Test user prompt',
            stepPrompt: 'Test step prompt',

            inputSchema: {
              prompt: {
                type: 'boolean' as any, // Invalid for prompt schema
              },
            },
            outputMode: 'last_message',
            includeMessageHistory: true,
            toolNames: ['end_turn'],
            subagents: [],
          },
        },
      }

      const result = await service.loadAgents(fileContext.agentTemplates || {})

      expect(result.validationErrors).toHaveLength(1)
      expect(result.validationErrors[0].message).toContain('in error-context')
      expect(result.validationErrors[0].filePath).toBe('error-context.ts')
    })
  })

  describe('Edge Cases', () => {
    it('should handle git-committer agent schema correctly', async () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'git-committer.ts': {
            id: 'CodebuffAI/git-committer',
            version: '0.0.1',
            displayName: 'Git Committer',
            parentPrompt:
              'A git committer agent specialized to commit current changes with an appropriate commit message.',
            model: 'google/gemini-2.5-pro',
            systemPrompt: 'Test system prompt',
            instructionsPrompt: 'Test user prompt',
            stepPrompt: 'Test step prompt',
            inputSchema: {
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
            subagents: [],
          },
        },
      }

      const result = await service.loadAgents(fileContext.agentTemplates || {})

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('CodebuffAI/git-committer')

      const template = result.templates['CodebuffAI/git-committer']
      const paramsSchema = template.inputSchema.params!

      expect(paramsSchema.safeParse('').success).toBe(false) // Too short
      expect(template.inputSchema.params).toBeDefined()
      // Test that the params schema properly validates the message property
      // This should succeed with a message property
      const validResult = paramsSchema.safeParse({
        message: 'test commit message',
      })
      expect(validResult.success).toBe(true)

      // This should fail without the required message property
      const invalidResult = paramsSchema.safeParse({})
      expect(invalidResult.success).toBe(false)
    })

    it('should handle empty inputSchema object', async () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'empty-schema.ts': {
            id: 'empty_schema_agent',
            version: '1.0.0',

            displayName: 'Empty Schema Agent',
            parentPrompt: 'Test agent with empty schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            instructionsPrompt: 'Test user prompt',
            stepPrompt: 'Test step prompt',
            inputSchema: {},

            outputMode: 'last_message',
            includeMessageHistory: true,
            toolNames: ['end_turn'],
            subagents: [],
          },
        },
      }

      const result = await service.loadAgents(fileContext.agentTemplates || {})

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('empty_schema_agent')

      // Empty schemas should have no prompt schema
      expect(
        result.templates.empty_schema_agent.inputSchema.prompt
      ).toBeUndefined()
    })
  })
})