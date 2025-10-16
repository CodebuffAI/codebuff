import type { Logger } from './logger'

export type GetUserUsageDataFn = (params: {
  userId: string
  logger: Logger
}) => Promise<{
  balance: { totalRemaining: number }
  nextQuotaReset: string
}>
