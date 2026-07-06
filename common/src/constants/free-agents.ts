import { parseAgentId } from '../util/agent-id-parsing'

import {
  FREEBUFF_GEMINI_PRO_AGENT_IDS,
  FREEBUFF_GEMINI_THINKER_AGENT_ID,
} from './freebuff-gemini-thinker'
import {
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GEMINI_PRO_MODEL_ID,
  FREEBUFF_GLM_V52_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
} from './freebuff-models'

import type { CostMode } from './model-config'

/**
 * The cost mode that indicates FREE mode.
 * Only allowlisted agent+model combinations cost 0 credits in this mode.
 */
export const FREE_COST_MODE = 'free' as const

/**
 * The single root agent Freebuff Desktop's hosted (codebuff) harness runs every
 * thread turn under (see freebuff-desktop thread-agent.ts). Unlike the CLI — which
 * has one root id per model (`base2-free-<model>`) — the desktop uses ONE root id
 * for ALL its models, picking the model per tab. It's a first-party free-mode root
 * just like `base2-free*`, so it's listed in FREEBUFF_ROOT_AGENT_IDS below; its
 * allowed models are the full desktop picker set (see FREE_MODE_AGENT_MODELS). It
 * carries the "You are Buffy" CLI marker in its system prompt so it passes
 * requestHasFreebuffSystemMarker.
 */
export const FREEBUFF_DESKTOP_THREAD_AGENT_ID = 'freebuff-desktop-thread'

/**
 * Root-orchestrator agent IDs counted as "a freebuff session" for abuse
 * detection and usage auditing. Subagents (file-picker, basher, etc.) are
 * excluded — they're spawned by the root, so counting them would inflate
 * every user's apparent activity.
 */
export const FREEBUFF_ROOT_AGENT_IDS = [
  'base2-free',
  'base2-free-kimi',
  'base2-free-deepseek',
  'base2-free-deepseek-flash',
  'base2-free-mimo-pro',
  'base2-free-mimo',
  'base2-free-minimax-m3',
  'base2-free-glm',
  FREEBUFF_DESKTOP_THREAD_AGENT_ID,
] as const
const FREEBUFF_ROOT_AGENT_ID_SET: ReadonlySet<string> = new Set(
  FREEBUFF_ROOT_AGENT_IDS,
)

export const FREEBUFF_ROOT_AGENT_ID_BY_MODEL: Record<string, string> = {
  [FREEBUFF_MIMO_V25_PRO_MODEL_ID]: 'base2-free-mimo-pro',
  [FREEBUFF_MIMO_V25_MODEL_ID]: 'base2-free-mimo',
  [FREEBUFF_MINIMAX_M3_MODEL_ID]: 'base2-free-minimax-m3',
  [FREEBUFF_KIMI_MODEL_ID]: 'base2-free-kimi',
  [FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID]: 'base2-free-deepseek',
  [FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID]: 'base2-free-deepseek-flash',
  [FREEBUFF_GLM_V52_MODEL_ID]: 'base2-free-glm',
}

export const FREEBUFF_REVIEWER_AGENT_ID_BY_MODEL: Record<string, string> = {
  [FREEBUFF_MIMO_V25_PRO_MODEL_ID]: 'code-reviewer-mimo-pro',
  [FREEBUFF_MIMO_V25_MODEL_ID]: 'code-reviewer-mimo',
  [FREEBUFF_MINIMAX_M3_MODEL_ID]: 'code-reviewer-minimax-m3',
  [FREEBUFF_KIMI_MODEL_ID]: 'code-reviewer-kimi',
  [FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID]: 'code-reviewer-deepseek',
  [FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID]: 'code-reviewer-deepseek-flash',
  [FREEBUFF_GLM_V52_MODEL_ID]: 'code-reviewer-glm',
}

export function getFreebuffRootAgentIdForModel(model: string): string {
  return FREEBUFF_ROOT_AGENT_ID_BY_MODEL[model] ?? 'base2-free'
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
    FREEBUFF_MINIMAX_M3_MODEL_ID,
    FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    FREEBUFF_KIMI_MODEL_ID,
    FREEBUFF_MIMO_V25_PRO_MODEL_ID,
    FREEBUFF_MIMO_V25_MODEL_ID,
  ]),
  'base2-free-kimi': new Set([FREEBUFF_KIMI_MODEL_ID]),
  'base2-free-deepseek': new Set([FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID]),
  'base2-free-deepseek-flash': new Set([FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID]),
  'base2-free-mimo-pro': new Set([FREEBUFF_MIMO_V25_PRO_MODEL_ID]),
  'base2-free-mimo': new Set([FREEBUFF_MIMO_V25_MODEL_ID]),
  'base2-free-minimax-m3': new Set([FREEBUFF_MINIMAX_M3_MODEL_ID]),
  'base2-free-glm': new Set([FREEBUFF_GLM_V52_MODEL_ID]),

  // Freebuff Desktop's single hosted root agent — one root id across all its
  // models (the user picks the model per tab), so it allows the full desktop
  // picker set. Concurrency is still bounded elsewhere: the free-session
  // admission gate caps premium-bucket models (incl. MiniMax M3) to one active
  // session per user (premium_slot_taken), so "one premium model at a time" in
  // full access holds regardless of this allowlist.
  [FREEBUFF_DESKTOP_THREAD_AGENT_ID]: new Set([
    FREEBUFF_MINIMAX_M3_MODEL_ID,
    FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    FREEBUFF_KIMI_MODEL_ID,
    FREEBUFF_MIMO_V25_PRO_MODEL_ID,
    FREEBUFF_MIMO_V25_MODEL_ID,
  ]),

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
  'tmux-cli': new Set([FREEBUFF_MINIMAX_M3_MODEL_ID]),

  // Code reviewer for free mode
  'code-reviewer-minimax-m3': new Set([FREEBUFF_MINIMAX_M3_MODEL_ID]),
  'code-reviewer-kimi': new Set([FREEBUFF_KIMI_MODEL_ID]),
  'code-reviewer-deepseek': new Set([FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID]),
  'code-reviewer-deepseek-flash': new Set([
    FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  ]),
  'code-reviewer-mimo-pro': new Set([FREEBUFF_MIMO_V25_PRO_MODEL_ID]),
  'code-reviewer-mimo': new Set([FREEBUFF_MIMO_V25_MODEL_ID]),
  'code-reviewer-glm': new Set([FREEBUFF_GLM_V52_MODEL_ID]),
  // Legacy freebuff clients spawned code-reviewer-lite under provider-specific
  // free roots before those reviewer IDs existed.
  'code-reviewer-lite': new Set([
    FREEBUFF_KIMI_MODEL_ID,
    FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
    FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
    FREEBUFF_MIMO_V25_PRO_MODEL_ID,
    FREEBUFF_MIMO_V25_MODEL_ID,
  ]),

  // Legacy: kept for the standalone gemini thinker agent if invoked directly.
  [FREEBUFF_GEMINI_THINKER_AGENT_ID]: new Set([FREEBUFF_GEMINI_PRO_MODEL_ID]),
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
  if (publisherId && publisherId !== 'codebuff') return false
  return FREEBUFF_ROOT_AGENT_ID_SET.has(agentId)
}

export function isFreebuffGeminiThinkerAgent(fullAgentId: string): boolean {
  const { publisherId, agentId } = parseAgentId(fullAgentId)
  if (!agentId) return false
  if (publisherId && publisherId !== 'codebuff') return false
  return agentId === FREEBUFF_GEMINI_THINKER_AGENT_ID
}

/**
 * True if this agent is permitted to call the premium Gemini Pro model — i.e.
 * one of the two gemini-thinker subagents (CLI `thinker-with-files-gemini` or
 * chat `thinker-gemini`). Publisher-spoof-safe like the other gates: a
 * non-codebuff publisher never matches.
 */
export function isFreebuffGeminiProAgent(fullAgentId: string): boolean {
  const { publisherId, agentId } = parseAgentId(fullAgentId)
  if (!agentId) return false
  if (publisherId && publisherId !== 'codebuff') return false
  return FREEBUFF_GEMINI_PRO_AGENT_IDS.has(agentId)
}

export function shouldUseLocalTokenCountForFreebuffDeepseekFlash(params: {
  agentId: string | undefined
  model: string | undefined
}): boolean {
  const { agentId: fullAgentId, model } = params
  if (!fullAgentId || model !== FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID) {
    return false
  }

  const { publisherId, agentId } = parseAgentId(fullAgentId)
  if (publisherId && publisherId !== 'codebuff') return false
  return agentId === 'base2-free-deepseek-flash'
}

/**
 * Check if a specific agent is allowed to use a specific model in FREE mode.
 * This is the strictest check - validates both the agent AND model combination.
 *
 * Returns true only if:
 * 1. The agent has a valid agent ID
 * 2. The agent is in the allowed free-mode agents list
 * 3. The agent is either internal or published by 'codebuff' (prevents spoofing)
 * 4. The model is in that agent's allowed model set
 */
export function isFreeModeAllowedAgentModel(
  fullAgentId: string,
  model: string,
): boolean {
  const { publisherId, agentId } = parseAgentId(fullAgentId)

  // Must have a valid agent ID
  if (!agentId) return false

  // Must be either internal (no publisher) or from codebuff
  if (publisherId && publisherId !== 'codebuff') return false

  // Get the allowed models for this agent
  const allowedModels = FREE_MODE_AGENT_MODELS[agentId]
  if (!allowedModels) return false

  // Empty set means programmatic agent (no LLM calls expected)
  // For these, any model check should fail (they shouldn't be making LLM calls)
  if (allowedModels.size === 0) return false

  // Exact match first
  if (allowedModels.has(model)) return true

  // OpenRouter may return dated variants (e.g. "minimax/minimax-m3-20260211")
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
