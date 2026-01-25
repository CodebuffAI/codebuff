import { parseAgentId } from '../util/agent-id-parsing'

import type { CostMode } from './model-config'

/**
 * The cost mode that indicates FREE mode - all agents in this mode cost 0 credits.
 */
export const FREE_COST_MODE = 'free' as const

/**
 * Models that are allowed in FREE mode.
 * Only these cheap/fast models get 0 credits in FREE mode.
 * This prevents abuse by users trying to use expensive models for free.
 */
export const FREE_MODE_ALLOWED_MODELS = new Set([
  // Grok models used by base2-free, commander-lite, file-lister, file-picker-max
  'x-ai/grok-4.1-fast',
  'x-ai/grok-4-fast', // researcher agents

  // Gemini flash models used by file-picker and other subagents
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash-preview-09-2025',
  'google/gemini-2.5-flash-lite-preview-09-2025',

  // GPT models used by editor-gpt-5, thinker, context-pruner
  'openai/gpt-5.1',
  'openai/gpt-5.1-chat',
  'openai/gpt-5-mini',
])

/**
 * Agents that don't charge credits.
 *
 * These are typically lightweight utility agents that:
 * - Use cheap models (e.g., Gemini Flash)
 * - Have limited, programmatic capabilities
 * - Are frequently spawned as subagents
 *
 * Making them free avoids user confusion when they connect their own
 * Claude subscription (BYOK) but still see credit charges for non-Claude models.
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
 * Check if an agent should be free (no credit charge).
 * Handles all agent ID formats:
 * - 'file-picker'
 * - 'file-picker@1.0.0'
 * - 'codebuff/file-picker@0.0.2'
 */
export function isFreeAgent(fullAgentId: string): boolean {
  const { agentId } = parseAgentId(fullAgentId)
  return agentId ? FREE_TIER_AGENTS.has(agentId) : false
}
