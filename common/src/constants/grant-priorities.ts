import type { GrantType } from '@codebuff/common/types/grant'

export const GRANT_PRIORITIES: Record<GrantType, number> = {
  free: 20,
  referral: 30,
  ad: 40,
  admin: 60,
  organization: 70,
  purchase: 80,
} as const
