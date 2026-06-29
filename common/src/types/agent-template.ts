/**
 * Backend Agent Template Types
 *
 * This file provides backend-compatible agent template types with strict validation.
 * It imports base types from the user-facing template to eliminate duplication.
 */

import { z } from 'zod/v4'

import type { MCPConfig } from './mcp'
import type { Model } from '../old-constants'
import type { ToolResultOutput } from './messages/content-part'
import type { AgentState, AgentTemplateType } from './session-state'
import type {
  ToolCall,
  AgentState as PublicAgentState,
} from '../templates/initial-agents-dir/types/agent-definition'
import type { Logger } from '../templates/initial-agents-dir/types/util-types'
import type { ToolName } from '../tools/constants'

export type AgentId = `${string}/${string}@${number}.${number}.${number}`

export type OpenRouterReasoningOptions = {
  /**
   * https://openrouter.ai/docs/use-cases/reasoning-tokens
   * One of `max_tokens` or `effort` is required.
   * If `exclude` is true, reasoning will be removed from the response. Default is false.
   */
  enabled?: boolean
  exclude?: boolean
} & (
  | {
      max_tokens: number
    }
  | {
      effort: 'high' | 'medium' | 'low' | 'minimal' | 'none'
    }
)

export type OpenRouterProviderRoutingOptions = {
  /**
   * List of provider slugs to try in order (e.g. ["anthropic", "openai"])
   */
  order?: string[]
  /**
   * Whether to allow backup providers when primary is unavailable (default: true)
   */
  allow_fallbacks?: boolean
  /**
   * Only use providers that support all parameters in your request (default: false)
   */
  require_parameters?: boolean
  /**
   * Control whether to use providers that may store data
   */
  data_collection?: 'allow' | 'deny'
  /**
   * List of provider slugs to allow for this request
   */
  only?: string[]
  /**
   * List of provider slugs to skip for this request
   */
  ignore?: string[]
  /**
   * List of quantization levels to filter by (e.g. ["int4", "int8"])
   */
  quantizations?: Array<
    | 'int4'
    | 'int8'
    | 'fp4'
    | 'fp6'
    | 'fp8'
    | 'fp16'
    | 'bf16'
    | 'fp32'
    | 'unknown'
  >
  /**
   * Sort providers by price, throughput, or latency
   */
  sort?: 'price' | 'throughput' | 'latency'
  /**
   * Maximum pricing you want to pay for this request
   */
  max_price?: {
    prompt?: number | string
    completion?: number | string
    image?: number | string
    audio?: number | string
    request?: number | string
  }
}

export type OpenRouterProviderOptions = {
  models?: string[]
  reasoning?: OpenRouterReasoningOptions
  /**
   * A unique identifier representing your end-user, which can
   * help OpenRouter to monitor and detect abuse.
   */
  user?: string
}

/**
 * Backend agent template with strict validation and Zod schemas
 * Extends the user-facing AgentDefinition but with backend-specific requirements
 */
export type AgentTemplate<
  P = string | undefined,
  T = Record<string, any> | undefined,
> = {
  id: AgentTemplateType
  displayName: string
  /**
   * Documentation-only default model for this agent. NOT read at runtime —
   * model resolution is driven entirely by openbuff.json / routes.json
   * (defaultModel, modes, agents[]). Retained on the type so definitions can
   * declare their intended model, but it is never used as a fallback when a
   * route is missing (a missing route is a hard error in this BYOK CLI).
   */
  model?: Model
  reasoningOptions?: OpenRouterReasoningOptions
  providerOptions?: OpenRouterProviderRoutingOptions

  /**
   * Optional per-run cost cap in US cents. When set, runAgentStep lazy-inits
   * this onto agentState on the first step, then enforces after each step's
   * cost accumulation: if creditsUsed exceeds this cap, the turn ends.
   * Undefined = no cap. Mirrors DynamicAgentDefinitionSchema.maxCostCents.
   */
  maxCostCents?: number
  /**
   * Optional per-turn input token cap. When set, runAgentStep ends the turn
   * if a single step's total input tokens exceed this threshold.
   * Undefined = no cap.
   */
  maxTokensPerTurn?: number
  /**
   * Optional wall-clock timeout in milliseconds for a single execution of this
   * agent as a subagent. When set, executeSubagent uses this as the deadline
   * (overridable per-spawn via spawn_agents' timeout_seconds). Undefined falls
   * back to DEFAULT_SUBAGENT_TIMEOUT_MS (20 minutes). Set to -1 to disable the
   * timeout for genuinely long-running agents.
   */
  defaultTimeoutMs?: number

  /**
   * Optional maximum nesting depth for this agent when spawned as a subagent.
   * The root orchestrator runs at depth 0; each spawn increments depth by 1.
   * When a spawn would exceed this depth, executeSubagent rejects it with an
   * actionable error before any work begins, preventing unbounded recursion.
   * Undefined falls back to MAX_SPAWN_DEPTH_DEFAULT (3). Set to a higher value
   * for agents that legitimately need deeper nesting.
   */
  maxSpawnDepth?: number

  mcpServers: Record<string, MCPConfig>
  toolNames: (ToolName | (string & {}))[]
  spawnableAgents: AgentTemplateType[]

  spawnerPrompt?: string
  systemPrompt: string
  instructionsPrompt: string
  stepPrompt: string
  parentInstructions?: Record<string, string>

  // Required parameters for spawning this agent.
  inputSchema: {
    prompt?: z.ZodSchema<P>
    params?: z.ZodSchema<T>
  }
  includeMessageHistory: boolean
  inheritParentSystemPrompt: boolean
  outputMode: 'last_message' | 'all_messages' | 'structured_output'
  outputSchema?: z.ZodSchema<any>

  handleSteps?: StepHandler<P, T> | string // Function or string of the generator code for running in a sandbox
}

export type StepText = { type: 'STEP_TEXT'; text: string }
export type GenerateN = { type: 'GENERATE_N'; n: number }

// Zod schemas for handleSteps yield values
export const StepTextSchema = z.object({
  type: z.literal('STEP_TEXT'),
  text: z.string(),
})

export const GenerateNSchema = z.object({
  type: z.literal('GENERATE_N'),
  n: z.number().int().positive(),
})

export const HandleStepsToolCallSchema = z.object({
  toolName: z.string().min(1),
  input: z.record(z.string(), z.any()),
  includeToolCall: z.boolean().optional(),
})

export const HandleStepsYieldValueSchema = z.union([
  z.literal('STEP'),
  z.literal('STEP_ALL'),
  StepTextSchema,
  GenerateNSchema,
  HandleStepsToolCallSchema,
])

export type HandleStepsYieldValue = z.infer<typeof HandleStepsYieldValueSchema>

export type StepGenerator = Generator<
  Omit<ToolCall, 'toolCallId'> | 'STEP' | 'STEP_ALL' | StepText | GenerateN, // Generic tool call type
  void,
  {
    agentState: PublicAgentState
    toolResult: ToolResultOutput[]
    stepsComplete: boolean
    // True when stepsComplete is due to the step-cap guard (stepsRemaining <= 0),
    // not a natural turn end. Orchestrators use this to break out of their loop
    // instead of falling through to the validation/reviewer gate, which would
    // re-yield STEP and re-trigger the step-cap, causing an infinite loop.
    hitStepCap?: boolean
    nResponses?: string[]
  }
>

export type StepHandler<
  P = string | undefined,
  T = Record<string, any> | undefined,
> = (context: {
  agentState: AgentState
  prompt: P
  params: T
  logger: Logger
}) => StepGenerator

export { Logger, PublicAgentState }
