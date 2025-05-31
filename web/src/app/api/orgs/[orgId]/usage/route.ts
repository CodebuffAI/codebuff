import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, desc, gte, sql } from 'drizzle-orm'
import { OrganizationUsageResponse } from 'common/types/organization'
import { calculateOrganizationUsageAndBalance, syncOrganizationBillingCycle } from '@codebuff/billing'

interface RouteParams {
  params: { orgId: string }
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<OrganizationUsageResponse | { error: string }>> {
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

    // Sync organization billing cycle with Stripe and get current cycle start
    const startOfCurrentCycle = await syncOrganizationBillingCycle(orgId)
    
    let currentBalance = 0
    let usageThisCycle = 0
    
    try {
      const now = new Date()
      const { balance, usageThisCycle: usage } = await calculateOrganizationUsageAndBalance(
        orgId,
        startOfCurrentCycle,
        now
      )
      currentBalance = balance.netBalance
      usageThisCycle = usage
    } catch (error) {
      // If no credits exist yet, that's fine
      console.log('No organization credits found:', error)
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
          eq(schema.message.org_id, orgId),
          gte(schema.message.finished_at, startOfCurrentCycle)
        )
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
          eq(schema.message.org_id, orgId),
          gte(schema.message.finished_at, startOfCurrentCycle)
        )
      )
      .orderBy(desc(schema.message.finished_at))
      .limit(50)

    const response: OrganizationUsageResponse = {
      currentBalance,
      usageThisCycle,
      topUsers: topUsers.map(user => ({
        user_id: user.user_id!,
        user_name: user.user_name || 'Unknown',
        user_email: user.user_email || 'Unknown',
        credits_used: user.credits_used,
      })),
      recentUsage: recentUsage.map(usage => ({
        date: usage.date.toISOString(),
        credits_used: usage.credits_used,
        repository_url: usage.repository_url || '',
        user_name: usage.user_name || 'Unknown',
      })),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching organization usage:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}