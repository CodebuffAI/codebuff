export type GrantType =
  | 'free'
  | 'referral'
  | 'subscription'
  | 'purchase'
  | 'admin'
  | 'organization'
  | 'ad' // Credits earned from ads (impressions, clicks, acquisitions, etc.)

export const GrantTypeValues = [
  'free',
  'referral',
  'subscription',
  'purchase',
  'admin',
  'organization',
  'ad',
] as const
