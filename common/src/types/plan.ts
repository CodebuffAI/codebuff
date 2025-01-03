import { UsageLimits } from '../constants'

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
  newOverageCredits: number
  currentOverageAmount: number
  newOverageAmount: number
  currentOverageRate: number
  newOverageRate: number
  currentQuota: number
  creditsUsed: number
}
