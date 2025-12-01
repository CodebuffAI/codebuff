import type { Logger } from './logger'
import type { ErrorOr } from '../../util/error'

export type GetUserUsageDataFn = (params: {
  userId: string
  logger: Logger
}) => Promise<{
  usageThisCycle: number
  balance: {
    totalRemaining: number
    totalDebt: number
    netBalance: number
    breakdown: Record<string, number>
  }
  nextQuotaReset: string
  autoTopupTriggered?: boolean
  autoTopupEnabled?: boolean
}>

export type ConsumeCreditsWithFallbackFn = (params: {
  userId: string
  creditsToCharge: number
  repoUrl?: string | null
  context: string // Description of what the credits are for (e.g., 'web search', 'documentation lookup')
  logger: Logger
}) => Promise<ErrorOr<CreditFallbackResult>>

export type CreditFallbackResult = {
  organizationId?: string
  organizationName?: string
  chargedToOrganization: boolean
}

export type GetOrganizationUsageResponseFn = (params: {
  organizationId: string
  userId: string
  logger: Logger
}) => Promise<{
  type: 'usage-response'
  usage: number
  remainingBalance: number
  balanceBreakdown: Record<string, never>
  next_quota_reset: null
}>
