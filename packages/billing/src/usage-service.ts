import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, and, desc, gte, sql } from 'drizzle-orm'

import { checkAndTriggerAutoTopup } from './auto-topup'
import { calculateUsageAndBalance } from './balance-calculator'
import { triggerMonthlyResetAndGrant } from './grant-credits'
import {
  calculateOrganizationUsageAndBalance,
  syncOrganizationBillingCycle,
} from './org-billing'
import { getActiveSubscription } from './subscription'

import type { CreditBalance } from './balance-calculator'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export interface UserUsageData {
  usageThisCycle: number
  balance: CreditBalance
  nextQuotaReset: string
  autoTopupTriggered?: boolean
  autoTopupEnabled?: boolean
  subscription?: {
    status: string
    billingPeriodEnd: string
    cancelAtPeriodEnd: boolean
  }
}

export interface OrganizationUsageData {
  currentBalance: number
  usageThisCycle: number
  cycleStartDate: string
  cycleEndDate: string
  topUsers: Array<{
    user_id: string
    user_name: string
    user_email: string
    credits_used: number
  }>
  recentUsage: Array<{
    date: string
    credits_used: number
    repository_url: string
    user_name: string
  }>
}

/**
 * Gets comprehensive user usage data including balance, usage, and auto-topup handling.
 * This consolidates logic from web/src/app/api/user/usage/route.ts
 */
export async function getUserUsageData(params: {
  userId: string
  logger: Logger
}): Promise<UserUsageData> {
  const { userId, logger } = params
  try {
    const now = new Date()

    // Check if we need to reset quota and grant new credits
    // This also returns autoTopupEnabled to avoid a separate query
    const { quotaResetDate, autoTopupEnabled } =
      await triggerMonthlyResetAndGrant(params)

    // Check if we need to trigger auto top-up
    let autoTopupTriggered = false
    try {
      const topupAmount = await checkAndTriggerAutoTopup(params)
      autoTopupTriggered = topupAmount !== undefined
    } catch (error) {
      logger.error(
        { error, userId },
        'Error during auto top-up check in getUserUsageData',
      )
      // Continue execution to return usage data even if auto top-up fails
    }

    // Use the canonical balance calculation function with the effective reset date
    // Pass isPersonalContext: true to exclude organization credits from personal usage
    const { usageThisCycle, balance } = await calculateUsageAndBalance({
      ...params,
      quotaResetDate,
      now,
      isPersonalContext: true, // isPersonalContext: true to exclude organization credits
    })

    // Check for active subscription
    let subscription: UserUsageData['subscription']
    const activeSub = await getActiveSubscription({ userId, logger })
    if (activeSub) {
      subscription = {
        status: activeSub.status,
        billingPeriodEnd: activeSub.billing_period_end.toISOString(),
        cancelAtPeriodEnd: activeSub.cancel_at_period_end,
      }
    }

    return {
      usageThisCycle,
      balance,
      nextQuotaReset: quotaResetDate.toISOString(),
      autoTopupTriggered,
      autoTopupEnabled,
      subscription,
    }
  } catch (error) {
    logger.error({ userId, error }, 'Error fetching user usage data')
    throw error
  }
}

/**
 * Gets comprehensive organization usage data including balance, usage, top users, and recent activity.
 * This consolidates logic from backend/src/api/usage.ts and web/src/app/api/orgs/[orgId]/usage/route.ts
 */
export async function getOrganizationUsageData(params: {
  organizationId: string
  userId: string
  logger: Logger
}): Promise<OrganizationUsageData> {
  const { organizationId, userId, logger } = params

  try {
    // Check if user is a member of this organization
    const membership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, organizationId),
          eq(schema.orgMember.user_id, userId),
        ),
      )
      .limit(1)

    if (membership.length === 0) {
      throw new Error('User is not a member of this organization')
    }

    // Sync organization billing cycle with Stripe and get current cycle start
    const startOfCurrentCycle = await syncOrganizationBillingCycle(params)

    // Get the organization to fetch the current period end date
    const organization = await db.query.org.findFirst({
      where: eq(schema.org.id, organizationId),
      columns: {
        current_period_start: true,
        current_period_end: true,
      },
    })

    // Use the synced dates or fallback to reasonable defaults
    const cycleStartDate =
      organization?.current_period_start || startOfCurrentCycle
    const cycleEndDate =
      organization?.current_period_end ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now

    let currentBalance = 0
    let usageThisCycle = 0

    try {
      const now = new Date()
      const { balance, usageThisCycle: usage } =
        await calculateOrganizationUsageAndBalance({
          ...params,
          quotaResetDate: startOfCurrentCycle,
          now,
        })
      currentBalance = balance.netBalance
      usageThisCycle = usage
    } catch (error) {
      // If no credits exist yet, that's fine
      logger.debug({ organizationId, error }, 'No organization credits found')
    }

    // Get top users by credit usage this cycle
    const topUsers = await db
      .select({
        user_id: schema.message.user_id,
        user_name: schema.user.name,
        user_email: schema.user.email,
        credits_used: sql<number>`SUM(${schema.message.credits})`,
      })
      .from(schema.message)
      .innerJoin(schema.user, eq(schema.message.user_id, schema.user.id))
      .where(
        and(
          eq(schema.message.org_id, organizationId),
          gte(schema.message.finished_at, startOfCurrentCycle),
        ),
      )
      .groupBy(schema.message.user_id, schema.user.name, schema.user.email)
      .orderBy(desc(sql`SUM(${schema.message.credits})`))
      .limit(10)

    // Get recent usage activity
    const recentUsage = await db
      .select({
        date: schema.message.finished_at,
        credits_used: schema.message.credits,
        repository_url: schema.message.repo_url,
        user_name: schema.user.name,
      })
      .from(schema.message)
      .innerJoin(schema.user, eq(schema.message.user_id, schema.user.id))
      .where(
        and(
          eq(schema.message.org_id, organizationId),
          gte(schema.message.finished_at, startOfCurrentCycle),
        ),
      )
      .orderBy(desc(schema.message.finished_at))
      .limit(50)

    return {
      currentBalance,
      usageThisCycle,
      cycleStartDate: cycleStartDate.toISOString(),
      cycleEndDate: cycleEndDate.toISOString(),
      topUsers: topUsers.map((user) => ({
        user_id: user.user_id!,
        user_name: user.user_name || 'Unknown',
        user_email: user.user_email || 'Unknown',
        credits_used: user.credits_used,
      })),
      recentUsage: recentUsage.map((usage) => ({
        date: usage.date.toISOString(),
        credits_used: usage.credits_used,
        repository_url: usage.repository_url || '',
        user_name: usage.user_name || 'Unknown',
      })),
    }
  } catch (error) {
    logger.error(
      { organizationId, userId, error },
      'Error fetching organization usage data',
    )
    throw error
  }
}

/**
 * Gets simplified organization usage response for backend API compatibility.
 * This maintains the existing response format for the backend API.
 */
export async function getOrganizationUsageResponse(params: {
  organizationId: string
  userId: string
  logger: Logger
}): Promise<{
  type: 'usage-response'
  usage: number
  remainingBalance: number
  balanceBreakdown: Record<string, never>
  next_quota_reset: null
}> {
  const { organizationId, userId, logger } = params

  try {
    const data = await getOrganizationUsageData(params)

    return {
      type: 'usage-response' as const,
      usage: data.usageThisCycle,
      remainingBalance: data.currentBalance,
      balanceBreakdown: {},
      next_quota_reset: null,
    }
  } catch (error) {
    logger.error(
      { organizationId, userId, error },
      'Error generating organization usage response',
    )
    throw error
  }
}
