import { NextRequest, NextResponse } from 'next/server'
import { withAdminAuth } from '../../admin-auth'
import { AdminUser } from '@codebuff/internal/utils'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, sql, desc } from 'drizzle-orm'

async function exportOrganizations(
  adminUser: AdminUser,
  request: NextRequest
): Promise<NextResponse> {
  try {
    // Get all organizations with detailed information
    const organizations = await db
      .select({
        id: schema.org.id,
        name: schema.org.name,
        slug: schema.org.slug,
        description: schema.org.description,
        owner_name: schema.user.name,
        owner_email: schema.user.email,
        created_at: schema.org.created_at,
        updated_at: schema.org.updated_at,
        stripe_customer_id: schema.org.stripe_customer_id,
        auto_topup_enabled: schema.org.auto_topup_enabled,
        auto_topup_threshold: schema.org.auto_topup_threshold,
        auto_topup_amount: schema.org.auto_topup_amount,
        credit_limit: schema.org.credit_limit,
        billing_alerts: schema.org.billing_alerts,
        usage_alerts: schema.org.usage_alerts,
      })
      .from(schema.org)
      .innerJoin(schema.user, eq(schema.org.owner_id, schema.user.id))
      .orderBy(desc(schema.org.created_at))

    // Generate CSV
    const csvHeaders = [
      'Organization ID',
      'Name',
      'Slug',
      'Description',
      'Owner Name',
      'Owner Email',
      'Created At',
      'Updated At',
      'Stripe Customer ID',
      'Auto Topup Enabled',
      'Auto Topup Threshold',
      'Auto Topup Amount',
      'Credit Limit',
      'Billing Alerts',
      'Usage Alerts',
    ]

    const csvRows = organizations.map((org) => [
      org.id,
      org.name,
      org.slug,
      org.description || '',
      org.owner_name || 'Unknown',
      org.owner_email,
      org.created_at.toISOString(),
      org.updated_at?.toISOString() || '',
      org.stripe_customer_id || '',
      org.auto_topup_enabled ? 'Yes' : 'No',
      org.auto_topup_threshold?.toString() || '',
      org.auto_topup_amount?.toString() || '',
      org.credit_limit?.toString() || '',
      org.billing_alerts ? 'Yes' : 'No',
      org.usage_alerts ? 'Yes' : 'No',
    ])

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map((row) =>
        row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n')

    const now = new Date()
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="organizations-export-${now.toISOString().split('T')[0]}.csv"`,
      },
    })
  } catch (error) {
    console.error('Error exporting organizations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export const GET = withAdminAuth(exportOrganizations)
