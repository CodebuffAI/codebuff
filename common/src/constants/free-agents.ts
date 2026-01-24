import { parseAgentId } from '../util/agent-id-parsing'

/**
 * Agents that don't charge credits.
 *
 * These are typically lightweight utility agents that:
 * - Use cheap models (e.g., Gemini Flash Lite)
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
