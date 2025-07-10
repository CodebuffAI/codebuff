import { z } from 'zod'

import { models, ALLOWED_MODEL_PREFIXES } from '../constants'

// Filter models to only include those that begin with 'anthropic', 'openai', or 'google'
const filteredModels = Object.values(models).filter((model) =>
  ALLOWED_MODEL_PREFIXES.some((prefix) => model.startsWith(prefix))
)

// Ensure we have at least one model for the enum
if (filteredModels.length === 0) {
  throw new Error('No valid models found with allowed prefixes')
}

const PromptOverrideSchema = z.object({
  type: z.enum(['append', 'prepend', 'replace']),
  path: z.string().optional(),
  content: z.string().optional(),
})

const ArrayOverrideSchema = z.object({
  type: z.enum(['append', 'replace']),
  content: z.union([z.string(), z.array(z.string())]),
})

export const AgentOverrideConfigSchema = z.object({
  type: z.string(), // e.g., "CodebuffAI/reviewer"
  version: z.string(), // e.g., "0.1.7" or "latest"
  override: z.literal(true), // Flag indicating this is an override
  model: z.enum(filteredModels as [string, ...string[]]).optional(),
  systemPrompt: PromptOverrideSchema.optional(),
  userInputPrompt: PromptOverrideSchema.optional(),
  agentStepPrompt: PromptOverrideSchema.optional(),
  spawnableAgents: ArrayOverrideSchema.optional(),
  toolNames: ArrayOverrideSchema.optional(),
})

export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>
export type PromptOverride = z.infer<typeof PromptOverrideSchema>
export type ArrayOverride = z.infer<typeof ArrayOverrideSchema>
