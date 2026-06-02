// @ts-nocheck
import { components } from './_generated/api'
import { Autumn } from '@useautumn/convex'
import { Autumn as AutumnSDK } from 'autumn-js'
import { action, internalAction } from './_generated/server'
import { getAuthUser } from './users'
import { v } from 'convex/values'

export const autumn = new Autumn(components.autumn, {
  secretKey: process.env.AUTUMN_SECRET_KEY ?? '',
  identify: async (ctx: any) => {
    const user = await ctx.auth.getUserIdentity()

    if (!user) {
      // For unauthenticated contexts (like internal actions),
      // return a fallback identifier
      return {
        customerId: 'system',
        customerData: {
          name: 'System User',
          email: 'system@vly.ai',
        },
      }
    }

    // Extract clerk user ID from the subject
    const clerkUserId = user.subject

    // Check if there's organization context in the user identity
    // Clerk includes organization info in the JWT token when configured
    // Try multiple possible fields that Clerk might use
    const organizationId =
      (user as any)?.org_id ||
      (user as any)?.organizationId ||
      (user as any)?.organization?.id ||
      (user as any)?.activeOrganizationId

    // Get org name from Clerk - try multiple possible fields
    const orgName =
      (user as any)?.org_name ||
      (user as any)?.organization?.name ||
      (user as any)?.organizationName

    // Use organization ID as customer ID if user is in an organization context
    const customerId = organizationId || clerkUserId

    return {
      customerId,
      customerData: {
        name: organizationId
          ? orgName || 'Organization'
          : (user.name as string),
        email: user.email as string,
        organizationName: orgName, // Add this field
      },
    }
  },
})

export const {
  track,
  cancel,
  query,
  attach,
  check,
  checkout,
  usage,
  setupPayment,
  createCustomer,
  listProducts,
  billingPortal,
  createReferralCode,
  redeemReferralCode,
  createEntity,
  getEntity,
} = autumn.api()

// Utility function to get billing customer ID based on project
export const getBillingCustomerForProject = (project: {
  organization_id?: string | null
}) => {
  return project.organization_id || undefined // undefined will fall back to user ID
}

/**
 * Grant bonus credits to the current user after a plan upgrade
 * This is used to preserve the user's remaining credits when upgrading
 * (since reset_usage_when_enabled resets to the new plan's limit)
 */
export const grantUpgradeBonusCredits = action({
  args: {
    featureId: v.string(),
    amount: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    throw new Error('Billing temporarily unavailable during Freebuff migration')

    // Only grant positive amounts (bonus credits)
    if (args.amount <= 0) {
      return { success: true, message: 'No bonus credits to grant' }
    }

    const user = await getAuthUser(ctx)
    if (!user || !user.clerk_id) {
      throw new Error('Unauthorized: User not authenticated')
    }

    try {
      // Use negative amount to ADD credits (grant)
      // Autumn's track API: positive = consume, negative = grant
      const response = await fetch('https://api.useautumn.com/v1/track', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.AUTUMN_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer_id: user.clerk_id,
          feature_id: args.featureId,
          value: -args.amount, // Negative = grant credits
          properties: {
            action: 'upgrade_bonus',
            reason: args.reason || 'Credits preserved from previous plan',
            timestamp: Date.now(),
          },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Failed to grant upgrade bonus credits:', errorText)
        return { success: false, error: errorText }
      }

      console.log(
        `✅ Granted ${args.amount} bonus credits of ${args.featureId} to ${user.clerk_id}`,
      )

      return { success: true, amount: args.amount }
    } catch (error) {
      console.error('Failed to grant upgrade bonus credits:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
})

/**
 * Internal action to check Autumn credits with a specific Clerk ID
 * This bypasses the auth context and directly uses the Autumn SDK
 */
export const checkInternal = internalAction({
  args: {
    featureId: v.string(),
    clerkId: v.string(),
    requiredBalance: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return {
      allowed: true,
      balance: null,
      message: 'Billing temporarily unavailable during Freebuff migration',
    }

    const autumnSDK = new AutumnSDK({
      secretKey: process.env.AUTUMN_SECRET_KEY ?? '',
    })

    const requiredBalance = args.requiredBalance ?? 1

    const evaluateFeatureFallback = (feature: any) => {
      if (!feature) return null

      // Boolean feature gate
      if (typeof feature.has_access === 'boolean') {
        return { allowed: feature.has_access, balance: null as number | null }
      }

      // Unlimited usage feature
      if (feature.unlimited === true || feature.included_usage === 'inf') {
        return { allowed: true, balance: null as number | null }
      }

      // Usage-based feature with explicit balance
      if (typeof feature.balance === 'number') {
        return {
          allowed: feature.balance >= requiredBalance,
          balance: feature.balance,
        }
      }

      // Usage-based feature with included_usage + usage
      if (typeof feature.included_usage === 'number') {
        const usage =
          typeof feature.usage === 'number' && Number.isFinite(feature.usage)
            ? feature.usage
            : 0
        const remaining = Math.max(0, feature.included_usage - usage)
        return {
          allowed: remaining >= requiredBalance,
          balance: remaining,
        }
      }

      return null
    }

    const runCustomerFallback = async () => {
      try {
        const response = await fetch(
          `https://api.useautumn.com/v1/customers/${args.clerkId}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${process.env.AUTUMN_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
          },
        )

        if (!response.ok) return null
        const customerData: any = await response.json()
        const feature = customerData?.features?.[args.featureId]
        return evaluateFeatureFallback(feature)
      } catch {
        return null
      }
    }

    try {
      const result = await autumnSDK.check({
        feature_id: args.featureId,
        customer_id: args.clerkId,
        required_balance: args.requiredBalance,
      })

      const sdkAllowed =
        !result.error &&
        !!result.data &&
        'allowed' in result.data &&
        result.data.allowed === true

      if (sdkAllowed) {
        return {
          data: result.data
            ? {
                allowed: result.data.allowed,
                balance: result.data.balance ?? null,
                required_balance: result.data.required_balance,
              }
            : null,
          error: null,
        }
      }

      // Fallback to direct customer feature data to handle occasional SDK false negatives.
      const fallback = await runCustomerFallback()
      if (fallback) {
        return {
          data: {
            allowed: fallback.allowed,
            balance: fallback.balance,
            required_balance: requiredBalance,
          },
          error: null,
        }
      }

      return {
        data: result.data
          ? {
              allowed: result.data.allowed,
              balance: result.data.balance ?? null,
              required_balance: result.data.required_balance,
            }
          : null,
        error: result.error
          ? {
              message: result.error.message,
              code: result.error.code,
            }
          : null,
      }
    } catch (error) {
      const fallback = await runCustomerFallback()
      if (fallback) {
        return {
          data: {
            allowed: fallback.allowed,
            balance: fallback.balance,
            required_balance: requiredBalance,
          },
          error: null,
        }
      }

      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'unknown_error',
        },
      }
    }
  },
})
