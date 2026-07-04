import { parseAgentId } from '../util/agent-id-parsing'

import {
  CODEBIRDS_GEMINI_PRO_AGENT_IDS,
  CODEBIRDS_GEMINI_THINKER_AGENT_ID,
} from './codebirds-gemini-thinker'
import {
  CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
  CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID,
  CODEBIRDS_GEMINI_PRO_MODEL_ID,
  CODEBIRDS_GLM_V52_MODEL_ID,
  CODEBIRDS_KIMI_MODEL_ID,
  CODEBIRDS_MINIMAX_MODEL_ID,
  CODEBIRDS_MINIMAX_M3_MODEL_ID,
  CODEBIRDS_MIMO_V25_MODEL_ID,
  CODEBIRDS_MIMO_V25_PRO_MODEL_ID,
} from './codebirds-models'

import type { CostMode } from './model-config'

/**
 * The cost mode that indicates FREE mode.
 * Only allowlisted agent+model combinations cost 0 credits in this mode.
 */
export const FREE_COST_MODE = 'free' as const

/**
 * Root-orchestrator agent IDs counted as "a codebirds session" for abuse
 * detection and usage auditing. Subagents (file-picker, basher, etc.) are
 * excluded — they're spawned by the root, so counting them would inflate
 * every user's apparent activity.
 */
export const CODEBIRDS_ROOT_AGENT_IDS = [
  'base2-free',
  'base2-free-kimi',
  'base2-free-deepseek',
  'base2-free-deepseek-flash',
  'base2-free-mimo-pro',
  'base2-free-mimo',
  'base2-free-minimax-m3',
  'base2-free-glm',
] as const
const CODEBIRDS_ROOT_AGENT_ID_SET: ReadonlySet<string> = new Set(
  CODEBIRDS_ROOT_AGENT_IDS,
)

export const CODEBIRDS_ROOT_AGENT_ID_BY_MODEL: Record<string, string> = {
  [CODEBIRDS_MIMO_V25_PRO_MODEL_ID]: 'base2-free-mimo-pro',
  [CODEBIRDS_MIMO_V25_MODEL_ID]: 'base2-free-mimo',
  [CODEBIRDS_MINIMAX_MODEL_ID]: 'base2-free',
  [CODEBIRDS_MINIMAX_M3_MODEL_ID]: 'base2-free-minimax-m3',
  [CODEBIRDS_KIMI_MODEL_ID]: 'base2-free-kimi',
  [CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID]: 'base2-free-deepseek',
  [CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID]: 'base2-free-deepseek-flash',
  [CODEBIRDS_GLM_V52_MODEL_ID]: 'base2-free-glm',
}

export const CODEBIRDS_REVIEWER_AGENT_ID_BY_MODEL: Record<string, string> = {
  [CODEBIRDS_MIMO_V25_PRO_MODEL_ID]: 'code-reviewer-mimo-pro',
  [CODEBIRDS_MIMO_V25_MODEL_ID]: 'code-reviewer-mimo',
  [CODEBIRDS_MINIMAX_MODEL_ID]: 'code-reviewer-minimax',
  [CODEBIRDS_MINIMAX_M3_MODEL_ID]: 'code-reviewer-minimax-m3',
  [CODEBIRDS_KIMI_MODEL_ID]: 'code-reviewer-kimi',
  [CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID]: 'code-reviewer-deepseek',
  [CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID]: 'code-reviewer-deepseek-flash',
  [CODEBIRDS_GLM_V52_MODEL_ID]: 'code-reviewer-glm',
}

export function getFreebuffRootAgentIdForModel(model: string): string {
  return CODEBIRDS_ROOT_AGENT_ID_BY_MODEL[model] ?? 'base2-free'
}

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
  'base2-free': new Set([
    CODEBIRDS_MINIMAX_MODEL_ID,
    CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID,
    CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
    CODEBIRDS_KIMI_MODEL_ID,
    CODEBIRDS_MIMO_V25_PRO_MODEL_ID,
    CODEBIRDS_MIMO_V25_MODEL_ID,
  ]),
  'base2-free-kimi': new Set([CODEBIRDS_KIMI_MODEL_ID]),
  'base2-free-deepseek': new Set([CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID]),
  'base2-free-deepseek-flash': new Set([CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID]),
  'base2-free-mimo-pro': new Set([CODEBIRDS_MIMO_V25_PRO_MODEL_ID]),
  'base2-free-mimo': new Set([CODEBIRDS_MIMO_V25_MODEL_ID]),
  'base2-free-minimax-m3': new Set([CODEBIRDS_MINIMAX_M3_MODEL_ID]),
  'base2-free-glm': new Set([CODEBIRDS_GLM_V52_MODEL_ID]),

  // File exploration agents
  'file-picker': new Set(['google/gemini-2.5-flash-lite']),
  'file-picker-max': new Set(['google/gemini-3.1-flash-lite-preview']),
  'file-lister': new Set(['google/gemini-3.1-flash-lite-preview']),

  // Research agents
  'researcher-web': new Set(['google/gemini-3.1-flash-lite-preview']),
  'researcher-docs': new Set(['google/gemini-3.1-flash-lite-preview']),

  // Browser automation
  'browser-use': new Set(['google/gemini-3.1-flash-lite-preview']),

  // Command execution
  basher: new Set(['google/gemini-3.1-flash-lite-preview']),
  'tmux-cli': new Set([CODEBIRDS_MINIMAX_MODEL_ID]),

  // Code reviewer for free mode
  'code-reviewer-minimax': new Set([CODEBIRDS_MINIMAX_MODEL_ID]),
  'code-reviewer-minimax-m3': new Set([CODEBIRDS_MINIMAX_M3_MODEL_ID]),
  'code-reviewer-kimi': new Set([CODEBIRDS_KIMI_MODEL_ID]),
  'code-reviewer-deepseek': new Set([CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID]),
  'code-reviewer-deepseek-flash': new Set([
    CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
  ]),
  'code-reviewer-mimo-pro': new Set([CODEBIRDS_MIMO_V25_PRO_MODEL_ID]),
  'code-reviewer-mimo': new Set([CODEBIRDS_MIMO_V25_MODEL_ID]),
  'code-reviewer-glm': new Set([CODEBIRDS_GLM_V52_MODEL_ID]),
  // Legacy codebirds clients spawned code-reviewer-lite under provider-specific
  // free roots before those reviewer IDs existed.
  'code-reviewer-lite': new Set([
    CODEBIRDS_MINIMAX_MODEL_ID,
    CODEBIRDS_KIMI_MODEL_ID,
    CODEBIRDS_DEEPSEEK_V4_PRO_MODEL_ID,
    CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID,
    CODEBIRDS_MIMO_V25_PRO_MODEL_ID,
    CODEBIRDS_MIMO_V25_MODEL_ID,
  ]),

  // Legacy: kept for the standalone gemini thinker agent if invoked directly.
  [CODEBIRDS_GEMINI_THINKER_AGENT_ID]: new Set([CODEBIRDS_GEMINI_PRO_MODEL_ID]),
}

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

export function isFreebuffRootAgent(fullAgentId: string): boolean {
  const { publisherId, agentId } = parseAgentId(fullAgentId)
  if (!agentId) return false
  if (publisherId && publisherId !== 'codebirds') return false
  return CODEBIRDS_ROOT_AGENT_ID_SET.has(agentId)
}

export function isFreebuffGeminiThinkerAgent(fullAgentId: string): boolean {
  const { publisherId, agentId } = parseAgentId(fullAgentId)
  if (!agentId) return false
  if (publisherId && publisherId !== 'codebirds') return false
  return agentId === CODEBIRDS_GEMINI_THINKER_AGENT_ID
}

/**
 * True if this agent is permitted to call the premium Gemini Pro model — i.e.
 * one of the two gemini-thinker subagents (CLI `thinker-with-files-gemini` or
 * chat `thinker-gemini`). Publisher-spoof-safe like the other gates: a
 * non-codebirds publisher never matches.
 */
export function isFreebuffGeminiProAgent(fullAgentId: string): boolean {
  const { publisherId, agentId } = parseAgentId(fullAgentId)
  if (!agentId) return false
  if (publisherId && publisherId !== 'codebirds') return false
  return CODEBIRDS_GEMINI_PRO_AGENT_IDS.has(agentId)
}

export function shouldUseLocalTokenCountForFreebuffDeepseekFlash(params: {
  agentId: string | undefined
  model: string | undefined
}): boolean {
  const { agentId: fullAgentId, model } = params
  if (!fullAgentId || model !== CODEBIRDS_DEEPSEEK_V4_FLASH_MODEL_ID) {
    return false
  }

  const { publisherId, agentId } = parseAgentId(fullAgentId)
  if (publisherId && publisherId !== 'codebirds') return false
  return agentId === 'base2-free-deepseek-flash'
}

/**
 * Check if a specific agent is allowed to use a specific model in FREE mode.
 * This is the strictest check - validates both the agent AND model combination.
 *
 * Returns true only if:
 * 1. The agent has a valid agent ID
 * 2. The agent is in the allowed free-mode agents list
 * 3. The agent is either internal or published by 'codebirds' (prevents spoofing)
 * 4. The model is in that agent's allowed model set
 */
export function isFreeModeAllowedAgentModel(
  fullAgentId: string,
  model: string,
): boolean {
  const { publisherId, agentId } = parseAgentId(fullAgentId)

  // Must have a valid agent ID
  if (!agentId) return false

  // Must be either internal (no publisher) or from codebirds
  if (publisherId && publisherId !== 'codebirds') return false

  // Get the allowed models for this agent
  const allowedModels = FREE_MODE_AGENT_MODELS[agentId]
  if (!allowedModels) return false

  // Empty set means programmatic agent (no LLM calls expected)
  // For these, any model check should fail (they shouldn't be making LLM calls)
  if (allowedModels.size === 0) return false

  // Exact match first
  if (allowedModels.has(model)) return true

  // OpenRouter may return dated variants (e.g. "minimax/minimax-m2.7-20260211")
  // so also check date-like suffixes. Do not accept arbitrary suffixes:
  // "mimo-v2.5-pro" must not match the non-pro "mimo-v2.5" allowlist entry.
  for (const allowed of allowedModels) {
    const prefix = allowed + '-'
    if (model.startsWith(prefix)) {
      const suffix = model.slice(prefix.length)
      if (/^\d{6,8}(?:$|[-:])/.test(suffix)) return true
    }
  }

  return false
}

/**
 * Check if an agent should be free (no credit charge) for small requests.
 * This is separate from FREE mode - these agents get free credits only
 * when the cost would be trivial (<5 credits).
 *
 * Handles all agent ID formats:
 * - 'file-picker'
 * - 'file-picker@1.0.0'
 * - 'codebirds/file-picker@0.0.2'
 */
export function isFreeAgent(fullAgentId: string): boolean {
  const { publisherId, agentId } = parseAgentId(fullAgentId)

  // Must have a valid agent ID
  if (!agentId) return false

  // Must be in the free tier agents list
  if (!FREE_TIER_AGENTS.has(agentId)) return false

  // Must be either internal (no publisher) or from codebirds
  // This prevents publisher spoofing attacks
  if (publisherId && publisherId !== 'codebirds') return false

  return true
}
