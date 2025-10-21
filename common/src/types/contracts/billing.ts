import type { Logger } from './logger'

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
  context: string
  logger: Logger
}) => Promise<{
  success: boolean
  organizationId?: string
  organizationName?: string
  chargedToOrganization: boolean
  error?: string
}>
