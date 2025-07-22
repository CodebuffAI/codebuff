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

export const subgoalSchema = z.object({
  objective: z.string().optional(),
  status: z
    .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'ABORTED'])
    .optional(),
  plan: z.string().optional(),
  logs: z.string().array(),
})
export type Subgoal = z.infer<typeof subgoalSchema>

export const AgentStateSchema: z.ZodType<{
  agentId: string
  agentType: AgentTemplateType | null
  agentContext: Record<string, Subgoal>
  subagents: AgentState[]
  messageHistory: CodebuffMessage[]
  stepsRemaining: number
  report: Record<string, any>
  parentId?: string
}> = z.lazy(() =>
  z.object({
    agentId: z.string(),
    agentType: z.string().nullable(),
    agentContext: z.record(z.string(), subgoalSchema),
    subagents: AgentStateSchema.array(),
    messageHistory: CodebuffMessageSchema.array(),
    stepsRemaining: z.number(),
    report: z.record(z.string(), z.any()),
    parentId: z.string().optional(),
  })
)
export type AgentState = z.infer<typeof AgentStateSchema>

export const AgentTemplateTypeList = [
  // Base agents
  'base',
  'base_lite',
  'base_max',
  'base_experimental',
  'claude4_gemini_thinking',
  'superagent',

  // Ask mode
  'ask',

  // Planning / Thinking
  'planner',
  'dry_run',
  'thinker',

  // Other agents
  'file_picker',
  'file_explorer',
  'researcher',
  'reviewer',
  'sonnet4_agent_builder',
  'example_programmatic',
] as const
export const AgentTemplateTypes = Object.fromEntries(
  AgentTemplateTypeList.map((name) => [name, name])
) as { [K in (typeof AgentTemplateTypeList)[number]]: K }
const agentTemplateTypeSchema = z.enum(AgentTemplateTypeList)
// Allow dynamic agent types by extending the base enum with string
export type AgentTemplateType = z.infer<typeof agentTemplateTypeSchema> | string

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
      agentContext: {},
      subagents: [],
      messageHistory: [],
      stepsRemaining: 12,
      report: {},
    },
    fileContext,
  }
}
