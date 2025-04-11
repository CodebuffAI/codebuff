export type TUser = {
  id: string
  email: string
  name: string
  image: string
}

export type UserProfile = TUser & {
  handle?: string | null
  referral_code?: string | null
  auto_topup_enabled?: boolean
  auto_topup_threshold?: number | null
  auto_topup_amount?: number | null
  auto_topup_blocked_reason?: string | null
}
