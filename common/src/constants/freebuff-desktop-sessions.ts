import {
  type FreebuffAccessTier,
  type FreebuffDesktopConcurrency,
} from './freebuff-model-entitlements'
import {
  FREEBUFF_GEMINI_38_FLASH_MODEL_ID,
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  freebuffModelIdMatches,
} from './freebuff-models'

/** Models that always use constrained Desktop concurrency. */
const FREEBUFF_DESKTOP_SLOT_BOUND_MODEL_IDS = [
  // Every quota-metered Desktop model must stay slot-bound until admit stamps
  // identify the tab; same-millisecond parallel admits otherwise pair
  // ambiguously when usage is finalized.
  FREEBUFF_GPT_5_6_LUNA_MODEL_ID,
  FREEBUFF_GEMINI_38_FLASH_MODEL_ID,
] as const

const FREEBUFF_DESKTOP_CONCURRENCY_LIMITS = {
  free: { 'slot-bound': 1, 'multi-tab': 3 },
  subscriber: { 'slot-bound': 3, 'multi-tab': 8 },
} as const

export function freebuffDesktopConcurrencyLimits(
  accessTier: FreebuffAccessTier | null | undefined,
  hasPaidPlan: boolean,
): Record<FreebuffDesktopConcurrency, number> {
  if (accessTier === 'limited' && !hasPaidPlan) {
    return { 'slot-bound': 1, 'multi-tab': 0 }
  }
  return hasPaidPlan
    ? FREEBUFF_DESKTOP_CONCURRENCY_LIMITS.subscriber
    : FREEBUFF_DESKTOP_CONCURRENCY_LIMITS.free
}

export function getFreebuffDesktopConcurrency(
  model: string,
  accessTier: FreebuffAccessTier | null | undefined,
  hasPaidPlan = false,
): FreebuffDesktopConcurrency {
  if (
    FREEBUFF_DESKTOP_SLOT_BOUND_MODEL_IDS.some((modelId) =>
      freebuffModelIdMatches(model, modelId),
    )
  ) {
    return 'slot-bound'
  }
  return accessTier === 'limited' && !hasPaidPlan ? 'slot-bound' : 'multi-tab'
}

export function occupiesFreebuffDesktopSlot(
  model: string,
  accessTier: FreebuffAccessTier | null | undefined,
  hasPaidPlan = false,
): boolean {
  return (
    getFreebuffDesktopConcurrency(model, accessTier, hasPaidPlan) ===
    'slot-bound'
  )
}

/** Idle time after which Desktop may reclaim a constrained session slot. */
export const FREEBUFF_DESKTOP_IDLE_RELEASE_MS = 10 * 60 * 1000
