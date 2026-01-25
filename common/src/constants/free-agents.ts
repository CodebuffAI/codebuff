import { parseAgentId } from '../util/agent-id-parsing'

import type { CostMode } from './model-config'

/**
 * The cost mode that indicates FREE mode - all agents in this mode cost 0 credits.
 */
export const FREE_COST_MODE = 'free' as const

/**
 * Agents that are allowed to run in FREE mode.
 * Only these specific agents (and their expected models) get 0 credits in FREE mode.
 * This prevents abuse by users trying to use arbitrary agents for free.
 *
 * The mapping also specifies which models each agent is allowed to use in free mode.
 * If an agent uses a different model, it will be charged full credits.
 */
export const FREE_MODE_AGENT_MODELS: Record<string, Set<string>> = {
  // Root orchestrator
  'base2-free': new Set(['x-ai/grok-4.1-fast']),

  // File exploration agents
  'file-picker': new Set(['google/gemini-2.5-flash-lite']),
  'file-picker-max': new Set(['x-ai/grok-4.1-fast']),
  'file-lister': new Set(['x-ai/grok-4.1-fast']),

  // Research agents
  'researcher-web': new Set(['x-ai/grok-4.1-fast']),
  'researcher-docs': new Set(['x-ai/grok-4.1-fast']),

  // Command execution
  'commander-lite': new Set(['x-ai/grok-4.1-fast']),

  // Editor for free mode
  'editor-glm': new Set(['z-ai/glm-4.7', 'z-ai/glm-4.6']),
}

/**
 * Set of all agent IDs allowed in FREE mode.
 * Derived from FREE_MODE_AGENT_MODELS for quick lookups.
 */
export const FREE_MODE_ALLOWED_AGENTS = new Set(Object.keys(FREE_MODE_AGENT_MODELS))

/**
 * Models that are allowed in FREE mode.
 * Derived from FREE_MODE_AGENT_MODELS - this is the union of all allowed models.
 * This prevents abuse by users trying to use expensive models for free.
 */
export const FREE_MODE_ALLOWED_MODELS = new Set(
  Object.values(FREE_MODE_AGENT_MODELS).flatMap((models) => Array.from(models)),
)

/**
 * Agents that don't charge credits when credits would be very small (<5).
 *
 * These are typically lightweight utility agents that:
 * - Use cheap models (e.g., Gemini Flash)
 * - Have limited, programmatic capabilities
 * - Are frequently spawned as subagents
 *
 * Making them free avoids user confusion when they connect their own
 * Claude subscription (BYOK) but still see credit charges for non-Claude models.
 *
 * NOTE: This is separate from FREE_MODE_ALLOWED_AGENTS which is for the
 * explicit "free" cost mode. These agents get free credits only when
 * the cost would be trivial (<5 credits).
 */
export const FREE_TIER_AGENTS = new Set([
  'file-picker',
  'file-picker-max',
  'file-lister',
  'researcher-web',
  'researcher-docs',
])

/**
 * Check if the current cost mode is FREE mode.
 * In FREE mode, agents using allowed models cost 0 credits.
 */
export function isFreeMode(costMode: CostMode | string | undefined): boolean {
  return costMode === FREE_COST_MODE
}

/**
 * Check if a model is allowed in FREE mode.
 * Only whitelisted cheap/fast models can be used for free.
 */
export function isFreeModeAllowedModel(model: string): boolean {
  return FREE_MODE_ALLOWED_MODELS.has(model)
}

/**
 * Check if an agent is allowed to run in FREE mode.
 * Validates both the agent ID and optionally the publisher.
 *
 * For security, we only allow:
 * - Internal agents (no publisher, e.g., 'base2-free')
 * - Codebuff-published agents (publisher === 'codebuff')
 *
 * This prevents attackers from creating agents with matching names
 * under different publishers to abuse free mode.
 */
export function isFreeModeAllowedAgent(fullAgentId: string): boolean {
  const { publisherId, agentId } = parseAgentId(fullAgentId)

  // Must have a valid agent ID
  if (!agentId) return false

  // Must be in the allowed agents list
  if (!FREE_MODE_ALLOWED_AGENTS.has(agentId)) return false

  // Must be either internal (no publisher) or from codebuff
  if (publisherId && publisherId !== 'codebuff') return false

  return true
}

/**
 * Check if a specific agent is allowed to use a specific model in FREE mode.
 * This is the strictest check - validates both the agent AND model combination.
 *
 * Returns true only if:
 * 1. The agent is allowed in free mode (isFreeModeAllowedAgent)
 * 2. The model is in that agent's allowed model set
 */
export function isFreeModeAllowedAgentModel(
  fullAgentId: string,
  model: string,
): boolean {
  // First check if agent is allowed in free mode (includes publisher validation)
  if (!isFreeModeAllowedAgent(fullAgentId)) return false

  // Parse to get the base agent ID for model lookup
  const { agentId } = parseAgentId(fullAgentId)
  if (!agentId) return false

  // Get the allowed models for this agent
  const allowedModels = FREE_MODE_AGENT_MODELS[agentId]
  if (!allowedModels) return false

  // Empty set means programmatic agent (no LLM calls expected)
  // For these, any model check should fail (they shouldn't be making LLM calls)
  if (allowedModels.size === 0) return false

  return allowedModels.has(model)
}

/**
 * Check if an agent should be free (no credit charge) for small requests.
 * This is separate from FREE mode - these agents get free credits only
 * when the cost would be trivial (<5 credits).
 *
 * Handles all agent ID formats:
 * - 'file-picker'
 * - 'file-picker@1.0.0'
 * - 'codebuff/file-picker@0.0.2'
 */
export function isFreeAgent(fullAgentId: string): boolean {
  const { publisherId, agentId } = parseAgentId(fullAgentId)

  // Must have a valid agent ID
  if (!agentId) return false

  // Must be in the free tier agents list
  if (!FREE_TIER_AGENTS.has(agentId)) return false

  // Must be either internal (no publisher) or from codebuff
  // This prevents publisher spoofing attacks
  if (publisherId && publisherId !== 'codebuff') return false

  return true
}
