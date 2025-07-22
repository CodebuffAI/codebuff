import { describe, expect, it } from 'bun:test'
import { DynamicAgentConfigSchema } from '../types/dynamic-agent-template'
import {
  validateParentInstructions,
  formatParentInstructionsError,
} from '../util/agent-template-validation'

describe('DynamicAgentConfigSchema', () => {
  const validBaseTemplate = {
    id: 'test_agent',
    version: '1.0.0',
    override: false,
    name: 'Test Agent',
    purpose: 'A test agent',
    model: 'anthropic/claude-4-sonnet-20250522',
    systemPrompt: 'Test system prompt',
    userInputPrompt: 'Test user prompt',
    agentStepPrompt: 'Test step prompt',
  }

  describe('Valid Templates', () => {
    it('should validate minimal valid template', () => {
      const result = DynamicAgentConfigSchema.safeParse(validBaseTemplate)
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

      const result = DynamicAgentConfigSchema.safeParse(template)
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

      const result = DynamicAgentConfigSchema.safeParse(template)
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

      const result = DynamicAgentConfigSchema.safeParse(template)
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

      const result = DynamicAgentConfigSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should validate template with path references', () => {
      const template = {
        ...validBaseTemplate,
        systemPrompt: { path: './system-prompt.md' },
        userInputPrompt: { path: './user-input-prompt.md' },
        agentStepPrompt: { path: './agent-step-prompt.md' },
      }

      const result = DynamicAgentConfigSchema.safeParse(template)
      expect(result.success).toBe(true)
    })

    it('should apply default values', () => {
      const result = DynamicAgentConfigSchema.safeParse(validBaseTemplate)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.outputMode).toBe('last_message')
        expect(result.data.includeMessageHistory).toBe(true)
        expect(result.data.toolNames).toEqual(['end_turn'])
        expect(result.data.spawnableAgents).toEqual([])
      }
    })

    it('should validate template with parentInstructions', () => {
      const template = {
        ...validBaseTemplate,
        parentInstructions: {
          researcher: 'Spawn when you need research',
          file_picker: 'Spawn when you need files',
          base: 'Spawn for general tasks',
        },
      }

      const result = DynamicAgentConfigSchema.safeParse(template)
      expect(result.success).toBe(true)
    })
  })

  describe('Invalid Templates', () => {
    it('should reject template with missing required fields', () => {
      const template = {
        id: 'test_agent',
        // Missing other required fields
      }

      const result = DynamicAgentConfigSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with override: true', () => {
      const template = {
        ...validBaseTemplate,
        override: true,
      }

      const result = DynamicAgentConfigSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid outputMode', () => {
      const template = {
        ...validBaseTemplate,
        outputMode: 'invalid_mode',
      }

      const result = DynamicAgentConfigSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid promptSchema type', () => {
      const template = {
        ...validBaseTemplate,
        promptSchema: 'not an object',
      }

      const result = DynamicAgentConfigSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid paramsSchema type', () => {
      const template = {
        ...validBaseTemplate,
        promptSchema: { params: 'not an object' },
      }

      const result = DynamicAgentConfigSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with null schemas', () => {
      const template = {
        ...validBaseTemplate,
        promptSchema: null,
      }

      const result = DynamicAgentConfigSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should reject template with invalid prompt field structure', () => {
      const template = {
        ...validBaseTemplate,
        systemPrompt: { invalidField: 'value' }, // Should be { path: string }
      }

      const result = DynamicAgentConfigSchema.safeParse(template)
      expect(result.success).toBe(false)
    })

    it('should accept template with any parentInstructions agent ID at schema level', () => {
      const template = {
        ...validBaseTemplate,
        parentInstructions: {
          invalid_agent_id: 'Some instruction',
          custom_agent: 'Another instruction',
        },
      }

      const result = DynamicAgentConfigSchema.safeParse(template)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.parentInstructions).toEqual({
          invalid_agent_id: 'Some instruction',
          custom_agent: 'Another instruction',
        })
      }
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty schemas', () => {
      const template = {
        ...validBaseTemplate,
        promptSchema: {},
      }

      const result = DynamicAgentConfigSchema.safeParse(template)
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

      const result = DynamicAgentConfigSchema.safeParse(template)
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
        promptSchema: {
          params: largeSchema,
        },
      }

      const result = DynamicAgentConfigSchema.safeParse(template)
      expect(result.success).toBe(true)
    })
  })

  describe('Parent Instructions Runtime Validation', () => {
    it('should validate parent instructions with valid agent IDs', () => {
      const parentInstructions = {
        researcher: 'Spawn when you need research',
        file_picker: 'Spawn when you need files',
        custom_agent: 'Spawn for custom tasks',
      }
      const dynamicAgentIds = ['custom_agent']

      const result = validateParentInstructions(
        parentInstructions,
        dynamicAgentIds
      )
      expect(result.valid).toBe(true)
      expect(result.invalidAgents).toEqual([])
    })

    it('should reject parent instructions with invalid agent IDs', () => {
      const parentInstructions = {
        researcher: 'Spawn when you need research',
        invalid_agent: 'Invalid instruction',
        another_invalid: 'Another invalid instruction',
      }
      const dynamicAgentIds = ['custom_agent']

      const result = validateParentInstructions(
        parentInstructions,
        dynamicAgentIds
      )
      expect(result.valid).toBe(false)
      expect(result.invalidAgents).toEqual(['invalid_agent', 'another_invalid'])
      expect(result.availableAgents).toContain('researcher')
      expect(result.availableAgents).toContain('custom_agent')
    })

    it('should format parent instructions error message correctly', () => {
      const invalidAgents = ['invalid_agent', 'another_invalid']
      const availableAgents = ['researcher', 'file_picker', 'custom_agent']

      const errorMessage = formatParentInstructionsError(
        invalidAgents,
        availableAgents
      )
      expect(errorMessage).toContain(
        'Invalid parent instruction agent IDs: invalid_agent, another_invalid'
      )
      expect(errorMessage).toContain(
        'Available agents: researcher, file_picker, custom_agent'
      )
    })
  })
})
