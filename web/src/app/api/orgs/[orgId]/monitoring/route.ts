import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, gte, sql } from 'drizzle-orm'
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

    const now = new Date()
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000)
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Get current balance and usage
    let currentBalance = 0
    let usageThisCycle = 0
    
    try {
      const { balance, usageThisCycle: usage } = await calculateOrganizationUsageAndBalance(
        orgId,
        currentMonthStart,
        now
      )
      currentBalance = balance.netBalance
      usageThisCycle = usage
    } catch (error) {
      console.log('No organization credits found:', error)
    }

    // Calculate credit velocity (credits per hour)
    const recentUsage = await db
      .select({
        credits_used: sql<number>`SUM(${schema.orgUsage.credits_used})`,
      })
      .from(schema.orgUsage)
      .where(
        and(
          eq(schema.orgUsage.org_id, orgId),
          gte(schema.orgUsage.created_at, lastHour)
        )
      )

    const currentVelocity = recentUsage[0]?.credits_used || 0

    // Get previous hour for trend calculation
    const previousHour = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const previousHourUsage = await db
      .select({
        credits_used: sql<number>`SUM(${schema.orgUsage.credits_used})`,
      })
      .from(schema.orgUsage)
      .where(
        and(
          eq(schema.orgUsage.org_id, orgId),
          gte(schema.orgUsage.created_at, previousHour),
          sql`${schema.orgUsage.created_at} < ${lastHour}`
        )
      )

    const previousVelocity = previousHourUsage[0]?.credits_used || 0
    const velocityChange = previousVelocity > 0 ? ((currentVelocity - previousVelocity) / previousVelocity) * 100 : 0
    const velocityTrend = velocityChange > 5 ? 'up' : velocityChange < -5 ? 'down' : 'stable'

    // Calculate burn rates
    const dailyUsage = await db
      .select({
        credits_used: sql<number>`SUM(${schema.orgUsage.credits_used})`,
      })
      .from(schema.orgUsage)
      .where(
        and(
          eq(schema.orgUsage.org_id, orgId),
          gte(schema.orgUsage.created_at, last24Hours)
        )
      )

    const weeklyUsage = await db
      .select({
        credits_used: sql<number>`SUM(${schema.orgUsage.credits_used})`,
      })
      .from(schema.orgUsage)
      .where(
        and(
          eq(schema.orgUsage.org_id, orgId),
          gte(schema.orgUsage.created_at, lastWeek)
        )
      )

    const dailyBurnRate = dailyUsage[0]?.credits_used || 0
    const weeklyBurnRate = weeklyUsage[0]?.credits_used || 0
    const monthlyBurnRate = usageThisCycle

    // Calculate days remaining based on current burn rate
    const daysRemaining = dailyBurnRate > 0 ? Math.floor(currentBalance / dailyBurnRate) : 999

    // Get alerts count
    const alertsResponse = await fetch(`${request.nextUrl.origin}/api/orgs/${orgId}/alerts`, {
      headers: {
        'Cookie': request.headers.get('Cookie') || ''
      }
    })
    
    let alertsData = { alerts: [] }
    if (alertsResponse.ok) {
      alertsData = await alertsResponse.json()
    }

    const criticalAlerts = alertsData.alerts.filter((alert: any) => alert.severity === 'critical').length
    const warningAlerts = alertsData.alerts.filter((alert: any) => alert.severity === 'warning').length
    const totalAlerts = alertsData.alerts.length

    // Determine health status
    let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy'
    if (criticalAlerts > 0 || currentBalance < 100) {
      healthStatus = 'critical'
    } else if (warningAlerts > 0 || currentBalance < 500 || daysRemaining < 7) {
      healthStatus = 'warning'
    }

    // Mock performance metrics (in a real implementation, these would come from monitoring services)
    const performanceMetrics = {
      responseTime: Math.floor(Math.random() * 100) + 50, // 50-150ms
      errorRate: Math.random() * 2, // 0-2%
      uptime: 99.5 + Math.random() * 0.5 // 99.5-100%
    }

    const monitoringData = {
      healthStatus,
      creditVelocity: {
        current: currentVelocity,
        trend: velocityTrend,
        percentage: Math.abs(velocityChange)
      },
      burnRate: {
        daily: dailyBurnRate,
        weekly: weeklyBurnRate,
        monthly: monthlyBurnRate,
        daysRemaining: Math.max(0, daysRemaining)
      },
      performanceMetrics,
      alerts: {
        active: totalAlerts,
        critical: criticalAlerts,
        warnings: warningAlerts
      }
    }

    return NextResponse.json(monitoringData)
  } catch (error) {
    console.error('Error fetching organization monitoring data:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
