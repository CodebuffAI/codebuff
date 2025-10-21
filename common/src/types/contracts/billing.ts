import type { Logger } from './logger'
import type { ErrorOr } from '../../util/error'

export type GetUserUsageDataFn = (params: {
  userId: string
  logger: Logger
}) => Promise<{
  balance: { totalRemaining: number }
  nextQuotaReset: string
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
