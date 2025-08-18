import { z } from 'zod/v4'

import { GrantTypeValues } from './grant'

export const usageDataSchema = z.object({
  usageThisCycle: z.number(),
  balance: z.object({
    totalRemaining: z.number(),
    totalDebt: z.number(),
    netBalance: z.number(),
    breakdown: z.record(z.enum(GrantTypeValues), z.number()),
  }),
  nextQuotaReset: z.coerce.date().nullable(),
})

export type UsageData = z.infer<typeof usageDataSchema>
