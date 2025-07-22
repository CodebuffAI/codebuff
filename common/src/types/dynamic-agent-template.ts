import { z } from 'zod'
import { ALLOWED_MODEL_PREFIXES, models } from '../constants'
import { toolNames } from '../constants/tools'

// Filter models to only include those that begin with allowed prefixes
const filteredModels = Object.values(models).filter((model) =>
  ALLOWED_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix))
)

if (filteredModels.length === 0) {
  throw new Error('No valid models found with allowed prefixes')
}

// JSON Schema for params - supports any valid JSON schema
const JsonSchemaSchema = z.record(z.any()).refine(
  (schema) => {
    // Basic validation that it looks like a JSON schema
    return typeof schema === 'object' && schema !== null
  },
  { message: 'Must be a valid JSON schema object' }
)

// Schema for the combined promptSchema object
const PromptSchemaObjectSchema = z
  .object({
    prompt: JsonSchemaSchema.optional(), // Optional JSON schema for prompt validation
    params: JsonSchemaSchema.optional(), // Optional JSON schema for params validation
  })
  .optional()

// Schema for prompt fields that can be either a string or a path reference
const PromptFieldSchema = z.union([
  z.string(), // Direct string content
  z.object({ path: z.string() }), // Path reference to external file
])
export type PromptField = z.infer<typeof PromptFieldSchema>

export const DynamicAgentConfigSchema = z.object({
  id: z.string(), // The unique identifier for this agent
  version: z.string(),
  override: z.literal(false).optional().default(false), // Must be false for new agents, defaults to false if missing

  // Required fields for new agents
  name: z.string(),
  purpose: z.string(),
  model: z.string(),
  outputMode: z
    .enum(['last_message', 'report', 'all_messages'])
    .default('last_message'),
  includeMessageHistory: z.boolean().default(true),
  toolNames: z
    .array(z.string())
    .default(['end_turn'])
    .refine(
      (tools) => {
        const validToolNames = toolNames as readonly string[]
        const invalidTools = tools.filter(
          (tool) => !validToolNames.includes(tool)
        )
        return invalidTools.length === 0
      },
      (tools) => {
        const validToolNames = toolNames as readonly string[]
        const invalidTools = tools.filter(
          (tool) => !validToolNames.includes(tool)
        )
        return {
          message: `Invalid tool names: ${invalidTools.join(', ')}. Available tools: ${toolNames.join(', ')}`,
        }
      }
    ),
  spawnableAgents: z.array(z.string()).default([]),
  promptSchema: PromptSchemaObjectSchema,
  parentInstructions: z.record(z.string(), z.string()).optional(),

  // Required prompts (only strings or path references)
  systemPrompt: PromptFieldSchema,
  userInputPrompt: PromptFieldSchema,
  agentStepPrompt: PromptFieldSchema,

  // Optional assistant messages (can be strings or path references)
  initialAssistantMessage: PromptFieldSchema.optional(),
  initialAssistantPrefix: PromptFieldSchema.optional(),
  stepAssistantMessage: PromptFieldSchema.optional(),
  stepAssistantPrefix: PromptFieldSchema.optional(),
})
export type DynamicAgentConfig = z.input<typeof DynamicAgentConfigSchema>
export type DynamicAgentConfigParsed = z.infer<typeof DynamicAgentConfigSchema>

export const DynamicAgentTemplateSchema = DynamicAgentConfigSchema.extend({
  systemPrompt: z.string(),
  userInputPrompt: z.string(),
  agentStepPrompt: z.string(),
  initialAssistantMessage: z.string(),
  initialAssistantPrefix: z.string(),
  stepAssistantMessage: z.string(),
  stepAssistantPrefix: z.string(),
})

export type DynamicAgentTemplate = z.infer<typeof DynamicAgentTemplateSchema>
