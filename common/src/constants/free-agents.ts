import { parseAgentId } from '../util/agent-id-parsing'

import {
  FREEBUFF_GEMINI_PRO_AGENT_IDS,
  FREEBUFF_GEMINI_THINKER_AGENT_ID,
} from './freebuff-gemini-thinker'
import {
  FREEBUFF_CROF_GLM_V52_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_GEMINI_PRO_MODEL_ID,
  FREEBUFF_GLM_V52_MODEL_ID,
  FREEBUFF_HY3_MODEL_ID,
  FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_LING_3_FLASH_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  LIMITED_FREEBUFF_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID,
  FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID,
} from './freebuff-models'
import {
  GEMINI_3_1_FLASH_LITE_MODEL_ID,
  GEMINI_3_5_FLASH_LITE_MODEL_ID,
} from './gemini'

import type { CostMode } from './model-config'

/**
 * The cost mode that indicates FREE mode.
 * Only allowlisted agent+model combinations cost 0 credits in this mode.
 */
export const FREE_COST_MODE = 'free' as const

/**
 * The root agent family Freebuff Desktop's hosted (codebuff) harness runs every
 * thread turn under (see freebuff-desktop thread-agent.ts). Unlike the CLI — which
 * has one root id per model (`base2-free-<model>`) — the desktop root ids support
 * every picker model and vary only by execution mode. They are first-party
 * free-mode roots just like `base2-free*`, so they are listed in
 * FREEBUFF_ROOT_AGENT_IDS below and carry the "You are Buffy" CLI marker in their
 * system prompts so they pass requestHasFreebuffSystemMarker.
 */
export const FREEBUFF_DESKTOP_THREAD_AGENT_ID = 'freebuff-desktop-thread'

export function getFreebuffDesktopThreadAgentId(
  executionMode: 'local' | 'worktree',
): string {
  return `${FREEBUFF_DESKTOP_THREAD_AGENT_ID}-${executionMode}`
}

/**
 * Desktop originally shipped with the unsuffixed root id. Local/worktree
 * execution modes use distinct ids for trace and cache identity, while the
 * unsuffixed id remains accepted for older Desktop clients.
 */
export const FREEBUFF_DESKTOP_THREAD_AGENT_IDS = [
  FREEBUFF_DESKTOP_THREAD_AGENT_ID,
  getFreebuffDesktopThreadAgentId('local'),
  getFreebuffDesktopThreadAgentId('worktree'),
] as const

/**
 * The Freebuff Cloud custom-stack planner roots, and the models they are pinned
 * to. There is one variant per model because a bundled agent's model comes from
 * its definition, not from the request.
 *
 * Full access plans on DeepSeek V4 Pro. Limited regions may only use
 * LIMITED_FREEBUFF_MODEL_IDS, so they get their own variant rather than being
 * shut out of the feature.
 *
 * Exported so the agent definitions, the planner UI's forced model, and the
 * "Start building" hand-off all read one set of values. They must agree: the
 * planner admits a free session bound to its model, and a build turn resolved
 * to a different model is rejected with session_model_mismatch.
 */
export const CLOUD_PLANNER_AGENT_ID = 'base2-free-cloud-planner'
export const CLOUD_PLANNER_MODEL_ID = FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID
export const CLOUD_PLANNER_LIMITED_AGENT_ID = 'base2-free-cloud-planner-limited'
export const CLOUD_PLANNER_LIMITED_MODEL_ID = LIMITED_FREEBUFF_MODEL_ID

/** The planner model a given access tier is permitted to run. */
export function cloudPlannerModelForAccessTier(
  accessTier: string | null | undefined,
): string {
  return accessTier === 'limited'
    ? CLOUD_PLANNER_LIMITED_MODEL_ID
    : CLOUD_PLANNER_MODEL_ID
}

/**
 * The planner variant that runs a given model. Falls back to the full-access
 * variant so an unknown selection still resolves to a registered root.
 */
export function cloudPlannerAgentIdForModel(
  model: string | null | undefined,
): string {
  return model === CLOUD_PLANNER_LIMITED_MODEL_ID
    ? CLOUD_PLANNER_LIMITED_AGENT_ID
    : CLOUD_PLANNER_AGENT_ID
}

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
  'base2-free-glm-crof',
  'base2-free-laguna-s-2-1',
  'base2-free-laguna-s-2-1-openrouter',
  'base2-free-ling-3-flash',
  // Freebuff Web trial orchestrators (freebuff_bundled_agents.ts). Every root
  // id in FREE_MODE_AGENT_MODELS that can spawn subagents MUST also be listed
  // here, or the chat-completions hierarchy gate 403s the subagents with
  // "Free mode subagents must run under an active freebuff session root"
  // (2026-07-09 incident: trial runs failed at spawn_agent_inline).
  'base2-free-hy3',
  'base2-free-hy3-atlas',
  // Freebuff Cloud custom-stack planner variants. They spawn context-pruner, so
  // omitting them here 403s that subagent with
  // free_mode_invalid_agent_hierarchy — the same failure the hy3 roots above
  // hit. Their shared system prompt carries the "You are Buffy" marker so they
  // also pass requestHasFreebuffSystemMarker.
  'base2-free-cloud-planner',
  'base2-free-cloud-planner-limited',
  ...FREEBUFF_DESKTOP_THREAD_AGENT_IDS,
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
  [FREEBUFF_CROF_GLM_V52_MODEL_ID]: 'base2-free-glm-crof',
  [FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID]: 'base2-free-laguna-s-2-1',
  [FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID]:
    'base2-free-laguna-s-2-1-openrouter',
  [FREEBUFF_LING_3_FLASH_MODEL_ID]: 'base2-free-ling-3-flash',
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

const FREEBUFF_DESKTOP_MODELS = new Set([
  FREEBUFF_MINIMAX_M3_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_PRO_MODEL_ID,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_KIMI_MODEL_ID,
  FREEBUFF_MIMO_V25_PRO_MODEL_ID,
  FREEBUFF_MIMO_V25_MODEL_ID,
  FREEBUFF_GLM_V52_MODEL_ID,
])

/**
 * Accepted models for the Gemini helper subagents, which moved from 3.1 to 3.5
 * flash-lite in 2026-07. Both are listed because released CLI/Desktop builds
 * ship their own bundled agent definitions: an installed client keeps
 * requesting the old model until the user upgrades, and dropping it here 403s
 * those clients mid-session ("free_mode_invalid_agent_model"). Drop 3.1 once
 * the pinned versions are out of circulation.
 */
const GEMINI_HELPER_MODELS = new Set([
  GEMINI_3_5_FLASH_LITE_MODEL_ID,
  GEMINI_3_1_FLASH_LITE_MODEL_ID,
])

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
  'base2-free-glm-crof': new Set([FREEBUFF_CROF_GLM_V52_MODEL_ID]),
  'base2-free-laguna-s-2-1': new Set([FREEBUFF_POOLSIDE_LAGUNA_S_21_MODEL_ID]),
  'base2-free-laguna-s-2-1-openrouter': new Set([
    FREEBUFF_POOLSIDE_LAGUNA_S_21_OPENROUTER_MODEL_ID,
  ]),
  'base2-free-ling-3-flash': new Set([FREEBUFF_LING_3_FLASH_MODEL_ID]),
  'base2-free-hy3': new Set([FREEBUFF_HY3_MODEL_ID]),
  'base2-free-hy3-atlas': new Set([FREEBUFF_HY3_OPENROUTER_PAID_MODEL_ID]),
  // Freebuff Cloud custom-stack planner (freebuff_bundled_agents.ts). One
  // variant per model, each allowed exactly the model its definition pins.
  'base2-free-cloud-planner': new Set([CLOUD_PLANNER_MODEL_ID]),
  'base2-free-cloud-planner-limited': new Set([LIMITED_FREEBUFF_MODEL_ID]),

  // Every Freebuff Desktop hosted root variant allows the full desktop picker
  // set (the user picks the model per tab). The free-session admission gate still
  // caps premium-bucket models (incl. MiniMax M3) to one active
  // session per user (premium_slot_taken), so "one premium model at a time" in
  // full access holds regardless of this allowlist.
  [FREEBUFF_DESKTOP_THREAD_AGENT_ID]: FREEBUFF_DESKTOP_MODELS,
  [getFreebuffDesktopThreadAgentId('local')]: FREEBUFF_DESKTOP_MODELS,
  [getFreebuffDesktopThreadAgentId('worktree')]: FREEBUFF_DESKTOP_MODELS,

  // File exploration agents
  'file-picker': new Set(['google/gemini-2.5-flash-lite']),
  'file-picker-max': GEMINI_HELPER_MODELS,
  'file-lister': GEMINI_HELPER_MODELS,

  // Research agents
  'researcher-web': GEMINI_HELPER_MODELS,
  'researcher-docs': GEMINI_HELPER_MODELS,

  // Browser automation
  'browser-use': GEMINI_HELPER_MODELS,

  // Command execution
  basher: GEMINI_HELPER_MODELS,
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
  // Wire compatibility only — NOT a freebuff agent. `code-reviewer-lite` now
  // belongs to Codebuff's paid lite mode and is spawned by no freebuff root and
  // shipped in no freebuff bundle. Released clients from before the
  // provider-specific reviewer IDs existed still spawn the id with one of the
  // free models below pinned in their own definitions, and this entry is what
  // keeps those sessions working.
  //
  // Never add lite's model here: it is a paid OpenAI model, and a free session
  // must not be able to reach it.
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
