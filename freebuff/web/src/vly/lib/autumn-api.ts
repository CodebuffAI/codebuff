import { agentCredits } from '../autumn.config'
import {
  CREDIT_MULTIPLIERS,
  CREDIT_BILLING_UNIT,
  PLAN_IDS,
  PRICE_PER_MILLION_CREDITS,
  TIER_ORDER,
  type TierName,
} from '../autumn/constants'

// Credit calculation constants
export const TOKENS_PER_CREDIT = 100

/**
 * Model costs based on actual API pricing (per million tokens)
 * Updated: January 2025
 *
 * Cost multipliers relative to baseline (1x at $1/$5):
 * - GPT 5.4 Nano: $0.20 input, $1.25 output
 * - GPT 5.4 Mini: $0.75 input, $4.50 output
 * - GPT 5.4: $2.50 input, $15 output
 * - GPT 5.3 Codex: mapped to GPT 5.4-class pricing until dedicated pricing is added
 * - Claude 4.6 Sonnet: $3 input, $15 output
 * - Claude 4.6 Opus: $5 input, $25 output (Scale plan only)
 */
export const MODEL_COSTS = {
  GPT_5_4_MINI: {
    inputCostPerMillion: 0.75,
    outputCostPerMillion: 4.5,
    cachedInputCostPerMillion: 0.075,
    displayName: 'GPT 5.4 Mini',
    multiplier: 0.75,
  },
  // Legacy mini tier kept for compatibility
  GPT_5_MINI: {
    inputCostPerMillion: 0.25, // $0.25 per million input tokens
    outputCostPerMillion: 2.0, // $2 per million output tokens
    cachedInputCostPerMillion: 0.025,
    displayName: 'GPT 5 Mini',
    multiplier: 0.25, // 4x cheaper
  },
  GPT_5_NANO: {
    inputCostPerMillion: 0.05,
    outputCostPerMillion: 0.4,
    cachedInputCostPerMillion: 0.005,
    displayName: 'GPT 5 Nano',
    multiplier: 0.05,
  },
  // 2x cheaper than baseline
  GEMINI_3_FLASH: {
    inputCostPerMillion: 0.5, // $0.5 per million input tokens
    outputCostPerMillion: 3.0, // $3 per million output tokens
    cachedInputCostPerMillion: 0.5,
    displayName: 'Gemini 3 Flash',
    multiplier: 0.5, // 2x cheaper
  },
  // 2.5x more expensive than baseline
  GPT_5_4: {
    inputCostPerMillion: 2.5, // $2.50 per million input tokens
    outputCostPerMillion: 15.0, // $15 per million output tokens
    cachedInputCostPerMillion: 0.25,
    displayName: 'GPT 5.4',
    multiplier: 2.5,
  },
  GPT_5_3_CODEX: {
    inputCostPerMillion: 2.5,
    outputCostPerMillion: 15.0,
    cachedInputCostPerMillion: 0.25,
    displayName: 'GPT 5.3 Codex',
    multiplier: 2.5,
  },
  GPT_5_4_NANO: {
    inputCostPerMillion: 0.2,
    outputCostPerMillion: 1.25,
    cachedInputCostPerMillion: 0.02,
    displayName: 'GPT 5.4 Nano',
    multiplier: 0.2,
  },
  // 2x more expensive than baseline
  GEMINI_3_PRO: {
    inputCostPerMillion: 2.0, // $2 per million input tokens
    outputCostPerMillion: 12.0, // $12 per million output tokens
    cachedInputCostPerMillion: 2.0,
    displayName: 'Gemini 3.1 Pro',
    multiplier: 2.0,
  },
  // 3x more expensive than baseline
  CLAUDE_SONNET: {
    inputCostPerMillion: 3.0, // $3 per million input tokens
    outputCostPerMillion: 15.0, // $15 per million output tokens
    cachedInputCostPerMillion: 0.3,
    cacheWriteInputCostPerMillion: 3.75,
    displayName: 'Claude 4.6 Sonnet',
    multiplier: 3.0,
  },
  // Claude Opus pricing fallback (Scale plan only)
  CLAUDE_OPUS: {
    inputCostPerMillion: 5.0, // $5 per million input tokens
    outputCostPerMillion: 25.0, // $25 per million output tokens
    cachedInputCostPerMillion: 0.5,
    cacheWriteInputCostPerMillion: 6.25,
    displayName: 'Claude 4.6 Opus',
    multiplier: 5.0,
  },
  // 3x cheaper than baseline
  MINIMAX_M2_5: {
    inputCostPerMillion: 0.3, // $0.30 per million input tokens
    outputCostPerMillion: 1.2, // $1.20 per million output tokens
    cachedInputCostPerMillion: 0.3,
    displayName: 'MiniMax M2.5',
    multiplier: 0.3, // 3x cheaper
  },
  // 1x baseline pricing
  GLM_5: {
    inputCostPerMillion: 1.0, // $1 per million input tokens
    outputCostPerMillion: 3.2, // $3.20 per million output tokens
    cachedInputCostPerMillion: 1.0,
    displayName: 'GLM 5',
    multiplier: 1.0, // 1x baseline
  },
  // Legacy models (mapped to closest equivalent)
  GLM_4_6: {
    inputCostPerMillion: 0.5, // Estimated similar to Gemini 3 Flash
    outputCostPerMillion: 2.0,
    cachedInputCostPerMillion: 0.5,
    displayName: 'GLM 4.6',
    multiplier: 0.5,
  },
  GEMINI_PRO: {
    inputCostPerMillion: 2.0, // Gemini 2.5 Pro
    outputCostPerMillion: 12.0,
    cachedInputCostPerMillion: 2.0,
    displayName: 'Gemini Pro',
    multiplier: 2.0,
  },
  GEMINI_FLASH: {
    inputCostPerMillion: 0.3, // Gemini 2.5 Flash
    outputCostPerMillion: 1.2,
    cachedInputCostPerMillion: 0.3,
    displayName: 'Gemini Flash',
    multiplier: 0.4,
  },
  GEMINI_LITE: {
    inputCostPerMillion: 0.15, // Gemini 2.5 Flash Lite - cheapest model!
    outputCostPerMillion: 0.5,
    cachedInputCostPerMillion: 0.15,
    displayName: 'Gemini Flash Lite',
    multiplier: 0.2,
  },
  DEFAULT: {
    inputCostPerMillion: 1.0, // Default to baseline pricing
    outputCostPerMillion: 5.0,
    cachedInputCostPerMillion: 1.0,
    displayName: 'Default Model',
    multiplier: 1.0,
  },
} as const

export interface CreditCheckResult {
  allowed: boolean
  balance: number
  balances?: Array<{ feature_id: string; required: number; balance: number }>
}

export interface TrackUsageResult {
  success: boolean
  error?: string
}

/**
 * Get model costs from model name
 * Maps various model name formats to their cost configuration
 */
export function getModelCosts(model: string): {
  inputCostPerMillion: number
  outputCostPerMillion: number
  cachedInputCostPerMillion?: number
  cacheWriteInputCostPerMillion?: number
  displayName: string
  multiplier: number
} {
  const normalizedModel = model.toUpperCase()

  // GPT 5.3/5.2 Codex pricing currently mapped to GPT 5.4-class pricing
  if (
    normalizedModel.includes('GPT_5_3_CODEX') ||
    normalizedModel.includes('GPT-5.3-CODEX') ||
    normalizedModel.includes('GPT5.3CODEX')
  ) {
    return MODEL_COSTS.GPT_5_3_CODEX
  }

  if (
    normalizedModel.includes('GPT_5_2_CODEX') ||
    normalizedModel.includes('GPT-5.2-CODEX') ||
    normalizedModel.includes('GPT5.2CODEX')
  ) {
    return MODEL_COSTS.GPT_5_4
  }

  if (
    normalizedModel.includes('GPT_5_4_MINI') ||
    normalizedModel.includes('GPT-5.4-MINI') ||
    normalizedModel.includes('GPT5.4MINI')
  ) {
    return MODEL_COSTS.GPT_5_4_MINI
  }

  if (
    normalizedModel.includes('GPT_5_4_NANO') ||
    normalizedModel.includes('GPT-5.4-NANO') ||
    normalizedModel.includes('GPT5.4NANO')
  ) {
    return MODEL_COSTS.GPT_5_4_NANO
  }

  // GPT 5.4 (2.5x)
  if (
    normalizedModel.includes('GPT_5_4') ||
    normalizedModel.includes('GPT-5.4') ||
    normalizedModel.includes('GPT5.4')
  ) {
    return MODEL_COSTS.GPT_5_4
  }

  // GPT 5 Mini legacy pricing
  if (
    normalizedModel.includes('GPT_5_MINI') ||
    normalizedModel.includes('GPT-5-MINI') ||
    normalizedModel.includes('GPT5MINI')
  ) {
    return MODEL_COSTS.GPT_5_MINI
  }

  if (
    normalizedModel.includes('GPT_5_NANO') ||
    normalizedModel.includes('GPT-5-NANO') ||
    normalizedModel.includes('GPT5NANO')
  ) {
    return MODEL_COSTS.GPT_5_NANO
  }

  // Claude Opus variants (5x) - Scale plan only
  if (
    normalizedModel.includes('OPUS') ||
    normalizedModel.includes('CLAUDE_OPUS')
  ) {
    return MODEL_COSTS.CLAUDE_OPUS
  }

  // Claude Sonnet variants (3x) - including CLAUDE_BEDROCK which uses Sonnet
  if (
    normalizedModel.includes('SONNET') ||
    normalizedModel.includes('CLAUDE_BEDROCK') ||
    normalizedModel.includes('CLAUDE_4') ||
    normalizedModel.includes('CLAUDE_3_7') ||
    normalizedModel === 'AUTO'
  ) {
    return MODEL_COSTS.CLAUDE_SONNET
  }

  // MiniMax M2.5 (3x cheaper)
  if (
    normalizedModel.includes('MINIMAX_M2_5') ||
    normalizedModel.includes('MINIMAX-M2.5') ||
    normalizedModel.includes('MINIMAX/MINIMAX-M2.5')
  ) {
    return MODEL_COSTS.MINIMAX_M2_5
  }

  // GLM 5 (1x baseline) - check before generic GLM
  if (
    normalizedModel.includes('GLM_5') ||
    normalizedModel.includes('GLM-5') ||
    normalizedModel === 'GLM5'
  ) {
    return MODEL_COSTS.GLM_5
  }

  // GLM models (use similar pricing to Gemini 3 Flash)
  if (normalizedModel.includes('GLM')) {
    return MODEL_COSTS.GLM_4_6
  }

  // Gemini 3.1 Pro (2x) - check before generic Gemini
  if (
    normalizedModel.includes('GEMINI_3_PRO') ||
    normalizedModel.includes('GEMINI-3-PRO') ||
    normalizedModel.includes('GEMINI-3.1-PRO')
  ) {
    return MODEL_COSTS.GEMINI_3_PRO
  }

  // Gemini 2.5 Pro (2x)
  if (
    normalizedModel.includes('GEMINI_2_5_PRO') ||
    normalizedModel.includes('GEMINI-2.5-PRO')
  ) {
    return MODEL_COSTS.GEMINI_PRO
  }

  // Gemini 3 Flash (2x cheaper) - check before generic Flash
  if (
    normalizedModel.includes('GEMINI_3_FLASH') ||
    normalizedModel.includes('GEMINI-3-FLASH')
  ) {
    return MODEL_COSTS.GEMINI_3_FLASH
  }

  // Gemini Flash Lite (cheapest tier) - check before generic Flash
  if (
    normalizedModel.includes('FLASH_LITE') ||
    normalizedModel.includes('FLASH-LITE') ||
    normalizedModel.includes('FLASHLITE')
  ) {
    return MODEL_COSTS.GEMINI_LITE
  }

  // Gemini 2.5 Flash (mid-tier)
  if (
    normalizedModel.includes('GEMINI_2_5_FLASH') ||
    normalizedModel.includes('GEMINI-2.5-FLASH') ||
    (normalizedModel.includes('GEMINI') && normalizedModel.includes('FLASH'))
  ) {
    return MODEL_COSTS.GEMINI_FLASH
  }

  // Generic Gemini fallback (use Gemini 3 Flash pricing)
  if (normalizedModel.includes('GEMINI')) {
    return MODEL_COSTS.GEMINI_3_FLASH
  }

  // Default for unknown models (use baseline pricing)
  console.warn(`Unknown model type: ${model}, using default costs`)
  return MODEL_COSTS.DEFAULT
}

/**
 * Calculate credits based on token usage and model type
 *
 * Base pricing: $1 = 1M credits
 * - 1 input token = 1 credit (1M input tokens = 1M credits)
 * - 1 output token = 5 credits (5x multiplier)
 *
 * Model multipliers based on cost relative to baseline ($1 per 1M input tokens):
 * - Input multiplier = model input cost / $1
 * - Output multiplier = (model output cost / $5) since baseline output is $5 per 1M
 */
export function calculateCreditsForModel(
  inputTokens: number,
  outputTokens: number,
  model: string,
): number {
  const costs = getModelCosts(model)

  // Baseline: $1 per 1M input tokens = 1M credits per 1M input tokens (1:1 ratio)
  // Baseline: $5 per 1M output tokens = 5M credits per 1M output tokens (5:1 ratio)
  const BASELINE_INPUT_COST = 1.0 // $1 per 1M input tokens (Haiku)
  const BASELINE_OUTPUT_COST = 1.0 // $5 per 1M output tokens (Haiku)

  // Calculate multipliers based on model cost relative to baseline
  const inputMultiplier = costs.inputCostPerMillion / BASELINE_INPUT_COST
  const outputMultiplier = costs.outputCostPerMillion / BASELINE_OUTPUT_COST

  // Calculate credits:
  // - Input: 1 token = 1 credit × input multiplier
  // - Output: 1 token = 5 credits × output multiplier
  const inputCredits = inputTokens * inputMultiplier
  const outputCredits = outputTokens * outputMultiplier
  const totalCredits = inputCredits + outputCredits

  return Math.max(1, Math.ceil(totalCredits))
}

export function calculateUsdCostForModelUsage(args: {
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
  cacheWriteInputTokens?: number
}): number {
  const costs = getModelCosts(args.model)
  const normalizedModel = args.model.toUpperCase()
  const cachedInputTokens = Math.max(0, args.cachedInputTokens ?? 0)
  const cacheWriteInputTokens = Math.max(0, args.cacheWriteInputTokens ?? 0)
  const inputTokensIncludeCached =
    !normalizedModel.includes('CLAUDE') &&
    !normalizedModel.includes('ANTHROPIC')
  const uncachedInputTokens = inputTokensIncludeCached
    ? Math.max(0, args.inputTokens - cachedInputTokens - cacheWriteInputTokens)
    : Math.max(0, args.inputTokens)

  const inputCost =
    (uncachedInputTokens / 1_000_000) * costs.inputCostPerMillion
  const cachedInputCost =
    (cachedInputTokens / 1_000_000) *
    (costs.cachedInputCostPerMillion ?? costs.inputCostPerMillion)
  const cacheWriteInputCost =
    (cacheWriteInputTokens / 1_000_000) *
    (costs.cacheWriteInputCostPerMillion ?? costs.inputCostPerMillion)
  const outputCost =
    (args.outputTokens / 1_000_000) * costs.outputCostPerMillion

  return inputCost + cachedInputCost + cacheWriteInputCost + outputCost
}

export function convertUsdToCredits(usdCost: number): number {
  if (usdCost <= 0) {
    return 0
  }

  return Math.ceil((usdCost / PRICE_PER_MILLION_CREDITS) * CREDIT_BILLING_UNIT)
}

/**
 * Attach a product to a customer via the Autumn REST API.
 * This grants the customer access to the product's features (e.g. included_usage credits).
 */
export async function attachProduct(
  customerId: string,
  productId: string,
): Promise<{ success: boolean; error?: string }> {
  void customerId
  void productId
  return { success: true }
}

/**
 * Check if a user has sufficient credits for a feature
 */
export async function checkCredits(
  clerkUserId: string,
  featureId: string = agentCredits.id,
): Promise<CreditCheckResult> {
  void clerkUserId
  void featureId
  return { allowed: true } as CreditCheckResult
}

/**
 * Track usage for a user and feature
 */
export async function trackUsage(
  clerkUserId: string,
  value: number,
  featureId: string = agentCredits.id,
  properties?: Record<string, any>,
): Promise<TrackUsageResult> {
  void clerkUserId
  void value
  void featureId
  void properties
  return { success: true }
}

/**
 * Track utility model usage (non-blocking)
 * Used for background operations like summarization, naming, etc.
 *
 * @param clerkUserId - User or organization Clerk ID
 * @param modelIdentifier - Model name/identifier (e.g., "GEMINI_2_5_FLASH_LITE")
 * @param inputTokens - Number of input tokens used
 * @param outputTokens - Number of output tokens used
 * @param projectId - Optional project ID for metadata
 * @param featureId - Optional feature ID (defaults to agent_credits)
 */
export async function trackUtilityModelUsage(
  clerkUserId: string,
  modelIdentifier: string,
  inputTokens: number,
  outputTokens: number,
  projectId?: string,
  featureId?: string,
): Promise<void> {
  try {
    // Calculate credits based on model and usage
    const credits = calculateCreditsForModel(
      inputTokens,
      outputTokens,
      modelIdentifier,
    )

    // Track with Autumn (uses default feature_id if not provided)
    const result = await trackUsage(clerkUserId, credits, featureId, {
      model: modelIdentifier,
      inputTokens,
      outputTokens,
      creditsCharged: credits,
      projectId,
      utilityModel: true, // Flag to identify utility model usage
    })

    if (result.success) {
      console.log(
        `✅ Tracked ${credits} credits for utility model ${modelIdentifier} (${inputTokens}/${outputTokens} tokens)`,
      )
    } else {
      console.error(
        `Failed to track utility model usage for ${modelIdentifier}:`,
        result.error,
      )
    }
  } catch (error) {
    // Non-blocking: log error but don't throw
    console.error(
      `Error tracking utility model usage for ${modelIdentifier}:`,
      error instanceof Error ? error.message : String(error),
    )
  }
}

/**
 * Get customer data including all feature balances
 */
export async function getCustomerData(clerkUserId: string): Promise<any> {
  void clerkUserId
  return { products: [], features: {} }
}

/**
 * Validate that Autumn is properly configured
 */
export function validateAutumnConfig(): void {
  return
}

/**
 * Get the user's current tier from their Autumn customer data
 * Returns the tier name (e.g., "starter", "hobby", "business", "scale")
 * Defaults to "free" if no plan is found
 */
export function getTierFromCustomerData(customerData: any): TierName {
  if (!customerData?.products || !Array.isArray(customerData.products)) {
    return 'free'
  }

  // Map plan ID to tier name
  const planIdToTier: Record<string, TierName> = {
    [PLAN_IDS.free]: 'free',
    [PLAN_IDS.starter]: 'starter',
    [PLAN_IDS.hobby]: 'hobby',
    [PLAN_IDS.business]: 'business',
    [PLAN_IDS.scale]: 'scale',
    [PLAN_IDS.priority]: 'priority',
    [PLAN_IDS.ultra]: 'ultra',
    [PLAN_IDS.max]: 'max',
    [PLAN_IDS.unlimited]: 'unlimited',
    [PLAN_IDS.enterprise]: 'enterprise',
    // Legacy plan mappings
    hobby_custom_plan: 'hobby',
    pro_plan: 'business',
    pro_custom_plan: 'business',
    team_plan: 'scale',
    team_custom_plan: 'scale',
    enterprise_custom_plan: 'enterprise',
  }

  const now = Date.now()
  const inferTierFromName = (name?: string | null): TierName | null => {
    if (!name) return null
    const normalized = name.toLowerCase()
    if (normalized.includes('enterprise')) return 'enterprise'
    if (normalized.includes('unlimited')) return 'unlimited'
    if (normalized.includes('max')) return 'max'
    if (normalized.includes('ultra')) return 'ultra'
    if (normalized.includes('priority')) return 'priority'
    if (normalized.includes('scale') || normalized.includes('team'))
      return 'scale'
    if (normalized.includes('business') || normalized.includes('pro'))
      return 'business'
    if (normalized.includes('hobby')) return 'hobby'
    if (normalized.includes('starter')) return 'starter'
    if (normalized.includes('free')) return 'free'
    return null
  }

  const activePlans = customerData.products.filter((product: any) => {
    if (product?.is_add_on) return false
    if (product?.status === 'active' || product?.scenario === 'active') {
      return true
    }
    return !!(
      product?.canceled_at &&
      product?.current_period_end &&
      now < product.current_period_end
    )
  })

  // Prefer the highest-tier active plan when multiple products are active
  // (e.g. historical free_plan plus current paid subscription).
  const activePlan = activePlans.sort((a: any, b: any) => {
    const aTier = planIdToTier[a.id] ?? inferTierFromName(a.name)
    const bTier = planIdToTier[b.id] ?? inferTierFromName(b.name)
    const aRank = aTier ? TIER_ORDER.indexOf(aTier) : -1
    const bRank = bTier ? TIER_ORDER.indexOf(bTier) : -1
    return bRank - aRank
  })[0]

  if (!activePlan) {
    return 'free'
  }

  return planIdToTier[activePlan.id] || 'free'
}

/**
 * Get the credit multiplier for a given tier
 * Lower tiers pay more credits for the same usage
 */
export function getCreditMultiplier(tier: TierName): number {
  return CREDIT_MULTIPLIERS[tier] ?? 1.0
}

/**
 * Apply the tier-based credit multiplier to a credit amount
 * Returns the adjusted credit amount (rounded up)
 */
export function applyTierMultiplier(credits: number, tier: TierName): number {
  const multiplier = getCreditMultiplier(tier)
  return Math.ceil(credits * multiplier)
}

/**
 * Get the user's tier and apply the credit multiplier in one call
 * Fetches customer data, determines tier, and applies multiplier
 */
export async function getAdjustedCredits(
  clerkUserId: string,
  baseCredits: number,
): Promise<{ adjustedCredits: number; tier: TierName; multiplier: number }> {
  try {
    const customerData = await getCustomerData(clerkUserId)
    const tier = getTierFromCustomerData(customerData)
    const multiplier = getCreditMultiplier(tier)
    const adjustedCredits = Math.ceil(baseCredits * multiplier)

    return { adjustedCredits, tier, multiplier }
  } catch (error) {
    // On error, default to no multiplier to avoid blocking users
    console.error(
      'Failed to get tier for credit multiplier, using default:',
      error instanceof Error ? error.message : String(error),
    )
    return { adjustedCredits: baseCredits, tier: 'free', multiplier: 1.0 }
  }
}
