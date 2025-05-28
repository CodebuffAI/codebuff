import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'
import { OrganizationDetailsResponse } from 'common/types/organization'
import { calculateOrganizationUsageAndBalance } from '@codebuff/billing'

interface RouteParams {
  params: { slug: string }
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

    const { slug } = params

    // Check if user is a member of this organization (lookup by slug)
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
          eq(schema.org.slug, slug),
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
        .where(eq(schema.orgMember.org_id, organization.id))
        .then(result => result.length),
      db
        .select({ count: schema.orgRepo.id })
        .from(schema.orgRepo)
        .where(
          and(
            eq(schema.orgRepo.org_id, organization.id),
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
        organization.id,
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
    console.error('Error fetching organization details by slug:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
