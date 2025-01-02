import { UsageLimits } from '../constants'

export type PlanName = 'Free' | 'Pro' | 'Moar Pro' | 'Team'

export interface InvoiceLineItem {
  amount: number
  description: string
  period?: {
    start: number
    end: number
  }
  proration: boolean
}

export interface SubscriptionPreviewResponse {
  // Base rates
  currentMonthlyRate: number
  newMonthlyRate: number
  daysRemainingInBillingPeriod: number
  prorationDate: number

  // Line items from Stripe preview
  lineItems: InvoiceLineItem[]

  // Overage details
  overageCredits: number
  currentOverageAmount: number
  newOverageAmount: number
  currentOverageRate: number
  newOverageRate: number
  currentQuota: number
}

// Convert UsageLimits enum to plan name
export const getPlanNameFromUsageLimit = (limit: UsageLimits): PlanName => {
  switch (limit) {
    case UsageLimits.FREE:
      return 'Free'
    case UsageLimits.PRO:
      return 'Pro'
    case UsageLimits.MOAR_PRO:
      return 'Moar Pro'
    default:
      return 'Free'
  }
}
