import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, desc, gte } from 'drizzle-orm'

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

    // Check if user is a member of this organization with admin/owner role
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

    const userRole = membership[0].role
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Get all usage data for the organization
    const now = new Date()
    const quotaResetDate = new Date(now.getFullYear(), now.getMonth(), 1) // First of current month
    
    const usageData = await db
      .select({
        date: schema.orgUsage.created_at,
        user_name: schema.user.name,
        user_email: schema.user.email,
        repository_url: schema.orgUsage.repo_url,
        credits_used: schema.orgUsage.credits_used,
        message_id: schema.orgUsage.message_id,
      })
      .from(schema.orgUsage)
      .innerJoin(schema.user, eq(schema.orgUsage.user_id, schema.user.id))
      .where(
        and(
          eq(schema.orgUsage.org_id, orgId),
          gte(schema.orgUsage.created_at, quotaResetDate)
        )
      )
      .orderBy(desc(schema.orgUsage.created_at))

    // Convert to CSV format
    const csvHeaders = [
      'Date',
      'User Name',
      'User Email',
      'Repository',
      'Credits Used',
      'Message ID'
    ]

    const csvRows = usageData.map(row => [
      row.date.toISOString(),
      row.user_name || 'Unknown',
      row.user_email || 'Unknown',
      row.repository_url,
      row.credits_used.toString(),
      row.message_id || ''
    ])

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n')

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="organization-usage-${new Date().toISOString().split('T')[0]}.csv"`
      }
    })
  } catch (error) {
    console.error('Error exporting organization usage:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
