import { z } from 'zod'
import { GrantType } from '../db/schema'

export const usageDataSchema = z.object({
  usageThisCycle: z.number(),
  balance: z.object({
    totalRemaining: z.number(),
    totalDebt: z.number(),
    netBalance: z.number(),
    breakdown: z.record(z.string(), z.number()).optional(),
  }),
  nextQuotaReset: z.coerce.date().nullable(),
  nextMonthlyGrant: z.number(),
})

export type UsageData = z.infer<typeof usageDataSchema>
