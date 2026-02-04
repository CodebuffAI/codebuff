export const PROFIT_MARGIN = 0.055

export const REQUEST_CREDIT_SHOW_THRESHOLD = 1
export const MAX_DATE = new Date(86399999999999)
export const BILLING_PERIOD_DAYS = 30
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60 // 30 days
export const SESSION_TIME_WINDOW_MS = 30 * 60 * 1000 // 30 minutes - used for matching sessions created around fingerprint creation
export const CREDITS_REFERRAL_BONUS = 500
export const AFFILIATE_USER_REFFERAL_LIMIT = 500

// Default number of free credits granted per cycle
export const DEFAULT_FREE_CREDITS_GRANT = 500

// Credit pricing configuration
export const CREDIT_PRICING = {
  CENTS_PER_CREDIT: 1, // 1 credit = 1 cent = $0.01
  MIN_PURCHASE_CREDITS: 100, // $1.00 minimum
  DISPLAY_RATE: '$0.01 per credit',
} as const
