import { z } from 'zod/v4'

import { CodebuffMessageSchema } from './message'
import { ProjectFileContextSchema } from '../util/file'

import type { CodebuffMessage } from './message'
import type { ProjectFileContext } from '../util/file'
import { MAX_AGENT_STEPS_DEFAULT } from '../constants/agents'

export const toolCallSchema = z.object({
  toolName: z.string(),
  toolCallId: z.string(),
  input: z.record(z.string(), z.any()),
})
export type ToolCall = z.infer<typeof toolCallSchema>

export const toolResultSchema = z.object({
  toolName: z.string(),
  toolCallId: z.string(),
  output: z.object({
    type: z.literal('text'),
    value: z.string(),
  }),
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
  output?: Record<string, any>
  parentId?: string
}> = z.lazy(() =>
  z.object({
    agentId: z.string(),
    agentType: z.string().nullable(),
    agentContext: z.record(z.string(), subgoalSchema),
    subagents: AgentStateSchema.array(),
    messageHistory: CodebuffMessageSchema.array(),
    stepsRemaining: z.number(),
    output: z.record(z.string(), z.any()).optional(),
    parentId: z.string().optional(),
  }),
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
  'base_agent_builder',

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
  'agent_builder',
  'example_programmatic',
] as const
type UnderscoreToDash<S extends string> = S extends `${infer L}_${infer R}`
  ? `${L}-${UnderscoreToDash<R>}` // recurse on the remainder
  : S
export const AgentTemplateTypes = Object.fromEntries(
  AgentTemplateTypeList.map((name) => [name, name.replaceAll('_', '-')]),
) as { [K in (typeof AgentTemplateTypeList)[number]]: UnderscoreToDash<K> }
const agentTemplateTypeSchema = z.enum(AgentTemplateTypeList)
// Allow dynamic agent types by extending the base enum with string
export type AgentTemplateType =
  | z.infer<typeof agentTemplateTypeSchema>
  | (string & {})

export const SessionStateSchema = z.object({
  fileContext: ProjectFileContextSchema,
  mainAgentState: AgentStateSchema,
})
export type SessionState = z.infer<typeof SessionStateSchema>

export function getInitialSessionState(
  fileContext: ProjectFileContext,
): SessionState {
  return {
    mainAgentState: {
      agentId: 'main-agent',
      agentType: null,
      agentContext: {},
      subagents: [],
      messageHistory: [],
      stepsRemaining: MAX_AGENT_STEPS_DEFAULT,
      output: undefined,
    },
    fileContext,
  }
}
