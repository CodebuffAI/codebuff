export type GrantType = 'free' | 'referral' | 'purchase' | 'admin'

export interface CreditBalance {
  totalRemaining: number
  totalDebt: number
  netBalance: number
  breakdown: Partial<Record<GrantType, number>>
  principals: Partial<Record<GrantType, number>>
}

export interface CreditUsageAndBalance {
  usageThisCycle: number
  balance: CreditBalance
}

export interface CreditConsumptionResult {
  consumed: number
  fromPurchased: number
}