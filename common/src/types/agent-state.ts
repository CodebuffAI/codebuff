import { z } from 'zod'
import { ProjectFileContextSchema } from '../util/file'

export const ToolCallSchema = z.object({
  // TODO: Fill this in
  type: z.enum(['read-files', 'write-file', 'run-terminal-command']),
  params: z.record(z.string(), z.string()),
})

export const ToolResultSchema = z.object({
  // TODO: Fill this in
  type: z.enum(['read-files', 'write-file', 'run-terminal-command']),
  result: z.string(),
})

export const AgentStateSchema = z.object({
  agentContext: z.string(),
  fileContext: ProjectFileContextSchema,
})
export type AgentState = z.infer<typeof AgentStateSchema>
