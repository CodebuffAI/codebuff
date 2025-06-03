import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, sql, desc } from 'drizzle-orm'
import { calculateOrganizationUsageAndBalance } from '@codebuff/billing'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin (you'll need to implement admin check logic)
    // For now, we'll assume any authenticated user can access this
    // In production, you'd check against an admin role or specific user IDs
    
    // Get all organizations with their details
    const organizations = await db
      .select({
        id: schema.org.id,
        name: schema.org.name,
        slug: schema.org.slug,
        owner_id: schema.org.owner_id,
        created_at: schema.org.created_at,
        owner_name: schema.user.name,
      })
      .from(schema.org)
      .innerJoin(schema.user, eq(schema.org.owner_id, schema.user.id))
      .orderBy(desc(schema.org.created_at))

    // Get member counts for each organization
    const memberCounts = await db
      .select({
        org_id: schema.orgMember.org_id,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.orgMember)
      .groupBy(schema.orgMember.org_id)

    // Get repository counts for each organization
    const repoCounts = await db
      .select({
        org_id: schema.orgRepo.org_id,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.orgRepo)
      .where(eq(schema.orgRepo.is_active, true))
      .groupBy(schema.orgRepo.org_id)

    // Build the response with additional data
    const now = new Date()
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const organizationSummaries = await Promise.all(
      organizations.map(async (org) => {
        const memberCount = memberCounts.find(m => m.org_id === org.id)?.count || 0
        const repositoryCount = repoCounts.find(r => r.org_id === org.id)?.count || 0

        // Get credit balance and usage
        let creditBalance = 0
        let usageThisCycle = 0
        let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy'

        try {
          const { balance, usageThisCycle: usage } = await calculateOrganizationUsageAndBalance(
            org.id,
            currentMonthStart,
            now
          )
          creditBalance = balance.netBalance
          usageThisCycle = usage

          // Determine health status
          if (creditBalance < 100) {
            healthStatus = 'critical'
          } else if (creditBalance < 500) {
            healthStatus = 'warning'
          }
        } catch (error) {
          // No credits found, that's okay
        }

        // Get last activity (most recent usage)
        const lastActivity = await db
          .select({ finished_at: schema.message.finished_at })
          .from(schema.message)
          .where(eq(schema.message.org_id, org.id))
          .orderBy(desc(schema.message.finished_at))
          .limit(1)

        return {
          id: org.id,
          name: org.name,
          slug: org.slug,
          owner_name: org.owner_name || 'Unknown',
          member_count: memberCount,
          repository_count: repositoryCount,
          credit_balance: creditBalance,
          usage_this_cycle: usageThisCycle,
          health_status: healthStatus,
          created_at: org.created_at.toISOString(),
          last_activity: lastActivity[0]?.finished_at.toISOString() || org.created_at.toISOString(),
        }
      })
    )

    return NextResponse.json({ organizations: organizationSummaries })
  } catch (error) {
    console.error('Error fetching admin organizations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
