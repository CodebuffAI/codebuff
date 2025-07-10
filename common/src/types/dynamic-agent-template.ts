import { z } from 'zod'
import { models, ALLOWED_MODEL_PREFIXES } from '../constants'
import { AgentTemplateTypes } from './session-state'

// Filter models to only include those that begin with allowed prefixes
const filteredModels = Object.values(models).filter((model) =>
  ALLOWED_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix))
)

if (filteredModels.length === 0) {
  throw new Error('No valid models found with allowed prefixes')
}

const PromptSchemaFieldSchema = z.object({
  type: z.string(),
  description: z.string(),
})

const PromptSchemaSchema = z.record(z.string(), PromptSchemaFieldSchema)

// Schema for prompt fields that can be either a string or a path reference
const PromptFieldSchema = z.union([
  z.string(), // Direct string content
  z.object({ path: z.string() }) // Path reference to external file
])

export const DynamicAgentTemplateSchema = z.object({
  type: z.string(), // The unique identifier for this agent
  version: z.string(),
  override: z.literal(false), // Must be false for new agents
  
  // Required fields for new agents
  name: z.string(),
  description: z.string(),
  model: z.enum(filteredModels as [string, ...string[]]),
  outputMode: z.enum(['last_message', 'report', 'all_messages']).default('last_message'),
  includeMessageHistory: z.boolean().default(true),
  toolNames: z.array(z.string()).default(['end_turn']),
  stopSequences: z.array(z.string()).default([]),
  spawnableAgents: z.array(z.string()).default([]),
  promptSchema: PromptSchemaSchema.optional(),

  // Required prompts (can be strings or path references)
  systemPrompt: PromptFieldSchema,
  userInputPrompt: PromptFieldSchema,
  agentStepPrompt: PromptFieldSchema,

  // Optional assistant messages (can be strings or path references)
  initialAssistantMessage: PromptFieldSchema.optional(),
  initialAssistantPrefix: PromptFieldSchema.optional(),
  stepAssistantMessage: PromptFieldSchema.optional(),
  stepAssistantPrefix: PromptFieldSchema.optional(),
})

export type DynamicAgentTemplate = z.infer<typeof DynamicAgentTemplateSchema>

/**
 * Validates that spawnable agents reference valid agent types
 */
export function validateSpawnableAgents(
  spawnableAgents: string[],
  availableAgentTypes: string[]
): { valid: boolean; invalidAgents: string[] } {
  const invalidAgents = spawnableAgents.filter(
    (agent) => !availableAgentTypes.includes(agent)
  )
  
  return {
    valid: invalidAgents.length === 0,
    invalidAgents,
  }
}
