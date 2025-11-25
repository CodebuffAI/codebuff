import { UserState, getUserState } from '@codebuff/common/old-constants'

export const HIGH_CREDITS_THRESHOLD = 1000
export const MEDIUM_CREDITS_THRESHOLD = 100

export type BannerColorLevel = 'success' | 'warning' | 'error'

/**
 * Determines the appropriate color level for the usage banner based on credit balance.
 *
 * Color mapping:
 * - success (green): >= 1000 credits
 * - warning (yellow): 100-999 credits OR balance is null/unknown
 * - error (red): < 100 credits
 */
export function getBannerColorLevel(balance: number | null): BannerColorLevel {
  if (balance === null) {
    return 'warning'
  }
  if (balance >= HIGH_CREDITS_THRESHOLD) {
    return 'success'
  }
  if (balance >= MEDIUM_CREDITS_THRESHOLD) {
    return 'warning'
  }
  return 'error'
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
export function generateUsageBannerText(options: UsageBannerTextOptions): string {
  const { sessionCreditsUsed, remainingBalance, next_quota_reset, today = new Date() } = options

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

  return text
}

export interface AutoShowDecision {
  shouldShow: boolean
  newWarningState: UserState | null
}

/**
 * Determines whether the usage banner should auto-show based on credit state changes.
 *
 * The banner auto-shows when:
 * - User is not in a chain (isChainInProgress = false)
 * - User is authenticated (hasAuthToken = true)
 * - User has credit data available (remainingBalance !== null)
 * - User enters a new low-credit state that hasn't been warned about yet
 */
export function shouldAutoShowBanner(
  isChainInProgress: boolean,
  hasAuthToken: boolean,
  remainingBalance: number | null,
  lastWarnedState: UserState | null,
): AutoShowDecision {
  // Don't show during active chains
  if (isChainInProgress) {
    return { shouldShow: false, newWarningState: lastWarnedState }
  }

  // Don't show for unauthenticated users
  if (!hasAuthToken) {
    return { shouldShow: false, newWarningState: lastWarnedState }
  }

  // Don't show if we don't have balance data
  if (remainingBalance === null) {
    return { shouldShow: false, newWarningState: lastWarnedState }
  }

  const userState = getUserState(true, remainingBalance)

  // Clear warning state if user is in good standing
  if (userState === UserState.GOOD_STANDING) {
    return { shouldShow: false, newWarningState: null }
  }

  // Show banner for new warning states
  const isWarningState =
    userState === UserState.ATTENTION_NEEDED ||
    userState === UserState.CRITICAL ||
    userState === UserState.DEPLETED

  if (isWarningState && lastWarnedState !== userState) {
    return { shouldShow: true, newWarningState: userState }
  }

  // Already warned about this state
  return { shouldShow: false, newWarningState: lastWarnedState }
}
