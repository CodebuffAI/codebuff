import { z } from 'zod'

export const usageDataSchema = z.object({
  creditsUsed: z.number(),
  totalQuota: z.number(),
  remainingCredits: z.number(),
  billingCycleEnd: z.coerce.date(),
})

export type UsageData = z.infer<typeof usageDataSchema>
