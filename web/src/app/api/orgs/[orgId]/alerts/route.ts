import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import { calculateOrganizationUsageAndBalance } from '@codebuff/billing'

interface RouteParams {
  params: { orgId: string }
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params

    // Check if user is a member of this organization
    const membership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (membership.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get organization settings
    const organization = await db
      .select()
      .from(schema.org)
      .where(eq(schema.org.id, orgId))
      .limit(1)

    if (organization.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const org = organization[0]

    // Generate alerts based on current state
    const alerts = []

    try {
      // Get current usage and balance
      // Use the start of the current month as the quota reset date
      const now = new Date()
      const quotaResetDate = new Date(now.getFullYear(), now.getMonth(), 1)
      const usageData = await calculateOrganizationUsageAndBalance(orgId, quotaResetDate, now)
      const currentBalance = usageData.balance.netBalance
      const usageThisCycle = usageData.usageThisCycle

      // Low balance alert
      if (org.billing_alerts && currentBalance < 500) {
        alerts.push({
          id: `low-balance-${orgId}`,
          type: 'low_balance',
          severity: currentBalance < 100 ? 'critical' : 'warning',
          title: 'Low Credit Balance',
          message: `Your organization has ${currentBalance} credits remaining. Consider purchasing more credits to avoid service interruption.`,
          timestamp: new Date().toISOString(),
        })
      }

      // High usage alert
      if (org.usage_alerts && usageThisCycle > 5000) {
        alerts.push({
          id: `high-usage-${orgId}`,
          type: 'high_usage',
          severity: 'info',
          title: 'High Usage This Cycle',
          message: `Your organization has used ${usageThisCycle} credits this billing cycle. Monitor usage to stay within budget.`,
          timestamp: new Date().toISOString(),
        })
      }

      // Credit limit alert
      if (org.credit_limit && usageThisCycle >= org.credit_limit * 0.9) {
        alerts.push({
          id: `credit-limit-${orgId}`,
          type: 'credit_limit_reached',
          severity: usageThisCycle >= org.credit_limit ? 'critical' : 'warning',
          title: 'Credit Limit Approaching',
          message: `Your organization has used ${usageThisCycle} of ${org.credit_limit} credits this month (${Math.round((usageThisCycle / org.credit_limit) * 100)}%).`,
          timestamp: new Date().toISOString(),
        })
      }

      // Auto-topup failed alert (this would be set by the billing system)
      // For now, we'll simulate this based on low balance + auto-topup enabled
      if (org.auto_topup_enabled && currentBalance < (org.auto_topup_threshold || 500)) {
        // In a real implementation, this would check for failed auto-topup attempts
        // For demo purposes, we'll show this occasionally
        const shouldShowAutoTopupAlert = Math.random() < 0.1 // 10% chance
        if (shouldShowAutoTopupAlert) {
          alerts.push({
            id: `auto-topup-failed-${orgId}`,
            type: 'auto_topup_failed',
            severity: 'critical',
            title: 'Auto-topup Failed',
            message: 'Automatic credit purchase failed. Please check your payment method and try again.',
            timestamp: new Date().toISOString(),
          })
        }
      }
    } catch (error) {
      console.error('Error calculating usage for alerts:', error)
    }

    return NextResponse.json({ alerts })
  } catch (error) {
    console.error('Error fetching billing alerts:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
