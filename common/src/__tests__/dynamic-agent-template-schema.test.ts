import { describe, expect, it } from 'bun:test'
import { DynamicAgentTemplateSchema } from '../types/dynamic-agent-template'

describe('DynamicAgentTemplateSchema', () => {
  const validBaseTemplate = {
    id: 'test_agent',
    version: '1.0.0',
    override: false,
    name: 'Test Agent',
    description: 'A test agent',
    model: 'anthropic/claude-4-sonnet-20250522',
    systemPrompt: 'Test system prompt',
    userInputPrompt: 'Test user prompt',
    agentStepPrompt: 'Test step prompt',
  }

  describe('Valid Templates', () => {
    it('should validate minimal valid template', () => {
      const result = DynamicAgentTemplateSchema.safeParse(validBaseTemplate)
      expect(result.success).toBe(true)
    })

    it('should validate template with promptSchema', () => {
      const template = {
        ...validBaseTemplate,
        promptSchema: {
          prompt: {
            type: 'string',
            description: 'A test prompt',
          },
        },
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should validate template with paramsSchema', () => {
      const template = {
        ...validBaseTemplate,
        promptSchema: {
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

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should validate template with both schemas', () => {
      const template = {
        ...validBaseTemplate,
        promptSchema: {
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

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should validate template with complex nested schemas', () => {
      const template = {
        ...validBaseTemplate,
        promptSchema: {
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

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should validate template with path references', () => {
      const template = {
        ...validBaseTemplate,
        systemPrompt: { path: './system-prompt.md' },
        userInputPrompt: { path: './user-input-prompt.md' },
        agentStepPrompt: { path: './agent-step-prompt.md' },
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should apply default values', () => {
      const result = DynamicAgentTemplateSchema.safeParse(validBaseTemplate)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.outputMode).toBe('last_message')
        expect(result.data.includeMessageHistory).toBe(true)
        expect(result.data.toolNames).toEqual(['end_turn'])
        expect(result.data.spawnableAgents).toEqual([])
      }
    })
  })

  describe('Invalid Templates', () => {
    it('should reject template with missing required fields', () => {
      const template = {
        id: 'test_agent',
        // Missing other required fields
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with override: true', () => {
      const template = {
        ...validBaseTemplate,
        override: true,
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid model', () => {
      const template = {
        ...validBaseTemplate,
        model: 'invalid-model-name',
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid outputMode', () => {
      const template = {
        ...validBaseTemplate,
        outputMode: 'invalid_mode',
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid promptSchema type', () => {
      const template = {
        ...validBaseTemplate,
        promptSchema: 'not an object',
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid paramsSchema type', () => {
      const template = {
        ...validBaseTemplate,
        promptSchema: { params: 'not an object' },
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with null schemas', () => {
      const template = {
        ...validBaseTemplate,
        promptSchema: null,
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid prompt field structure', () => {
      const template = {
        ...validBaseTemplate,
        systemPrompt: { invalidField: 'value' }, // Should be { path: string }
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty schemas', () => {
      const template = {
        ...validBaseTemplate,
        promptSchema: {},
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should handle schemas with additional properties', () => {
      const template = {
        ...validBaseTemplate,
        promptSchema: {
          prompt: {
            type: 'string',
            description: 'A test prompt',
            customProperty: 'custom value',
            anotherProperty: { nested: 'object' },
          },
        },
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should handle very long schema definitions', () => {
      const largeSchema = {
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
        promptSchema: {
          params: largeSchema,
        },
      }

      const result = DynamicAgentTemplateSchema.safeParse(template)
      expect(result.success).toBe(true)
    })
  })
})
