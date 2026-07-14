import { z } from 'zod/v4'

import { MAX_AGENT_STEPS_DEFAULT } from '../constants/agents'

import type { Message } from './messages/codebuff-message'
import type { ProjectFileContext } from '../util/file'
import type { ProposalResultV1 } from '../tools/results/filesystem'

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

export type EditRereadReason =
  | 'preflight_failed'
  | 'stale_snapshot'
  | 'stale_capability'
  | 'application_rejected'
  | 'application_unconfirmed'
  | 'application_threw'

export type EditRereadRequirement = {
  reason: EditRereadReason
  sourceTool?: string
}

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
  /** Hash of the previous repeated-step watchdog observation. */
  lastStepProgressSignature?: string
  /** Consecutive count for the current repeated-step signature. */
  repeatedStepProgressCount?: number
  creditsUsed: number
  directCreditsUsed: number
  /**
   * Cumulative count of input tokens served from the provider's prompt cache
   * (cache hits) across all steps in this run. Accumulated from per-call usage
   * metadata via the onCacheDebugUsageReceived callback (made unconditional
   * for runtime aggregation, not just CACHE_DEBUG_FULL_LOGGING). Used together
   * with cacheTotalInputTokens to compute a live cache-hit rate.
   */
  cacheInputTokens: number
  /**
   * Cumulative count of total input tokens processed by the provider across
   * all steps in this run. This is the denominator for the cache-hit rate
   * (cacheInputTokens / cacheTotalInputTokens). Accumulated alongside
   * cacheInputTokens.
   */
  cacheTotalInputTokens: number
  /**
   * Optional per-run cost cap in US cents. Lazy-initialized from the agent
   * template's maxCostCents on the first step, then enforced after each step's
   * cost accumulation: if creditsUsed exceeds this cap, the turn ends with a
   * budget-exceeded system message. Gives BYOK users a hard spend guardrail.
   * Undefined = no cap (default, preserves existing behavior).
   */
  maxCostCents?: number
  /**
   * Optional per-turn input token cap. Lazy-initialized from the agent
   * template's maxTokensPerTurn on the first step, then enforced after each
   * step's token accumulation: if the step's total input tokens exceed this
   * cap, the turn ends. Undefined = no cap.
   */
  maxTokensPerTurn?: number
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
   * Context window resolved from the active provider/model configuration.
   * The SDK reports this after routing so semantic compaction can scale with
   * 500k/1M models instead of assuming the legacy 200k-class window.
   */
  contextWindowTokens?: number
  /**
   * Cross-turn read authorization registry for the strict read-before-edit
   * gate. Each entry is a path that the agent has read (or successfully
   * written) at least once during this run, granting a sticky read auth
   * that lets subsequent edits on the same path proceed without a redundant
   * read_files round-trip. Survives across LLM turns because it lives on
   * agentState rather than on the per-turn fileProcessingState, which is
   * recreated on every processStream / runProgrammaticStep invocation.
   *
   * Entries are revoked when their paired content hash is stale or an edit
   * application fails. The registry is otherwise bounded by the distinct
   * paths touched during a run; no separate eviction policy is implemented.
   */
  readAuthorizationsByPath?: Record<string, true>
  /**
   * Content hash paired with each whole-file read authorization. The Boolean
   * registry above remains as the compatibility/presence map, but an entry is
   * authoritative only when this map contains the hash of the exact whole-file
   * content the agent read or most recently wrote successfully.
   */
  readAuthorizationHashesByPath?: Record<string, string>
  /** Why a path must be read again after a failed edit, persisted across turns. */
  editRereadRequirementsByPath?: Record<string, EditRereadRequirement>
  /** Typed current-attempt proposal records. Proposal state is not mutation state. */
  proposalLedger?: ProposalResultV1[]
  /** Runtime-owned orchestrator state that must survive message compaction. */
  base2ActiveWork?: Record<string, unknown>
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
  'test_writer',
  'security_reviewer',
  'debugger',
  'doc_writer',
  'git_committer',
  'architect',
  'product_reviewer',
  'integration_agent',
  'performance_specialist',
  'reliability_reviewer',
  'migration_reviewer',
  'accessibility_reviewer',
  'ux_visual_reviewer',
  'compatibility_reviewer',
  'dependency_reviewer',
  'dependency_manager',
  'incident_coordinator',
  'release_manager',
  'docs_architect',
  'evaluator',
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
    lastStepProgressSignature: undefined,
    repeatedStepProgressCount: 0,
    creditsUsed: 0,
    directCreditsUsed: 0,
    cacheInputTokens: 0,
    cacheTotalInputTokens: 0,
    output: undefined,
    parentId: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
    contextWindowTokens: undefined,
    readAuthorizationsByPath: {},
    readAuthorizationHashesByPath: {},
    editRereadRequirementsByPath: {},
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
