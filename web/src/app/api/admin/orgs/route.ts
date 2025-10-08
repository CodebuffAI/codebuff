import { calculateOrganizationUsageAndBalance } from '@codebuff/billing'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq, sql, desc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import type { NextRequest } from 'next/server'

import { checkAdminAuth } from '@/lib/admin-auth'
import { logger } from '@/util/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check admin authentication
    const authResult = await checkAdminAuth()
    if (authResult instanceof NextResponse) {
      return authResult
    }

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
        const memberCount =
          memberCounts.find((m) => m.org_id === org.id)?.count || 0
        const repositoryCount =
          repoCounts.find((r) => r.org_id === org.id)?.count || 0

        // Get credit balance and usage
        let creditBalance = 0
        let usageThisCycle = 0
        let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy'

        try {
          const { balance, usageThisCycle: usage } =
            await calculateOrganizationUsageAndBalance({
              organizationId: org.id,
              quotaResetDate: currentMonthStart,
              now,
              logger,
            })
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
          last_activity:
            lastActivity[0]?.finished_at.toISOString() ||
            org.created_at.toISOString(),
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
