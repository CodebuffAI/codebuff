export type GrantType =
  | 'free'
  | 'referral'
  | 'purchase'
  | 'admin'
  | 'organization'
  | 'ad' // Credits earned from ads (impressions, clicks, acquisitions, etc.)

export const GrantTypeValues = [
  'free',
  'referral',
  'purchase',
  'admin',
  'organization',
  'ad',
] as const
