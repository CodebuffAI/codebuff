import type { GrantType } from '@codebuff/common/types/grant'

export const GRANT_PRIORITIES: Record<GrantType, number> = {
  free: 20,
  ad: 30, // Ad credits consumed after free, before referral
  referral: 40,
  admin: 60,
  organization: 70,
  purchase: 80,
} as const
