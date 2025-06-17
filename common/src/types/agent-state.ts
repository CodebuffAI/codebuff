import { z } from 'zod'

import { ProjectFileContext, ProjectFileContextSchema } from '../util/file'
import { CodebuffMessage, CodebuffMessageSchema } from './message'

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

export const SubagentStateSchema: z.ZodType<{
  agentId: string
  agentName: AgentTemplateName
  agents: SubagentState[]
  messageHistory: CodebuffMessage[]
}> = z.lazy(() =>
  z.object({
    agentId: z.string(),
    agentName: AgentTemplateNameSchema,
    agents: SubagentStateSchema.array(),
    messageHistory: CodebuffMessageSchema.array(),
  })
)
export type SubagentState = z.infer<typeof SubagentStateSchema>

export const AgentTemplateNameSchema = z.enum(['PLACEHOLDER'])
export type AgentTemplateName = z.infer<typeof AgentTemplateNameSchema>

export const AgentStateSchema = z.object({
  agentContext: z.string(),
  fileContext: ProjectFileContextSchema,
  messageHistory: z.array(CodebuffMessageSchema),
  agents: SubagentStateSchema.array().default([]),
  agentStepsRemaining: z.number(),
})
export type AgentState = z.infer<typeof AgentStateSchema>

export function getInitialAgentState(
  fileContext: ProjectFileContext
): AgentState {
  return {
    agentContext: '',
    messageHistory: [],
    agents: [],
    fileContext,
    agentStepsRemaining: 12,
  }
}
