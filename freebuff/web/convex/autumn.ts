import { action, internalAction } from './_generated/server'
import { v } from 'convex/values'

const BILLING_UNAVAILABLE = 'Billing is disabled for Freebuff Web'

/**
 * Compatibility actions retained while legacy billing UI is removed.
 * These actions never contact Autumn or mutate billing state.
 */
export const grantUpgradeBonusCredits = action({
  args: {
    featureId: v.string(),
    amount: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async () => ({
    success: false,
    error: BILLING_UNAVAILABLE,
  }),
})

export const setupPayment = action({
  args: {
    successUrl: v.optional(v.string()),
  },
  handler: async () => ({
    data: null as { url?: string } | null,
    error: { message: BILLING_UNAVAILABLE } as { message: string } | null,
  }),
})

export const checkInternal = internalAction({
  args: {
    featureId: v.string(),
    clerkId: v.string(),
    requiredBalance: v.optional(v.number()),
  },
  handler: async () => ({
    data: {
      allowed: true,
      balance: null,
      required_balance: null,
    },
    error: null as { message: string } | string | null,
  }),
})
