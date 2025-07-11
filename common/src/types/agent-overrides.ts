import { z } from 'zod'

import { ALLOWED_MODEL_PREFIXES, models } from '../constants'
import { toolNames } from '../constants/tools'
import { AgentTemplateTypes } from './session-state'
import { normalizeAgentName } from '../util/agent-name-normalization'

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

const ToolNamesOverrideSchema = z.object({
  type: z.enum(['append', 'replace']),
  content: z.union([z.string(), z.array(z.string())]),
}).refine(
  (override) => {
    const toolList = Array.isArray(override.content) ? override.content : [override.content]
    const validToolNames = toolNames as readonly string[]
    const invalidTools = toolList.filter(tool => !validToolNames.includes(tool))
    return invalidTools.length === 0
  },
  (override) => {
    const toolList = Array.isArray(override.content) ? override.content : [override.content]
    const validToolNames = toolNames as readonly string[]
    const invalidTools = toolList.filter(tool => !validToolNames.includes(tool))
    return {
      message: `Invalid tool names: ${invalidTools.join(', ')}. Available tools: ${toolNames.join(', ')}`
    }
  }
)

export const AgentOverrideConfigSchema = z.object({
  id: z.string().refine(
    (id) => {
      const normalizedId = normalizeAgentName(id)
      const availableAgentTypes = Object.values(AgentTemplateTypes)
      return availableAgentTypes.includes(normalizedId as any)
    },
    (id) => {
      const normalizedId = normalizeAgentName(id)
      const availableAgentTypes = Object.values(AgentTemplateTypes)
      return {
        message: `Invalid agent ID: "${id}" (normalized: "${normalizedId}"). Available agents: ${availableAgentTypes.join(', ')}`
      }
    }
  ), // e.g., "CodebuffAI/reviewer"
  version: z.string(), // e.g., "0.1.7" or "latest"
  override: z.literal(true), // Flag indicating this is an override
  model: z.enum(filteredModels as [string, ...string[]]).optional(),
  systemPrompt: PromptOverrideSchema.optional(),
  userInputPrompt: PromptOverrideSchema.optional(),
  agentStepPrompt: PromptOverrideSchema.optional(),
  spawnableAgents: ArrayOverrideSchema.optional(),
  toolNames: ToolNamesOverrideSchema.optional(),
})

export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>
export type PromptOverride = z.infer<typeof PromptOverrideSchema>
export type ArrayOverride = z.infer<typeof ArrayOverrideSchema>
