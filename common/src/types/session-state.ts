import { z } from 'zod'

import { ProjectFileContext, ProjectFileContextSchema } from '../util/file'
import { CodebuffMessage, CodebuffMessageSchema } from './message'

export const toolCallSchema = z.object({
  toolName: z.string(),
  args: z.record(z.string(), z.any()),
  toolCallId: z.string(),
})
export type ToolCall = z.infer<typeof toolCallSchema>

export const toolResultSchema = z.object({
  toolName: z.string(),
  toolCallId: z.string(),
  result: z.string(),
})
export type ToolResult = z.infer<typeof toolResultSchema>

export const AgentStateSchema: z.ZodType<{
  agentId: string
  agentType: AgentTemplateType | null
  agentContext: string
  subagents: AgentState[]
  messageHistory: CodebuffMessage[]
  stepsRemaining: number
}> = z.lazy(() =>
  z.object({
    agentId: z.string(),
    agentType: agentTemplateTypeSchema.nullable(),
    agentContext: z.string(),
    subagents: AgentStateSchema.array(),
    messageHistory: CodebuffMessageSchema.array(),
    stepsRemaining: z.number(),
  })
)
export type AgentState = z.infer<typeof AgentStateSchema>

const AgentTemplateTypeList = [
  'claude4_base',
  'gemini25pro_base',
  'gemini25flash_base',

  'gemini25pro_thinking',

  'gemini25pro_readonly',
] as const
export const AgentTemplateTypes = Object.fromEntries(
  AgentTemplateTypeList.map((name) => [name, name])
) as { [K in (typeof AgentTemplateTypeList)[number]]: K }
const agentTemplateTypeSchema = z.enum(AgentTemplateTypeList)
export type AgentTemplateType = z.infer<typeof agentTemplateTypeSchema>

export const SessionStateSchema = z.object({
  fileContext: ProjectFileContextSchema,
  mainAgentState: AgentStateSchema,
})
export type SessionState = z.infer<typeof SessionStateSchema>

export function getInitialSessionState(
  fileContext: ProjectFileContext
): SessionState {
  return {
    mainAgentState: {
      agentId: 'main-agent',
      agentType: null,
      agentContext: '',
      subagents: [],
      messageHistory: [],
      stepsRemaining: 12,
    },
    fileContext,
  }
}
