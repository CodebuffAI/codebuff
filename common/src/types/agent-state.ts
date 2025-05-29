import { z } from 'zod'

import { coreMessageSchema } from 'ai'
import { ProjectFileContext, ProjectFileContextSchema } from '../util/file'

export const ToolCallSchema = z.object({
  name: z.string(),
  parameters: z.record(z.string(), z.string()),
  id: z.string(),
})
export type ToolCall = z.infer<typeof ToolCallSchema>
export const ToolResultSchema = z.object({
  name: z.string(),
  result: z.string(),
  id: z.string(),
})
export type ToolResult = z.infer<typeof ToolResultSchema>

export const AgentStateSchema = z.object({
  agentContext: z.string(),
  fileContext: ProjectFileContextSchema,
  messageHistory: z.array(coreMessageSchema),
  consecutiveAssistantMessages: z.number().optional(),
})
export type AgentState = z.infer<typeof AgentStateSchema>

export function getInitialAgentState(
  fileContext: ProjectFileContext
): AgentState {
  return {
    agentContext: '',
    messageHistory: [],
    fileContext,
    consecutiveAssistantMessages: 0,
  }
}
