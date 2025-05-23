import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, gte, desc } from 'drizzle-orm'

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
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'csv'

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

    // Get detailed usage data for export
    const now = new Date()
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const usageData = await db
      .select({
        date: schema.orgUsage.created_at,
        user_name: schema.user.name,
        user_email: schema.user.email,
        repository_url: schema.orgUsage.repo_url,
        credits_used: schema.orgUsage.credits_used,
      })
      .from(schema.orgUsage)
      .innerJoin(schema.user, eq(schema.orgUsage.user_id, schema.user.id))
      .where(
        and(
          eq(schema.orgUsage.org_id, orgId),
          gte(schema.orgUsage.created_at, currentMonthStart)
        )
      )
      .orderBy(desc(schema.orgUsage.created_at))
      .limit(1000) // Limit to prevent huge exports

    if (format === 'csv') {
      // Generate CSV
      const csvHeaders = ['Date', 'User Name', 'User Email', 'Repository', 'Credits Used']
      const csvRows = usageData.map(row => [
        row.date.toISOString(),
        row.user_name || 'Unknown',
        row.user_email,
        row.repository_url,
        row.credits_used.toString()
      ])

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
      ].join('\n')

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="org-${orgId}-usage-${now.toISOString().split('T')[0]}.csv"`
        }
      })
    } else if (format === 'json') {
      // Generate JSON
      const jsonData = {
        organization_id: orgId,
        export_date: now.toISOString(),
        period: {
          start: currentMonthStart.toISOString(),
          end: now.toISOString()
        },
        usage_data: usageData.map(row => ({
          date: row.date.toISOString(),
          user: {
            name: row.user_name || 'Unknown',
            email: row.user_email
          },
          repository_url: row.repository_url,
          credits_used: row.credits_used
        })),
        summary: {
          total_records: usageData.length,
          total_credits: usageData.reduce((sum, row) => sum + row.credits_used, 0)
        }
      }

      return new NextResponse(JSON.stringify(jsonData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="org-${orgId}-usage-${now.toISOString().split('T')[0]}.json"`
        }
      })
    } else {
      return NextResponse.json({ error: 'Invalid format. Use csv or json.' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error exporting organization analytics:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
