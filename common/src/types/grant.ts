export type GrantType = 'free' | 'referral' | 'purchase' | 'admin' | 'organization';

export const GrantTypeValues = [
  'free',
  'referral',
  'purchase',
  'admin',
  'organization',
] as const;
