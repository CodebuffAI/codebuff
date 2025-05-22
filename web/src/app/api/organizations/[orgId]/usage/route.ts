import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, desc, gte } from 'drizzle-orm'
import { OrganizationUsageResponse } from 'common/types/organization'
import { calculateOrganizationUsageAndBalance } from '@codebuff/billing'

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
      .select({ role: schema.organizationMember.role })
      .from(schema.organizationMember)
      .where(
        and(
          eq(schema.organizationMember.organization_id, orgId),
          eq(schema.organizationMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (membership.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get organization credit balance and usage
    const now = new Date()
    const quotaResetDate = new Date(now.getFullYear(), now.getMonth(), 1) // First of current month
    
    let currentBalance = 0
    let usageThisCycle = 0
    
    try {
      const { balance, usageThisCycle: usage } = await calculateOrganizationUsageAndBalance(
        orgId,
        quotaResetDate,
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
        user_id: schema.organizationUsage.user_id,
        user_name: schema.user.name,
        credits_used: schema.organizationUsage.credits_used,
      })
      .from(schema.organizationUsage)
      .innerJoin(schema.user, eq(schema.organizationUsage.user_id, schema.user.id))
      .where(
        and(
          eq(schema.organizationUsage.organization_id, orgId),
          gte(schema.organizationUsage.created_at, quotaResetDate)
        )
      )
      .groupBy(schema.organizationUsage.user_id, schema.user.name)
      .orderBy(desc(schema.organizationUsage.credits_used))
      .limit(10)

    // Get recent usage activity
    const recentUsage = await db
      .select({
        date: schema.organizationUsage.created_at,
        credits_used: schema.organizationUsage.credits_used,
        repository_url: schema.organizationUsage.repository_url,
        user_name: schema.user.name,
      })
      .from(schema.organizationUsage)
      .innerJoin(schema.user, eq(schema.organizationUsage.user_id, schema.user.id))
      .where(
        and(
          eq(schema.organizationUsage.organization_id, orgId),
          gte(schema.organizationUsage.created_at, quotaResetDate)
        )
      )
      .orderBy(desc(schema.organizationUsage.created_at))
      .limit(50)

    const response: OrganizationUsageResponse = {
      currentBalance,
      usageThisCycle,
      topUsers: topUsers.map(user => ({
        user_id: user.user_id,
        user_name: user.user_name || 'Unknown',
        credits_used: user.credits_used,
      })),
      recentUsage: recentUsage.map(usage => ({
        date: usage.date.toISOString(),
        credits_used: usage.credits_used,
        repository_url: usage.repository_url,
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