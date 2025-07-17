import { describe, it, expect, mock, beforeEach } from 'bun:test'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { DynamicAgentService } from '../templates/dynamic-agent-service'
import { getStubProjectFileContext } from '@codebuff/common/util/file'

// Mock logger to avoid console output during tests
mock.module('../util/logger', () => ({
  logger: {
    debug: () => {},
    warn: () => {},
    error: () => {},
  },
}))

describe('Dynamic Agent Schema Validation', () => {
  let service: DynamicAgentService
  let mockFileContext: ProjectFileContext

  beforeEach(() => {
    service = new DynamicAgentService()
    mockFileContext = getStubProjectFileContext()
  })

  describe('Valid JSON Schema Conversion', () => {
    it('should convert valid promptSchema to Zod', async () => {
      const fileContext = {
        ...mockFileContext,
        agentTemplates: {
          '.agents/templates/valid-prompt-schema.json': JSON.stringify({
            id: 'test_agent',
            version: '1.0.0',
            override: false,
            name: 'Test Agent',
            description: 'Test agent with valid prompt schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',
            promptSchema: {
              prompt: {
                type: 'string',
                description: 'A test prompt',
              },
            },
          }),
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('test_agent')
      expect(result.templates.test_agent.promptSchema.prompt).toBeDefined()

      // Test that the schema accepts strings
      const promptSchema = result.templates.test_agent.promptSchema.prompt!
      expect(promptSchema.safeParse('test string').success).toBe(true)
    })

    it('should convert valid paramsSchema to Zod', async () => {
      const fileContext = {
        ...mockFileContext,
        agentTemplates: {
          '.agents/templates/valid-params-schema.json': JSON.stringify({
            id: 'test_agent_params',
            version: '1.0.0',
            override: false,
            name: 'Test Agent with Params',
            description: 'Test agent with valid params schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',
            promptSchema: {
              params: {
                type: 'object',
                properties: {
                  temperature: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                  },
                  maxTokens: {
                    type: 'integer',
                    minimum: 1,
                  },
                },
                required: ['temperature'],
              },
            },
          }),
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('test_agent_params')
      expect(
        result.templates.test_agent_params.promptSchema.params
      ).toBeDefined()

      // Test that the params schema works correctly
      const paramsSchema =
        result.templates.test_agent_params.promptSchema.params!
      expect(
        paramsSchema.safeParse({ temperature: 0.7, maxTokens: 100 }).success
      ).toBe(true)
      expect(paramsSchema.safeParse({ temperature: 1.5 }).success).toBe(false) // Out of range
      expect(paramsSchema.safeParse({}).success).toBe(false) // Missing required field
    })

    it('should handle promptSchema that allows null', async () => {
      const fileContext = {
        ...mockFileContext,
        agentTemplates: {
          '.agents/templates/optional-prompt-schema.json': JSON.stringify({
            id: 'optional_prompt_agent',
            version: '1.0.0',
            override: false,
            name: 'Optional Prompt Agent',
            description: 'Test agent with optional prompt schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',
            promptSchema: {
              prompt: {
                anyOf: [{ type: 'string' }, { type: 'null' }],
                description: 'An optional prompt',
              },
            },
          }),
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(0)
      expect(result.templates).toHaveProperty('optional_prompt_agent')

      const promptSchema =
        result.templates.optional_prompt_agent.promptSchema.prompt!
      expect(promptSchema.safeParse('test string').success).toBe(true)
      expect(promptSchema.safeParse(null).success).toBe(true)
    })
  })

  describe('Invalid JSON Schema Validation Errors', () => {
    it('should return validation error for promptSchema that does not allow strings', async () => {
      const fileContext = {
        ...mockFileContext,
        agentTemplates: {
          '.agents/templates/number-only-prompt-schema.json': JSON.stringify({
            id: 'number_only_prompt_agent',
            version: '1.0.0',
            override: false,
            name: 'Number Only Prompt Agent',
            description: 'Test agent with number-only prompt schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',
            promptSchema: {
              prompt: {
                type: 'number',
                description: 'A numeric prompt (invalid for our use case)',
              },
            },
          }),
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(1)
      expect(result.validationErrors[0].filePath).toBe(
        '.agents/templates/number-only-prompt-schema.json'
      )
      expect(result.validationErrors[0].message).toContain(
        'Invalid promptSchema.prompt'
      )
      expect(result.validationErrors[0].message).toContain(
        'Schema must allow string or undefined values'
      )
      expect(result.validationErrors[0].message).toContain(
        'Please ensure your JSON schema accepts string types'
      )
    })

    it('should return validation error for array-only promptSchema', async () => {
      const fileContext = {
        ...mockFileContext,
        agentTemplates: {
          '.agents/templates/array-only-prompt-schema.json': JSON.stringify({
            id: 'array_only_prompt_agent',
            version: '1.0.0',
            override: false,
            name: 'Array Only Prompt Agent',
            description: 'Test agent with array-only prompt schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',
            promptSchema: {
              prompt: {
                type: 'array',
                items: { type: 'string' },
                description: 'An array prompt (invalid for our use case)',
              },
            },
          }),
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(1)
      expect(result.validationErrors[0].filePath).toBe(
        '.agents/templates/array-only-prompt-schema.json'
      )
      expect(result.validationErrors[0].message).toContain(
        'Invalid promptSchema.prompt'
      )
      expect(result.validationErrors[0].message).toContain(
        'Schema must allow string or undefined values'
      )
    })
  })

  describe('Default Schema Behavior', () => {
    it('should have no prompt schema when no promptSchema provided', async () => {
      const fileContext = {
        ...mockFileContext,
        agentTemplates: {
          '.agents/templates/no-prompt-schema.json': JSON.stringify({
            id: 'no_prompt_schema_agent',
            version: '1.0.0',
            override: false,
            name: 'No Prompt Schema Agent',
            description: 'Test agent without prompt schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',
            // No promptSchema or paramsSchema
          }),
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
      const fileContext = {
        ...mockFileContext,
        agentTemplates: {
          '.agents/templates/no-params-schema.json': JSON.stringify({
            id: 'no_params_schema_agent',
            version: '1.0.0',
            override: false,
            name: 'No Params Schema Agent',
            description: 'Test agent without params schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',
            // No paramsSchema
          }),
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
      const fileContext = {
        ...mockFileContext,
        agentTemplates: {
          '.agents/templates/both-schemas.json': JSON.stringify({
            id: 'both_schemas_agent',
            version: '1.0.0',
            override: false,
            name: 'Both Schemas Agent',
            description: 'Test agent with both schemas',
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
          }),
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
      const fileContext = {
        ...mockFileContext,
        agentTemplates: {
          '.agents/templates/complex-schema.json': JSON.stringify({
            id: 'complex_schema_agent',
            version: '1.0.0',
            override: false,
            name: 'Complex Schema Agent',
            description: 'Test agent with complex nested schema',
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
          }),
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
      const fileContext = {
        ...mockFileContext,
        agentTemplates: {
          '.agents/templates/error-context.json': JSON.stringify({
            id: 'error_context_agent',
            version: '1.0.0',
            override: false,
            name: 'Error Context Agent',
            description: 'Test agent for error context',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',
            promptSchema: {
              prompt: {
                type: 'boolean', // Invalid for prompt schema
              },
            },
          }),
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(1)
      expect(result.validationErrors[0].message).toContain(
        'in .agents/templates/error-context.json'
      )
      expect(result.validationErrors[0].filePath).toBe(
        '.agents/templates/error-context.json'
      )
    })

    it('should provide specific error details for schema validation failures', async () => {
      const fileContext = {
        ...mockFileContext,
        agentTemplates: {
          '.agents/templates/specific-error.json': JSON.stringify({
            id: 'specific_error_agent',
            version: '1.0.0',
            override: false,
            name: 'Specific Error Agent',
            description: 'Test agent for specific error details',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',
            promptSchema: {
              prompt: {
                type: 'array', // Invalid for prompt schema - should be string or allow undefined
              },
            },
          }),
        },
      }

      const result = await service.loadAgents(fileContext)

      expect(result.validationErrors).toHaveLength(1)
      const error = result.validationErrors[0]
      expect(error.message).toContain('Invalid promptSchema.prompt')
      expect(error.message).toContain(
        'Schema must allow string or undefined values'
      )
      expect(error.message).toContain(
        'Please ensure your JSON schema accepts string types'
      )
      expect(error.details).toBe(error.message)
    })
  })

  describe('Edge Cases', () => {
    it('should handle git-committer agent schema correctly', async () => {
      const fileContext = {
        ...mockFileContext,
        agentTemplates: {
          '.agents/templates/git-committer.json': JSON.stringify({
            id: 'CodebuffAI/git-committer',
            version: '0.0.1',
            override: false,
            name: 'Git Committer',
            description:
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
          }),
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
      const fileContext = {
        ...mockFileContext,
        agentTemplates: {
          '.agents/templates/empty-schema.json': JSON.stringify({
            id: 'empty_schema_agent',
            version: '1.0.0',
            override: false,
            name: 'Empty Schema Agent',
            description: 'Test agent with empty schema',
            model: 'anthropic/claude-4-sonnet-20250522',
            systemPrompt: 'Test system prompt',
            userInputPrompt: 'Test user prompt',
            agentStepPrompt: 'Test step prompt',
            promptSchema: {},
          }),
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
