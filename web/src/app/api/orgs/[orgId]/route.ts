import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'
import { OrganizationDetailsResponse } from 'common/types/organization'
import { calculateOrganizationUsageAndBalance } from '@codebuff/billing'

interface RouteParams {
  params: { orgId: string }
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse<OrganizationDetailsResponse | { error: string }>> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params

    // Check if user is a member of this organization
    const membership = await db
      .select({
        org: schema.org,
        role: schema.orgMember.role,
      })
      .from(schema.orgMember)
      .innerJoin(
        schema.org,
        eq(schema.orgMember.org_id, schema.org.id)
      )
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

    const { org: organization, role } = membership[0]

    // Get member and repository counts
    const [memberCount, repositoryCount] = await Promise.all([
      db
        .select({ count: schema.orgMember.user_id })
        .from(schema.orgMember)
        .where(eq(schema.orgMember.org_id, orgId))
        .then(result => result.length),
      db
        .select({ count: schema.orgRepo.id })
        .from(schema.orgRepo)
        .where(
          and(
            eq(schema.orgRepo.org_id, orgId),
            eq(schema.orgRepo.is_active, true)
          )
        )
        .then(result => result.length),
    ])

    // Get organization credit balance
    let creditBalance: number | undefined
    try {
      const now = new Date()
      const quotaResetDate = new Date(now.getFullYear(), now.getMonth(), 1) // First of current month
      const { balance } = await calculateOrganizationUsageAndBalance(
        orgId,
        quotaResetDate,
        now
      )
      creditBalance = balance.netBalance
    } catch (error) {
      // If no credits exist yet, that's fine
      console.log('No organization credits found:', error)
    }

    const response: OrganizationDetailsResponse = {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      description: organization.description || undefined,
      owner_id: organization.owner_id,
      created_at: organization.created_at.toISOString(),
      userRole: role,
      memberCount,
      repositoryCount,
      creditBalance,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching organization details:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params
    const body = await request.json()

    // Check if user is owner or admin
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

    const { role } = membership[0]
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Update organization
    const [updatedOrg] = await db
      .update(schema.org)
      .set({
        name: body.name,
        description: body.description,
        updated_at: new Date(),
      })
      .where(eq(schema.org.id, orgId))
      .returning()

    return NextResponse.json(updatedOrg)
  } catch (error) {
    console.error('Error updating organization:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
