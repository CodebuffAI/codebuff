import { z } from 'zod'
import { ALLOWED_MODEL_PREFIXES, models } from '../constants'
import { toolNames } from '../tools/constants'
import { AgentConfig } from '../util/agent-config'

// Filter models to only include those that begin with allowed prefixes
const filteredModels = Object.values(models).filter((model) =>
  ALLOWED_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix))
)

if (filteredModels.length === 0) {
  throw new Error('No valid models found with allowed prefixes')
}

// Simplified JSON Schema definition - supports object schemas with nested properties
const JsonSchemaSchema: z.ZodType<any> = z.lazy(() =>
  z
    .object({
      type: z.literal('object'),
      description: z.string().optional(),
      properties: z
        .record(
          JsonSchemaSchema.or(
            z
              .object({
                type: z.enum([
                  'string',
                  'number',
                  'integer',
                  'boolean',
                  'array',
                ]),
                description: z.string().optional(),
                enum: z.array(z.any()).optional(),
              })
              .passthrough()
          )
        )
        .optional(),
      required: z.array(z.string()).optional(),
    })
    .passthrough()
)

// Schema for the combined inputSchema object
const InputSchemaObjectSchema = z
  .object({
    prompt: z
      .object({
        type: z.literal('string'),
        description: z.string().optional(),
      })
      .passthrough()
      .optional(), // Optional JSON schema for prompt validation
    params: JsonSchemaSchema.optional(), // Optional JSON schema for params validation
  })
  .optional()

// Schema for prompt fields that can be either a string or a path reference
const PromptFieldSchema = z.union([
  z.string(), // Direct string content
  z.object({ path: z.string() }), // Path reference to external file
])
export type PromptField = z.infer<typeof PromptFieldSchema>

// Schema for validating handleSteps function signature
const HandleStepsSchema = z
  .function()
  .args(
    z.object({
      agentState: z.object({
        agentId: z.string(),
        parentId: z.string(),
        messageHistory: z.array(z.any()),
      }),
      prompt: z.string().optional(),
      params: z.any().optional(),
    })
  )
  .returns(z.any())
  .optional()

// Validates the Typescript template file.
export const DynamicAgentConfigSchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-z0-9-]+$/,
      'Agent ID must contain only lowercase letters, numbers, and hyphens'
    ), // The unique identifier for this agent
  version: z.string().optional(),

  // Required fields for new agents
  displayName: z.string(),
  model: z.string(),

  // Tools and subagents
  toolNames: z
    .array(z.enum(toolNames))
    .optional()
    .default([])
    .refine(
      (tools) => {
        if (!tools) return true
        const validToolNames = toolNames as readonly string[]
        const invalidTools = tools.filter(
          (tool) => !validToolNames.includes(tool)
        )
        return invalidTools.length === 0
      },
      (tools) => {
        if (!tools) return { message: 'Tools array is undefined' }
        const validToolNames = toolNames as readonly string[]
        const invalidTools = tools.filter(
          (tool) => !validToolNames.includes(tool)
        )
        return {
          message: `Invalid tool names: ${invalidTools.join(', ')}. Available tools: ${toolNames.join(', ')}`,
        }
      }
    ),
  subagents: z.array(z.string()).optional().default([]),

  // Input and output
  inputSchema: InputSchemaObjectSchema,
  includeMessageHistory: z.boolean().default(true),
  outputMode: z
    .enum(['last_message', 'all_messages', 'json'])
    .default('last_message'), // Will be overridden to 'json' if outputSchema is present
  outputSchema: JsonSchemaSchema.optional(), // Optional JSON schema for output validation

  // Prompts
  parentPrompt: z.string().optional(),
  systemPrompt: z.string().optional(),
  instructionsPrompt: z.string().optional(),
  stepPrompt: z.string(),
  // NOTE: Removed from AgentConfig. If there's a need, can be added back or else removed entirely.
  parentInstructions: z.record(z.string(), z.string()).optional(),

  // Optional generator function for programmatic agents
  handleSteps: HandleStepsSchema,
})
export type DynamicAgentConfig = z.input<typeof DynamicAgentConfigSchema>
export type DynamicAgentConfigParsed = z.infer<typeof DynamicAgentConfigSchema>

// Checks that the AgentConfig and DynamicAgentConfig types are compatible
// NOTE TO LLM: Don't remove these lines!
const _typecheck: AgentConfig = {} as DynamicAgentConfig
const _typecheck2: DynamicAgentConfig = {} as AgentConfig

export const DynamicAgentTemplateSchema = DynamicAgentConfigSchema.extend({
  systemPrompt: z.string(),
  instructionsPrompt: z.string(),
  stepPrompt: z.string(),
  handleSteps: z.string().optional(), // Converted to string after processing
})
  .refine(
    (data) => {
      // If outputSchema is provided, outputMode must be 'json' or undefined (will default to 'json')
      if (data.outputSchema && data.outputMode && data.outputMode !== 'json') {
        return false
      }
      return true
    },
    {
      message:
        "outputSchema can only be used with outputMode 'json'. Remove outputMode or set it to 'json'.",
      path: ['outputMode'],
    }
  )
  .refine(
    (data) => {
      // If outputMode is 'json', 'set_output' tool must be included
      if (
        data.outputMode === 'json' &&
        !data.toolNames.includes('set_output')
      ) {
        return false
      }
      return true
    },
    {
      message:
        "outputMode 'json' requires the 'set_output' tool. Add 'set_output' to toolNames.",
      path: ['toolNames'],
    }
  )
export type DynamicAgentTemplate = z.infer<typeof DynamicAgentTemplateSchema>
