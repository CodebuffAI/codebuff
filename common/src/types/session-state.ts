import { z } from 'zod/v4'

import { MAX_AGENT_STEPS_DEFAULT } from '../constants/agents'

import type { Message } from './messages/codebuff-message'
import type { ProjectFileContext } from '../util/file'

export const toolCallSchema = z.object({
  toolName: z.string(),
  toolCallId: z.string(),
  input: z.record(z.string(), z.any()),
})
export type ToolCall = z.infer<typeof toolCallSchema>

export const subgoalSchema = z.object({
  objective: z.string().optional(),
  status: z
    .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'ABORTED'])
    .optional(),
  plan: z.string().optional(),
  logs: z.string().array(),
})
export type Subgoal = z.infer<typeof subgoalSchema>

export type AgentState = {
  /**
   * @deprecated agentId is replaced by runId
   */
  agentId: string
  agentType: AgentTemplateType | null
  agentContext: Record<string, Subgoal>
  ancestorRunIds: string[]
  runId?: string
  subagents: AgentState[]
  childRunIds: string[]
  messageHistory: Message[]
  stepsRemaining: number
  creditsUsed: number
  directCreditsUsed: number
  output?: Record<string, any>
  parentId?: string
  systemPrompt: string
  toolDefinitions: Record<
    string,
    { description: string | undefined; inputSchema: {} }
  >
  /**
   * The accurate token count from the Anthropic API.
   * This is updated on every agent step via the /api/v1/token-count endpoint.
   */
  contextTokenCount: number
  /**
   * Cross-turn read authorization registry for the strict read-before-edit
   * gate. Each entry is a path that the agent has read (or successfully
   * written) at least once during this run, granting a sticky read auth
   * that lets subsequent edits on the same path proceed without a redundant
   * read_files round-trip. Survives across LLM turns because it lives on
   * agentState rather than on the per-turn fileProcessingState, which is
   * recreated on every processStream / runProgrammaticStep invocation.
   *
   * NOTE: this map grows monotonically for the lifetime of a single
   * agentState. It is bounded by the number of distinct paths the agent
   * touches, which in practice stays small. A long-lived agent that
   * processes many unrelated files in one run could accumulate a non-trivial
   * number of entries, but each entry is just a `true` literal so the memory
   * footprint is negligible compared to the rest of agentState. No eviction
   * is implemented; if that ever becomes a concern, the right place to add
   * one is `getInitialAgentState` (reset) and the write-back in
   * stream-parser.ts / run-programmatic-step.ts (cap or LRU).
   */
  readAuthorizationsByPath?: Record<string, true>
}

export const AgentOutputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('structuredOutput'),
    value: z.record(z.string(), z.any()).or(z.null()),
  }),
  z.object({
    type: z.literal('lastMessage'),
    value: z.array(z.any()), // Array of assistant and tool messages from the last turn, including tool results
  }),
  z.object({
    type: z.literal('allMessages'),
    value: z.array(z.any()),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    statusCode: z.number().optional(),
    error: z.string().optional(),
    countryCode: z.string().optional(),
    countryBlockReason: z.string().optional(),
    ipPrivacySignals: z.array(z.string()).optional(),
  }),
])
export type AgentOutput = z.infer<typeof AgentOutputSchema>

export const AgentTemplateTypeList = [
  // Base agents
  'base',
  'base_free',
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

export type SessionState = {
  fileContext: ProjectFileContext
  mainAgentState: AgentState
}

export function getInitialAgentState(): AgentState {
  return {
    agentId: 'main-agent',
    agentType: null,
    agentContext: {},
    ancestorRunIds: [],
    runId: undefined,
    subagents: [],
    childRunIds: [],
    messageHistory: [],
    stepsRemaining: MAX_AGENT_STEPS_DEFAULT,
    creditsUsed: 0,
    directCreditsUsed: 0,
    output: undefined,
    parentId: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
    readAuthorizationsByPath: {},
  }
}
export function getInitialSessionState(
  fileContext: ProjectFileContext,
): SessionState {
  return {
    mainAgentState: getInitialAgentState(),
    fileContext,
  }
}
