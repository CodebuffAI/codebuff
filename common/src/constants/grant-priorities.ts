import type { GrantType } from '@codebuff/common/types/grant'

// Lower = consumed first
export const GRANT_PRIORITIES: Record<GrantType, number> = {
  subscription: 10,
  free: 20,
  referral_legacy: 30, // Legacy recurring referrals (renews monthly, consumed first)
  ad: 40,
  referral: 50, // One-time referrals (never expires, preserved longer)
  admin: 60,
  organization: 70,
  purchase: 80,
} as const
