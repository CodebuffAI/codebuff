import { z } from 'zod'

import { ProjectFileContext, ProjectFileContextSchema } from '../util/file'
import { CodebuffMessage, CodebuffMessageSchema } from './message'

export const toolCallSchema = z.object({
  toolName: z.string(),
  args: z.record(z.string(), z.string()),
  toolCallId: z.string(),
})
export type ToolCall = z.infer<typeof toolCallSchema>

export const toolResultSchema = z.object({
  toolName: z.string(),
  toolCallId: z.string(),
  result: z.string(),
})
export type ToolResult = z.infer<typeof toolResultSchema>

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

export const AgentTemplateNameSchema = z.enum(['claude4base', 'experimental'])
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
