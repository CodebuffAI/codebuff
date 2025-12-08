import { describe, expect, it } from 'bun:test'

import {
  DynamicAgentDefinitionSchema,
  DynamicAgentTemplateSchema,
} from '../types/dynamic-agent-template'
import { AgentTemplateTypes } from '../types/session-state'

describe('DynamicAgentDefinitionSchema', () => {
  const validBaseTemplate = {
    id: 'test-agent',
    version: '1.0.0',
    displayName: 'Test Agent',
    spawnerPrompt: 'A test agent',
    model: 'anthropic/claude-4-sonnet-20250522',
    systemPrompt: 'Test system prompt',
    instructionsPrompt: 'Test user prompt',
    stepPrompt: 'Test step prompt',
  }

  describe('Valid Templates', () => {
    it('should validate minimal valid template', () => {
      const result = DynamicAgentDefinitionSchema.safeParse(validBaseTemplate)
      expect(result.success).toBe(true)
    })

    it('should validate template with inputSchema', () => {
      const template = {
        ...validBaseTemplate,
        inputSchema: {
          prompt: {
            type: 'string',
            description: 'A test prompt',
          },
        },
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should validate template with paramsSchema', () => {
      const template = {
        ...validBaseTemplate,
        inputSchema: {
          params: {
            type: 'object',
            properties: {
              temperature: {
                type: 'number',
                minimum: 0,
                maximum: 1,
              },
            },
          },
        },
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should validate template with both schemas', () => {
      const template = {
        ...validBaseTemplate,
        inputSchema: {
          prompt: {
            type: 'string',
            description: 'A test prompt',
          },
          params: {
            type: 'object',
            properties: {
              mode: { type: 'string', enum: ['fast', 'thorough'] },
            },
          },
        },
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should validate template with complex nested schemas', () => {
      const template = {
        ...validBaseTemplate,
        inputSchema: {
          params: {
            type: 'object',
            properties: {
              config: {
                type: 'object',
                properties: {
                  settings: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        key: { type: 'string' },
                        value: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should apply default values', () => {
      const result = DynamicAgentDefinitionSchema.safeParse(validBaseTemplate)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.outputMode).toBe('last_message')
        expect(result.data.includeMessageHistory).toBe(false)
        expect(result.data.toolNames).toEqual([])
        expect(result.data.spawnableAgents).toEqual([])
      }
    })

    it('should validate template with parentInstructions', () => {
      const template = {
        ...validBaseTemplate,
        parentInstructions: {
          researcher: 'Spawn when you need research',
          [AgentTemplateTypes.file_picker]: 'Spawn when you need files',
          base: 'Spawn for general tasks',
        },
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(true)
    })
  })

  describe('Invalid Templates', () => {
    it('should reject template with missing required fields', () => {
      const template = {
        id: 'test-agent',
        // Missing other required fields
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid outputMode', () => {
      const template = {
        ...validBaseTemplate,
        outputMode: 'invalid_mode',
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid inputSchema type', () => {
      const template = {
        ...validBaseTemplate,
        inputSchema: 'not an object',
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid paramsSchema type', () => {
      const template = {
        ...validBaseTemplate,
        inputSchema: { params: 'not an object' },
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with null schemas', () => {
      const template = {
        ...validBaseTemplate,
        inputSchema: null,
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid prompt field structure', () => {
      const template = {
        ...validBaseTemplate,
        systemPrompt: { invalidField: 'value' }, // Should be string only
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid agent ID format', () => {
      const invalidIds = [
        'Test_Agent', // uppercase and underscore
        'test agent', // space
        'test.agent', // dot
        'test@agent', // special character
        'Test-Agent', // uppercase
        '123_test', // underscore
        'test/agent', // slash
      ]

      invalidIds.forEach((id) => {
        const template = {
          ...validBaseTemplate,
          id,
        }

        const result = DynamicAgentDefinitionSchema.safeParse(template)
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error.issues[0].message).toContain(
            'lowercase letters, numbers, and hyphens',
          )
        }
      })
    })

    it('should accept template with valid agent ID format', () => {
      const validIds = [
        'test-agent',
        'test123',
        'agent-v2',
        'my-custom-agent-123',
        'a',
        '123',
        'test-agent-with-many-hyphens',
      ]

      validIds.forEach((id) => {
        const template = {
          ...validBaseTemplate,
          id,
        }

        const result = DynamicAgentDefinitionSchema.safeParse(template)
        expect(result.success).toBe(true)
      })
    })

    // Note: The validation that required set_output tool for structured_output mode was
    // intentionally disabled to allow handleSteps to use set_output while the LLM does not
    // have access to the set_output tool.
    it('should allow template with outputMode structured_output without set_output tool', () => {
      const template = {
        ...validBaseTemplate,
        outputMode: 'structured_output' as const,
        toolNames: ['end_turn', 'read_files'], // Missing set_output - now allowed
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should accept template with outputMode structured_output and set_output tool', () => {
      const template = {
        ...validBaseTemplate,
        outputMode: 'structured_output' as const,
        toolNames: ['end_turn', 'set_output'],
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    // Note: The validation that rejected set_output without structured_output mode was
    // intentionally disabled to allow parent agents to have set_output tool with 'last_message'
    // outputMode while their subagents use 'structured_output' (preserves prompt caching).
    it('should allow template with set_output tool and non-structured_output outputMode', () => {
      const template = {
        ...validBaseTemplate,
        outputMode: 'last_message' as const,
        toolNames: ['end_turn', 'set_output'], // set_output is now allowed with any outputMode
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should allow template with set_output tool and all_messages outputMode', () => {
      const template = {
        ...validBaseTemplate,
        outputMode: 'all_messages' as const,
        toolNames: ['end_turn', 'set_output'], // set_output is now allowed with any outputMode
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should reject template with non-empty spawnableAgents but missing spawn_agents tool', () => {
      const template = {
        ...validBaseTemplate,
        spawnableAgents: ['researcher', 'file-picker'], // Non-empty spawnableAgents
        toolNames: ['end_turn', 'read_files'], // Missing spawn_agents
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(false)
      if (!result.success) {
        const spawnAgentsError = result.error.issues.find((issue) =>
          issue.message.includes(
            "Non-empty spawnableAgents array requires the 'spawn_agents' tool",
          ),
        )
        expect(spawnAgentsError).toBeDefined()
        expect(spawnAgentsError?.message).toContain(
          "Non-empty spawnableAgents array requires the 'spawn_agents' tool",
        )
      }
    })

    it('should accept template with non-empty spawnableAgents and spawn_agents tool', () => {
      const template = {
        ...validBaseTemplate,
        spawnableAgents: ['researcher', 'file-picker'],
        toolNames: ['end_turn', 'spawn_agents'],
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should accept template with empty spawnableAgents and no spawn_agents tool', () => {
      const template = {
        ...validBaseTemplate,
        spawnableAgents: [], // Empty spawnableAgents
        toolNames: ['end_turn', 'read_files'], // No spawn_agents needed
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty schemas', () => {
      const template = {
        ...validBaseTemplate,
        inputSchema: {},
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should handle schemas with additional properties', () => {
      const template = {
        ...validBaseTemplate,
        inputSchema: {
          prompt: {
            type: 'string',
            description: 'A test prompt',
            customProperty: 'custom value',
            anotherProperty: { nested: 'object' },
          },
        },
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should handle very long schema definitions', () => {
      const largeSchema: any = {
        type: 'object',
        properties: {},
      }

      // Create a large schema with many properties
      for (let i = 0; i < 100; i++) {
        largeSchema.properties[`property${i}`] = {
          type: 'string',
          description: `Property ${i} description`,
        }
      }

      const template = {
        ...validBaseTemplate,
        inputSchema: {
          params: largeSchema,
        },
      }

      const result = DynamicAgentDefinitionSchema.safeParse(template)
      expect(result.success).toBe(true)
    })
  })
})
