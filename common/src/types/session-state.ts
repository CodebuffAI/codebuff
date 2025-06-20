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
  agentType: AgentTemplateType
  subagents: SubagentState[]
  messageHistory: CodebuffMessage[]
  stepsRemaining: number
}> = z.lazy(() =>
  z.object({
    agentId: z.string(),
    agentType: agentTemplateTypeSchema,
    subagents: SubagentStateSchema.array(),
    messageHistory: CodebuffMessageSchema.array(),
    stepsRemaining: z.number(),
  })
)
export type SubagentState = z.infer<typeof SubagentStateSchema>

const AgentTemplateTypeList = [
  'claude4_base',
  'gemini25pro_base',
  'gemini25flash_base',

  'gemini25pro_thinking',
] as const
export const AgentTemplateTypes = Object.fromEntries(
  AgentTemplateTypeList.map((name) => [name, name])
) as { [K in (typeof AgentTemplateTypeList)[number]]: K }
const agentTemplateTypeSchema = z.enum(AgentTemplateTypeList)
export type AgentTemplateType = z.infer<typeof agentTemplateTypeSchema>

export const SessionStateSchema = z.object({
  agentContext: z.string(),
  fileContext: ProjectFileContextSchema,
  messageHistory: CodebuffMessageSchema.array(),
  mainAgent: SubagentStateSchema.optional(),
  agentStepsRemaining: z.number(),
})
export type SessionState = z.infer<typeof SessionStateSchema>

export function getInitialSessionState(
  fileContext: ProjectFileContext
): SessionState {
  return {
    agentContext: '',
    messageHistory: [],
    mainAgent: undefined,
    fileContext,
    agentStepsRemaining: 12,
  }
}
