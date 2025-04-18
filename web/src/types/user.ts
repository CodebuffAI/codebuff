export interface UserProfile {
  id: string
  name: string | null
  email: string
  image: string | null
  stripe_customer_id: string | null
  stripe_price_id: string | null
  handle: string | null
  referral_code: string | null
  auto_topup_enabled: boolean
  auto_topup_threshold: number | null
  auto_topup_amount: number | null
  auto_topup_blocked_reason: string | null
}
