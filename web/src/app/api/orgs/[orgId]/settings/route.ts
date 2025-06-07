import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, and } from 'drizzle-orm'

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

    const userRole = membership[0].role
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Get organization details
    const organization = await db
      .select()
      .from(schema.org)
      .where(eq(schema.org.id, orgId))
      .limit(1)

    if (organization.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const org = organization[0]

    // Return settings with default values for new fields
    const settings = {
      id: org.id,
      name: org.name,
      slug: org.slug,
      description: org.description,
      userRole,
      autoTopupEnabled: org.auto_topup_enabled || false,
      autoTopupThreshold: org.auto_topup_threshold || 500,
      autoTopupAmount: org.auto_topup_amount || 2000,
      creditLimit: org.credit_limit,
      billingAlerts: org.billing_alerts ?? true,
      usageAlerts: org.usage_alerts ?? true,
      weeklyReports: org.weekly_reports ?? false,
    }

    return NextResponse.json(settings)
  } catch (error) {
    console.error('Error fetching organization settings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
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

    const body = await request.json()
    const {
      name,
      description,
      autoTopupEnabled,
      autoTopupThreshold,
      autoTopupAmount,
      creditLimit,
      billingAlerts,
      usageAlerts,
      weeklyReports,
    } = body

    // Update organization settings
    await db
      .update(schema.org)
      .set({
        name,
        description,
        auto_topup_enabled: autoTopupEnabled,
        auto_topup_threshold: autoTopupThreshold,
        auto_topup_amount: autoTopupAmount,
        credit_limit: creditLimit,
        billing_alerts: billingAlerts,
        usage_alerts: usageAlerts,
        weekly_reports: weeklyReports,
        updated_at: new Date(),
      })
      .where(eq(schema.org.id, orgId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating organization settings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params

    // Check if user is the owner of this organization
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
    if (userRole !== 'owner') {
      return NextResponse.json({ error: 'Only organization owners can delete organizations' }, { status: 403 })
    }

    // Delete organization (this will cascade to related tables)
    await db
      .delete(schema.org)
      .where(eq(schema.org.id, orgId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting organization:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
