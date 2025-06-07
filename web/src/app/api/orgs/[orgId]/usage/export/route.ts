import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, and, desc, gte } from 'drizzle-orm'
import { syncOrganizationBillingCycle } from '@codebuff/billing'

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

    // Sync organization billing cycle with Stripe and get current cycle start
    const quotaResetDate = await syncOrganizationBillingCycle(orgId)

    // Get all usage data for this cycle
    const usageData = await db
      .select({
        date: schema.message.finished_at,
        user_name: schema.user.name,
        repository_url: schema.message.repo_url,
        credits_used: schema.message.credits,
        message_id: schema.message.id,
      })
      .from(schema.message)
      .innerJoin(schema.user, eq(schema.message.user_id, schema.user.id))
      .where(
        and(
          eq(schema.message.org_id, orgId),
          gte(schema.message.finished_at, quotaResetDate)
        )
      )
      .orderBy(desc(schema.message.finished_at))

    // Convert to CSV
    const csvHeaders = 'Date,User,Repository,Credits Used,Message ID\n'
    const csvRows = usageData
      .map(row => [
        row.date.toISOString(),
        row.user_name || 'Unknown',
        row.repository_url || '',
        row.credits_used.toString(),
        row.message_id,
      ])
      .map(row => row.map(field => `"${field.replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const csv = csvHeaders + csvRows

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="org-usage-${orgId}-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error) {
    console.error('Error exporting organization usage:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
