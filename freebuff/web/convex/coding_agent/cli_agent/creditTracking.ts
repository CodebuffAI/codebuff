// @ts-nocheck
'use node'

import { ActionCtx, internalAction } from '!/_generated/server'
import { internal } from '../../_generated/api'
import { Id } from '../../_generated/dataModel'
import { v } from 'convex/values'
import {
  getCustomerData,
  getTierFromCustomerData,
  applyTierMultiplier,
} from '../../../lib/autumn-api'
import type { TierName } from '../../../autumn/constants'

// Conversion rate: $1 = 1,000,000 credits (1M credits)
const CREDITS_PER_DOLLAR = 1_000_000

// Fixed timeout charge: $0.50 = 500K credits
// This is charged when an action runs for more than 10 minutes and times out
const TIMEOUT_CHARGE_USD = 0.5

const isPlatformAdminRole = (role?: string) =>
  role === 'god' || role === 'admin'

async function executingUserHasAdminBillingBypass(
  ctx: ActionCtx,
  executingUserId?: Id<'users'>,
) {
  if (!executingUserId) {
    return false
  }

  const executingUser = await ctx.runQuery(internal.users.get, {
    userId: executingUserId,
  })
  return isPlatformAdminRole(executingUser?.role)
}

/**
 * Convert USD cost to credits
 * $1 = 1M credits
 */
export function usdToCredits(usd: number): number {
  return Math.ceil(usd * CREDITS_PER_DOLLAR)
}

/**
 * Check if user has sufficient credits (balance > $0) before starting CLI agent
 * Returns { allowed: true } if user can proceed, or { allowed: false, error: string } if not
 */
export const checkAgentCredits = internalAction({
  args: {
    projectId: v.id('project'),
    executingUserId: v.optional(v.id('users')),
  },
  handler: async (ctx, args) => {
    console.log(
      `[CreditCheck] Billing disabled during Freebuff migration for project ${args.projectId}`,
    )
    return { allowed: true }

    if (await executingUserHasAdminBillingBypass(ctx, args.executingUserId)) {
      console.log(
        `[CreditCheck] Skipping CLI credit check for platform admin sender on project ${args.projectId}`,
      )
      return { allowed: true }
    }

    // Get project owner information to determine billing customer
    const projectOwner = await ctx.runQuery(internal.project.getProjectOwner, {
      projectId: args.projectId,
    })

    if (!projectOwner) {
      console.error(
        `[CreditCheck] Could not find project owner for project ${args.projectId}`,
      )
      return { allowed: false, error: 'Project owner not found' }
    }

    // Determine the billing customer ID (Clerk ID)
    let billingCustomerId: string
    if (projectOwner.type === 'organization') {
      billingCustomerId = projectOwner.organization_id
    } else {
      billingCustomerId = projectOwner.user.clerk_id
    }

    // Check credits with Autumn API
    try {
      const response = await fetch('https://api.useautumn.com/v1/check', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.AUTUMN_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer_id: billingCustomerId,
          feature_id: 'agent_credits',
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          `[CreditCheck] Autumn API error: ${response.status} ${errorText}`,
        )
        // Allow on API error to not block users due to billing service issues
        return { allowed: true }
      }

      const creditData = await response.json()

      if (!creditData.allowed) {
        const balance = creditData.balances?.[0]?.balance || 0
        console.log(
          `[CreditCheck] Insufficient credits for ${billingCustomerId}: ${balance} credits remaining`,
        )
        return {
          allowed: false,
          error: `Insufficient credits. You have ${balance} credits remaining. Please add more credits to continue.`,
          balance,
        }
      }

      const balance = creditData.balances?.[0]?.balance || 0
      console.log(
        `[CreditCheck] Credit check passed for ${billingCustomerId}: ${balance} credits remaining`,
      )
      return { allowed: true, balance }
    } catch (error) {
      console.error(
        `[CreditCheck] Error checking credits:`,
        error instanceof Error ? error.message : String(error),
      )
      // Allow on error to not block users due to network issues
      return { allowed: true }
    }
  },
})

/**
 * Track credit usage for CLI agents (Codex, Gemini CLI, Claude Code)
 * This deducts credits from the user's balance based on the USD cost
 */
export const trackCliAgentUsage = internalAction({
  args: {
    projectId: v.id('project'),
    totalCostUsd: v.number(),
    executingUserId: v.optional(v.id('users')),
    agentType: v.union(
      v.literal('Claude Code'),
      v.literal('Gemini CLI'),
      v.literal('Codex'),
      v.literal('Freebuff'),
    ),
    messageId: v.optional(v.id('agent_message')),
  },
  handler: async (ctx, args) => {
    console.log(
      `[CreditTracking] Billing disabled during Freebuff migration for ${args.agentType} on project ${args.projectId}`,
    )
    return { success: true, creditsDeducted: 0 }

    // Skip if no cost
    if (args.totalCostUsd <= 0) {
      return { success: true, creditsDeducted: 0 }
    }

    if (await executingUserHasAdminBillingBypass(ctx, args.executingUserId)) {
      console.log(
        `[CreditTracking] Skipping CLI credit deduction for admin sender on project ${args.projectId}`,
      )
      return { success: true, creditsDeducted: 0 }
    }

    // Get project owner information to determine billing customer
    const projectOwner = await ctx.runQuery(internal.project.getProjectOwner, {
      projectId: args.projectId,
    })

    if (!projectOwner) {
      console.error(
        `[CreditTracking] Could not find project owner for project ${args.projectId}`,
      )
      return { success: false, error: 'Project owner not found' }
    }

    // Determine the billing customer ID (Clerk ID)
    // For organization projects: use organization_id
    // For personal projects: use the owner's clerk_id
    let billingCustomerId: string
    if (projectOwner.type === 'organization') {
      billingCustomerId = projectOwner.organization_id
    } else {
      billingCustomerId = projectOwner.user.clerk_id
    }

    // Convert USD to credits ($1 = 1M credits)
    const baseCredits = usdToCredits(args.totalCostUsd)

    // Get user's tier for credit multiplier
    let userTier: TierName = 'free'
    try {
      const customerData = await getCustomerData(billingCustomerId)
      userTier = getTierFromCustomerData(customerData)
      console.log(`[CreditTracking] User tier detected: ${userTier}`)
    } catch (tierError) {
      console.warn(
        '[CreditTracking] Failed to get user tier, defaulting to free:',
        tierError,
      )
    }

    // Apply tier-based multiplier (lower tiers pay more)
    const creditsToDeduct = applyTierMultiplier(baseCredits, userTier)

    console.log(
      `[CreditTracking] Credit calculation: base=${baseCredits}, tier=${userTier}, adjusted=${creditsToDeduct}`,
    )

    // Track usage with Autumn
    try {
      const response = await fetch('https://api.useautumn.com/v1/track', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.AUTUMN_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer_id: billingCustomerId,
          feature_id: 'agent_credits',
          value: creditsToDeduct,
          properties: {
            agent_type: args.agentType,
            cost_usd: args.totalCostUsd,
            base_credits: baseCredits,
            tier_multiplier: userTier,
            credits_deducted: creditsToDeduct,
            project_id: args.projectId,
            message_id: args.messageId,
          },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          `[CreditTracking] Autumn API error: ${response.status} ${errorText}`,
        )
        return {
          success: false,
          error: `Autumn API error: ${response.status}`,
        }
      }

      console.log(
        `[CreditTracking] Deducted ${creditsToDeduct} credits ($${args.totalCostUsd.toFixed(4)}) for ${args.agentType} from ${billingCustomerId}`,
      )

      // Update the message with actual credits deducted
      if (args.messageId) {
        await ctx.runMutation(
          internal.coding_agent.cli_agent.agent_message
            .updateAgentMessageCreditsDeducted,
          {
            messageId: args.messageId,
            creditsDeducted: creditsToDeduct,
          },
        )
      }

      return { success: true, creditsDeducted: creditsToDeduct }
    } catch (error) {
      console.error(
        `[CreditTracking] Error tracking usage:`,
        error instanceof Error ? error.message : String(error),
      )
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
})

/**
 * Track fixed credit charge when an action times out (runs > 10 minutes)
 * Charges a flat $0.50 = 500K credits (before tier multiplier)
 */
export const trackTimeoutUsage = internalAction({
  args: {
    projectId: v.id('project'),
    messageId: v.id('agent_message'),
    executingUserId: v.optional(v.id('users')),
    agentType: v.union(
      v.literal('Claude Code'),
      v.literal('Gemini CLI'),
      v.literal('Codex'),
      v.literal('Freebuff'),
    ),
  },
  handler: async (ctx, args) => {
    console.log(
      `[CreditTracking] Timeout billing disabled during Freebuff migration for ${args.agentType} on project ${args.projectId}`,
    )
    return { success: true, creditsDeducted: 0 }

    if (await executingUserHasAdminBillingBypass(ctx, args.executingUserId)) {
      console.log(
        `[CreditTracking] Skipping CLI timeout charge for admin sender on project ${args.projectId}`,
      )
      return { success: true, creditsDeducted: 0 }
    }

    // Fixed timeout charge: $0.50 = 500K credits (base, before multiplier)
    const timeoutCostUsd = TIMEOUT_CHARGE_USD
    const baseCredits = usdToCredits(timeoutCostUsd)

    // Get project owner information to determine billing customer
    const projectOwner = await ctx.runQuery(internal.project.getProjectOwner, {
      projectId: args.projectId,
    })

    if (!projectOwner) {
      console.error(
        `[CreditTracking] Could not find project owner for project ${args.projectId}`,
      )
      return { success: false, error: 'Project owner not found' }
    }

    // Determine the billing customer ID
    let billingCustomerId: string
    if (projectOwner.type === 'organization') {
      billingCustomerId = projectOwner.organization_id
    } else {
      billingCustomerId = projectOwner.user.clerk_id
    }

    // Get user's tier for credit multiplier
    let userTier: TierName = 'free'
    try {
      const customerData = await getCustomerData(billingCustomerId)
      userTier = getTierFromCustomerData(customerData)
      console.log(`[CreditTracking] Timeout - User tier detected: ${userTier}`)
    } catch (tierError) {
      console.warn(
        '[CreditTracking] Timeout - Failed to get user tier, defaulting to free:',
        tierError,
      )
    }

    // Apply tier-based multiplier (lower tiers pay more)
    const creditsToDeduct = applyTierMultiplier(baseCredits, userTier)

    console.log(
      `[CreditTracking] Timeout credit calculation: base=${baseCredits}, tier=${userTier}, adjusted=${creditsToDeduct}`,
    )

    // Track usage with Autumn
    try {
      const response = await fetch('https://api.useautumn.com/v1/track', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.AUTUMN_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer_id: billingCustomerId,
          feature_id: 'agent_credits',
          value: creditsToDeduct,
          properties: {
            agent_type: args.agentType,
            cost_usd: timeoutCostUsd,
            base_credits: baseCredits,
            tier_multiplier: userTier,
            credits_deducted: creditsToDeduct,
            project_id: args.projectId,
            message_id: args.messageId,
            timeout: true,
          },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          `[CreditTracking] Autumn API error: ${response.status} ${errorText}`,
        )
        return {
          success: false,
          error: `Autumn API error: ${response.status}`,
        }
      }

      console.log(
        `[CreditTracking] Timeout charge: ${creditsToDeduct} credits ($${timeoutCostUsd.toFixed(2)}) for ${args.agentType} from ${billingCustomerId}`,
      )

      // Update the message with the timeout cost and credits deducted
      await ctx.runMutation(
        internal.coding_agent.cli_agent.agent_message.updateAgentMessageUsage,
        {
          messageId: args.messageId,
          totalCostUsd: timeoutCostUsd,
          usageBreakdown: undefined,
          modelUsed: undefined,
          creditsDeducted: creditsToDeduct,
        },
      )

      return { success: true, creditsDeducted: creditsToDeduct }
    } catch (error) {
      console.error(
        `[CreditTracking] Error tracking timeout usage:`,
        error instanceof Error ? error.message : String(error),
      )
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  },
})
