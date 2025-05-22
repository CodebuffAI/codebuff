import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'
import { CreateOrganizationRequest, ListOrganizationsResponse } from 'common/types/organization'
import { generateOperationIdTimestamp } from '@codebuff/billing'

export async function GET(): Promise<NextResponse<ListOrganizationsResponse | { error: string }>> {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get organizations where user is a member
    const memberships = await db
      .select({
        organization: schema.organization,
        role: schema.organizationMember.role,
      })
      .from(schema.organizationMember)
      .innerJoin(
        schema.organization,
        eq(schema.organizationMember.organization_id, schema.organization.id)
      )
      .where(eq(schema.organizationMember.user_id, session.user.id))

    // Get member and repository counts for each organization
    const organizations = await Promise.all(
      memberships.map(async ({ organization, role }) => {
        const [memberCount, repositoryCount] = await Promise.all([
          db
            .select({ count: schema.organizationMember.user_id })
            .from(schema.organizationMember)
            .where(eq(schema.organizationMember.organization_id, organization.id))
            .then(result => result.length),
          db
            .select({ count: schema.organizationRepository.id })
            .from(schema.organizationRepository)
            .where(
              and(
                eq(schema.organizationRepository.organization_id, organization.id),
                eq(schema.organizationRepository.is_active, true)
              )
            )
            .then(result => result.length),
        ])

        return {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          role,
          memberCount,
          repositoryCount,
        }
      })
    )

    return NextResponse.json({ organizations })
  } catch (error) {
    console.error('Error fetching organizations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: CreateOrganizationRequest = await request.json()
    const { name, slug, description } = body

    // Validate input
    if (!name || !slug) {
      return NextResponse.json(
        { error: 'Name and slug are required' },
        { status: 400 }
      )
    }

    // Check if slug is already taken
    const existingOrg = await db
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.slug, slug))
      .limit(1)

    if (existingOrg.length > 0) {
      return NextResponse.json(
        { error: 'Organization slug already exists' },
        { status: 409 }
      )
    }

    // Create organization
    const [newOrg] = await db
      .insert(schema.organization)
      .values({
        name,
        slug,
        description,
        owner_id: session.user.id,
      })
      .returning()

    // Add creator as owner member
    await db.insert(schema.organizationMember).values({
      organization_id: newOrg.id,
      user_id: session.user.id,
      role: 'owner',
    })

    return NextResponse.json(newOrg, { status: 201 })
  } catch (error) {
    console.error('Error creating organization:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
