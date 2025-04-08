import { GrantType } from '../db/schema'

export const GRANT_PRIORITIES: Record<GrantType, number> = {
  free: 20,
  referral: 40,
  rollover: 60,
  purchase: 80,
  admin: 100,
} as const