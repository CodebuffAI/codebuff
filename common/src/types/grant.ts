export type GrantType =
  | 'free'
  | 'referral'
  | 'referral_legacy'
  | 'purchase'
  | 'admin'
  | 'organization'
  | 'ad' // Credits earned from ads (impressions, clicks, acquisitions, etc.)

export const GrantTypeValues = [
  'free',
  'referral',
  'referral_legacy',
  'purchase',
  'admin',
  'organization',
  'ad',
] as const
