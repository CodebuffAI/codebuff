import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, desc, gte } from 'drizzle-orm'
import { checkOrganizationPermission } from '@/lib/organization-permissions'

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

    // Step 6.2.a: Check organization permission (owner or admin)
    const permissionResult = await checkOrganizationPermission(orgId, ['owner', 'admin'])
    if (!permissionResult.success || !permissionResult.organization) {
      return NextResponse.json(
        { error: permissionResult.error || 'Permission check failed' },
        { status: permissionResult.status || 403 }
      )
    }
    const organizationDetails = permissionResult.organization

    // Step 6.2.b: Determine billing cycle start date
    const cycleStartDate = organizationDetails.current_period_start || organizationDetails.created_at

    // Step 6.2.c: Fetch all usage messages for the organization within the current billing cycle
    const usageData = await db
      .select({
        date: schema.message.finished_at,
        user_id: schema.message.user_id, // Added for CSV
        user_name: schema.user.name,
        user_email: schema.user.email, // Added for CSV
        repository_url: schema.message.repo_url,
        credits_used: schema.message.credits,
        // message_id: schema.message.id, // Removed as not in plan for CSV
      })
      .from(schema.message)
      .innerJoin(schema.user, eq(schema.message.user_id, schema.user.id))
      .where(
        and(
          eq(schema.message.org_id, orgId),
          gte(schema.message.finished_at, cycleStartDate)
        )
      )
      .orderBy(desc(schema.message.finished_at))

    // Step 6.2.d: Convert these messages to a CSV format
    const csvHeaders = 'Date,User ID,User Name,User Email,Repository URL,Credits Used\n'
    const csvRows = usageData
      .map(row => [
        row.date ? new Date(row.date).toISOString() : '',
        row.user_id || '',
        row.user_name || 'Unknown',
        row.user_email || 'Unknown',
        row.repository_url || '',
        row.credits_used?.toString() || '0',
      ])
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const csv = csvHeaders + csvRows

    // Step 6.2.e: Return the CSV data as a downloadable file
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="org-usage-${orgId}-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error) {
    console.error('Error exporting organization usage:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
