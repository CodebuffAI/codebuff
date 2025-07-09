import { z } from 'zod'
import { models } from '../constants'

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
  override: z.object({
    type: z.string(), // e.g., "CodebuffAI/reviewer"
    version: z.string(), // e.g., "0.1.7" or "latest"
    model: z.enum(Object.values(models) as [string, ...string[]]).optional(),
    systemPrompt: PromptOverrideSchema.optional(),
    userInputPrompt: PromptOverrideSchema.optional(),
    agentStepPrompt: PromptOverrideSchema.optional(),
    spawnableAgents: ArrayOverrideSchema.optional(),
    toolNames: ArrayOverrideSchema.optional(),
  }),
})

export type AgentOverrideConfig = z.infer<typeof AgentOverrideConfigSchema>
export type PromptOverride = z.infer<typeof PromptOverrideSchema>
export type ArrayOverride = z.infer<typeof ArrayOverrideSchema>
