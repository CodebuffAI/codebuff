import { GrantType } from '../db/schema'

export const GRANT_PRIORITIES: Record<GrantType, number> = {
  free: 20,
  referral: 40,
  admin: 60,
  purchase: 80,
} as const
