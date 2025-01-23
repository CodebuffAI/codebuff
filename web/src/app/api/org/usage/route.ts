import { NextRequest, NextResponse } from 'next/server'
import { env } from '../../../../env.mjs'
import db from 'common/src/db'
import * as schema from 'common/db/schema'
import { eq, and, inArray, between, sql } from 'drizzle-orm'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/auth-options'
import { OrgQuotaManager } from 'common/src/billing/quota-manager'
import type { Session } from 'next-auth'

// Get organization usage data
export async function GET(req: NextRequest) {
  const session = (await getServerSession(authOptions)) as Session & {
    user: { id: string; email: string }
  }
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')
  
  if (!orgId) {
    return NextResponse.json(
      { error: 'Organization ID is required' },
      { status: 400 }
    )
  }

  // Check if user is a member of the organization
  const membership = await db
    .select({
      role: schema.organization_member.role,
    })
    .from(schema.organization_member)
    .where(
      and(
        eq(schema.organization_member.organization_id, orgId),
        eq(schema.organization_member.user_id, session.user.id || '')
      )
    )
    .limit(1)

  if (membership.length === 0) {
    return NextResponse.json(
      { error: 'Not a member of this organization' },
      { status: 403 }
    )
  }

  // Get organization details and usage data
  const quotaManager = new OrgQuotaManager()
  const { creditsUsed, quota, subscription_active } = await quotaManager.checkQuota(orgId)

  // Get member-specific usage breakdown
  const members = await db
    .select({
      user_id: schema.organization_member.user_id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.organization_member.role,
      joined_at: schema.organization_member.joined_at,
    })
    .from(schema.organization_member)
    .leftJoin(
      schema.user,
      eq(schema.user.id, schema.organization_member.user_id)
    )
    .where(eq(schema.organization_member.organization_id, orgId))

  const memberIds = members.map(m => m.user_id)
  
  // Calculate per-member usage for the current billing period
  const startDate = sql<string>`COALESCE(${schema.organization.created_at}, now()) - INTERVAL '1 month'`
  const endDate = sql<string>`now()`
  
  const memberUsage = await db
    .select({
      user_id: schema.message.user_id,
      credits: sql<string>`SUM(COALESCE(${schema.message.credits}, 0))`,
    })
    .from(schema.message)
    .where(
      and(
        inArray(schema.message.user_id, memberIds),
        between(schema.message.finished_at, startDate, endDate)
      )
    )
    .groupBy(schema.message.user_id)

  // Combine member info with their usage
  const membersWithUsage = members.map(member => ({
    ...member,
    credits_used: parseInt(
      memberUsage.find(u => u.user_id === member.user_id)?.credits || '0'
    ),
  }))

  return NextResponse.json({
    organization: {
      id: orgId,
      total_credits_used: creditsUsed,
      quota,
      subscription_active,
    },
    members: membersWithUsage,
  })
}
