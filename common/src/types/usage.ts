import { z } from 'zod'

export const usageDataSchema = z.object({
  creditsUsed: z.number(),
  totalQuota: z.number(),
  remainingCredits: z.number(),
  subscriptionActive: z.boolean(),
  nextQuotaReset: z.coerce.date(),
})

export type UsageData = z.infer<typeof usageDataSchema>
