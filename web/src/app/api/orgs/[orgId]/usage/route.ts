import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, desc, gte, sql } from 'drizzle-orm'
import { OrganizationUsageResponse } from 'common/types/organization'
import { calculateOrganizationUsageAndBalance } from '@codebuff/billing'
import { checkOrganizationPermission } from '@/lib/organization-permissions'

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

    // Step 5.2.a: Check organization permission (owner or admin)
    const permissionResult = await checkOrganizationPermission(orgId, ['owner', 'admin'])
    if (!permissionResult.success || !permissionResult.organization) {
      return NextResponse.json(
        { error: permissionResult.error || 'Permission check failed' },
        { status: permissionResult.status || 403 }
      )
    }
    // Use the organization details from the permission check
    const organizationDetails = permissionResult.organization

    // Step 5.2.b: Determine billing cycle start date
    // Use current_period_start from the fetched organization details, fallback to created_at
    const cycleStartDate = organizationDetails.current_period_start || organizationDetails.created_at
    // Use current_period_end, with a fallback if it's null
    const cycleEndDate = organizationDetails.current_period_end || new Date(new Date(cycleStartDate).setDate(new Date(cycleStartDate).getDate() + 30))

    let currentBalance = 0
    let usageThisCycle = 0
    
    try {
      const now = new Date()
      // Step 5.2.c: Call calculateOrganizationUsageAndBalance
      const { balance, usageThisCycle: usage } = await calculateOrganizationUsageAndBalance(
        orgId,
        cycleStartDate, // Use determined cycleStartDate
        now
      )
      currentBalance = balance.netBalance
      usageThisCycle = usage
    } catch (error) {
      // If no credits exist yet, that's fine, balances will be 0
      console.log('No organization credits found or error in calculation:', error)
    }

    // Step 5.2.d: Fetch top users by usage for the cycle
    const topUsers = await db
      .select({
        user_id: schema.message.user_id,
        user_name: schema.user.name,
        user_email: schema.user.email,
        credits_used: sql<number>`SUM(${schema.message.credits})`.mapWith(Number),
      })
      .from(schema.message)
      .innerJoin(schema.user, eq(schema.message.user_id, schema.user.id))
      .where(
        and(
          eq(schema.message.org_id, orgId),
          gte(schema.message.finished_at, cycleStartDate) // Use determined cycleStartDate
        )
      )
      .groupBy(schema.message.user_id, schema.user.name, schema.user.email)
      .orderBy(desc(sql`SUM(${schema.message.credits})`))
      .limit(10)

    // Step 5.2.e: Fetch recent usage activity for the organization
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
          gte(schema.message.finished_at, cycleStartDate) // Use determined cycleStartDate
        )
      )
      .orderBy(desc(schema.message.finished_at))
      .limit(50)

    // Step 5.2.f: Return currentBalance, usageThisCycle, topUsers, and recentUsage
    const response: OrganizationUsageResponse = {
      currentBalance,
      usageThisCycle,
      cycleStartDate: cycleStartDate.toISOString(),
      cycleEndDate: cycleEndDate.toISOString(),
      topUsers: topUsers.map(user => ({
        user_id: user.user_id!, // Assuming user_id is always present after join
        user_name: user.user_name || 'Unknown',
        user_email: user.user_email || 'Unknown',
        credits_used: user.credits_used || 0,
      })),
      recentUsage: recentUsage.map(usage => ({
        date: usage.date.toISOString(),
        credits_used: usage.credits_used || 0,
        repository_url: usage.repository_url || '',
        user_name: usage.user_name || 'Unknown',
      })),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching organization usage:', error)
    // It's good practice to type the error if possible, or log its specific structure
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}