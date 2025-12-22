export const HIGH_CREDITS_THRESHOLD = 1000
export const MEDIUM_CREDITS_THRESHOLD = 500
export const LOW_CREDITS_THRESHOLD = 100

export type BannerColorLevel = 'success' | 'warning' | 'error'

export type CreditTier = 'high' | 'medium' | 'low' | 'out'

export type ThresholdInfo = {
  tier: CreditTier
  colorLevel: BannerColorLevel
  threshold: number
}

/**
 * Gets comprehensive threshold information for a given credit balance.
 * This is the single source of truth for credit tier classification.
 */
export function getThresholdInfo(balance: number | null): ThresholdInfo {
  if (balance === null) {
    return {
      tier: 'medium',
      colorLevel: 'warning',
      threshold: MEDIUM_CREDITS_THRESHOLD,
    }
  }
  if (balance >= HIGH_CREDITS_THRESHOLD) {
    return {
      tier: 'high',
      colorLevel: 'success',
      threshold: HIGH_CREDITS_THRESHOLD,
    }
  }
  if (balance >= MEDIUM_CREDITS_THRESHOLD) {
    return {
      tier: 'medium',
      colorLevel: 'warning',
      threshold: MEDIUM_CREDITS_THRESHOLD,
    }
  }
  if (balance >= LOW_CREDITS_THRESHOLD) {
    return {
      tier: 'low',
      colorLevel: 'warning',
      threshold: LOW_CREDITS_THRESHOLD,
    }
  }
  return { tier: 'out', colorLevel: 'error', threshold: 0 }
}

/**
 * Determines the appropriate color level for the usage banner based on credit balance.
 *
 * Color mapping:
 * - success (green): >= 1000 credits
 * - warning (yellow): 100-999 credits OR balance is null/unknown
 * - error (red): < 100 credits
 *
 * @deprecated Use getThresholdInfo(balance).colorLevel instead
 */
export function getBannerColorLevel(balance: number | null): BannerColorLevel {
  return getThresholdInfo(balance).colorLevel
}

export interface UsageBannerTextOptions {
  sessionCreditsUsed: number
  remainingBalance: number | null
  next_quota_reset: string | null
  /** For testing purposes, allows overriding "today" */
  today?: Date
}

/**
 * Generates loading text for the usage banner while data is being fetched.
 */
export function generateLoadingBannerText(sessionCreditsUsed: number): string {
  return `Session usage: ${sessionCreditsUsed.toLocaleString()}. Loading credit balance...`
}

/**
 * Generates the text content for the usage banner.
 */
export function generateUsageBannerText(
  options: UsageBannerTextOptions,
): string {
  const {
    sessionCreditsUsed,
    remainingBalance,
    next_quota_reset,
    today = new Date(),
  } = options

  let text = `Session usage: ${sessionCreditsUsed.toLocaleString()}`

  if (remainingBalance !== null) {
    text += `. Credits remaining: ${remainingBalance.toLocaleString()}`
  }

  if (next_quota_reset) {
    const resetDate = new Date(next_quota_reset)
    const isToday = resetDate.toDateString() === today.toDateString()

    const dateDisplay = isToday
      ? resetDate.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : resetDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })

    text += `. Free credits renew ${dateDisplay}`
  }

  text += `. See more`

  return text
}

/**
 * Gets the threshold tier for a given balance.
 * Returns null if balance is above all thresholds.
 */
function getThresholdTier(balance: number): number | null {
  if (balance < LOW_CREDITS_THRESHOLD) return LOW_CREDITS_THRESHOLD
  if (balance < MEDIUM_CREDITS_THRESHOLD) return MEDIUM_CREDITS_THRESHOLD
  if (balance < HIGH_CREDITS_THRESHOLD) return HIGH_CREDITS_THRESHOLD
  return null
}

export interface AutoShowDecision {
  shouldShow: boolean
  newWarningThreshold: number | null
}

/**
 * Determines whether the usage banner should auto-show based on credit threshold crossings.
 *
 * The banner auto-shows when:
 * - User is not in a chain (isChainInProgress = false)
 * - User is authenticated (hasAuthToken = true)
 * - User has credit data available (remainingBalance !== null)
 * - User crosses a new threshold (1000, 500, or 100) that hasn't been warned about yet
 * - User does NOT have auto top-up enabled (unless truly out of credits <= 0)
 */
export function shouldAutoShowBanner(
  isChainInProgress: boolean,
  hasAuthToken: boolean,
  remainingBalance: number | null,
  lastWarnedThreshold: number | null,
  autoTopupEnabled: boolean = false,
): AutoShowDecision {
  // Don't show during active chains
  if (isChainInProgress) {
    return { shouldShow: false, newWarningThreshold: lastWarnedThreshold }
  }

  // Don't show for unauthenticated users
  if (!hasAuthToken) {
    return { shouldShow: false, newWarningThreshold: lastWarnedThreshold }
  }

  // Don't show if we don't have balance data
  if (remainingBalance === null) {
    return { shouldShow: false, newWarningThreshold: lastWarnedThreshold }
  }

  // For users with auto top-up enabled, only show if truly out of credits (<= 0)
  // Auto top-up users want to "set and forget" - don't bother them with threshold warnings
  if (autoTopupEnabled && remainingBalance > 0) {
    return { shouldShow: false, newWarningThreshold: null }
  }

  const currentThreshold = getThresholdTier(remainingBalance)

  // Clear warning state if user is back above all thresholds
  if (currentThreshold === null) {
    return { shouldShow: false, newWarningThreshold: null }
  }

  // Show banner if we've crossed a new threshold we haven't warned about
  // A "new" threshold means either:
  // 1. We haven't warned about any threshold yet (lastWarnedThreshold === null)
  // 2. The current threshold is lower than what we last warned about
  const isNewThreshold =
    lastWarnedThreshold === null || currentThreshold < lastWarnedThreshold

  if (isNewThreshold) {
    return { shouldShow: true, newWarningThreshold: currentThreshold }
  }

  // Already warned about this threshold
  return { shouldShow: false, newWarningThreshold: lastWarnedThreshold }
}
