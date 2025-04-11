import { GrantType } from '../db/schema'

export const GRANT_PRIORITIES: Record<GrantType, number> = {
  free: 20,
  referral: 40,
  purchase: 60,
  admin: 80,
} as const
