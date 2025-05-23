import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, desc, gte, sql } from 'drizzle-orm'
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
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

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

    // Get usage for last month for trend calculation
    let lastMonthUsage = 0
    try {
      const { usageThisCycle: lastUsage } = await calculateOrganizationUsageAndBalance(
        orgId,
        lastMonthStart,
        lastMonthEnd
      )
      lastMonthUsage = lastUsage
    } catch (error) {
      console.log('No last month usage found:', error)
    }

    // Calculate usage trends
    const usageTrend = [
      {
        period: 'This Month',
        usage: usageThisCycle,
        change: lastMonthUsage > 0 ? ((usageThisCycle - lastMonthUsage) / lastMonthUsage) * 100 : 0
      },
      {
        period: 'Last Month',
        usage: lastMonthUsage,
        change: 0 // Base comparison
      }
    ]

    // Get top users by credit usage this cycle
    const topUsersData = await db
      .select({
        user_id: schema.orgUsage.user_id,
        user_name: schema.user.name,
        credits_used: sql<number>`SUM(${schema.orgUsage.credits_used})`,
      })
      .from(schema.orgUsage)
      .innerJoin(schema.user, eq(schema.orgUsage.user_id, schema.user.id))
      .where(
        and(
          eq(schema.orgUsage.org_id, orgId),
          gte(schema.orgUsage.created_at, currentMonthStart)
        )
      )
      .groupBy(schema.orgUsage.user_id, schema.user.name)
      .orderBy(desc(sql`SUM(${schema.orgUsage.credits_used})`))
      .limit(10)

    // Calculate percentages for top users
    const totalUsageForPercentage = Math.max(usageThisCycle, 1) // Avoid division by zero
    const topUsers = topUsersData.map(user => ({
      user_id: user.user_id,
      user_name: user.user_name || 'Unknown',
      credits_used: user.credits_used,
      percentage: (user.credits_used / totalUsageForPercentage) * 100
    }))

    // Get repository usage
    const repositoryUsageData = await db
      .select({
        repository_url: schema.orgUsage.repo_url,
        credits_used: sql<number>`SUM(${schema.orgUsage.credits_used})`,
      })
      .from(schema.orgUsage)
      .where(
        and(
          eq(schema.orgUsage.org_id, orgId),
          gte(schema.orgUsage.created_at, currentMonthStart)
        )
      )
      .groupBy(schema.orgUsage.repo_url)
      .orderBy(desc(sql`SUM(${schema.orgUsage.credits_used})`))
      .limit(10)

    // Calculate percentages and extract repository names
    const repositoryUsage = repositoryUsageData.map(repo => {
      const repoName = repo.repository_url.split('/').pop() || repo.repository_url
      return {
        repository_url: repo.repository_url,
        repository_name: repoName,
        credits_used: repo.credits_used,
        percentage: (repo.credits_used / totalUsageForPercentage) * 100
      }
    })

    // Get daily usage for the last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const dailyUsageData = await db
      .select({
        date: sql<string>`DATE(${schema.orgUsage.created_at})`,
        credits_used: sql<number>`SUM(${schema.orgUsage.credits_used})`,
      })
      .from(schema.orgUsage)
      .where(
        and(
          eq(schema.orgUsage.org_id, orgId),
          gte(schema.orgUsage.created_at, thirtyDaysAgo)
        )
      )
      .groupBy(sql`DATE(${schema.orgUsage.created_at})`)
      .orderBy(sql`DATE(${schema.orgUsage.created_at})`)

    // Calculate cost projections
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const daysPassed = now.getDate()
    const averageDaily = daysPassed > 0 ? usageThisCycle / daysPassed : 0
    const currentMonthProjected = averageDaily * daysInMonth
    const nextMonthEstimate = averageDaily * 30 // Estimate for next month

    const analytics = {
      currentBalance,
      usageThisCycle,
      usageTrend,
      topUsers,
      repositoryUsage,
      dailyUsage: dailyUsageData,
      costProjection: {
        currentMonthProjected: Math.round(currentMonthProjected),
        nextMonthEstimate: Math.round(nextMonthEstimate),
        averageDaily: Math.round(averageDaily)
      }
    }

    return NextResponse.json(analytics)
  } catch (error) {
    console.error('Error fetching organization analytics:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
