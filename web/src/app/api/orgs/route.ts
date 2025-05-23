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
        organization: schema.org,
        role: schema.orgMember.role,
      })
      .from(schema.orgMember)
      .innerJoin(
        schema.org,
        eq(schema.orgMember.org_id, schema.org.id)
      )
      .where(eq(schema.orgMember.user_id, session.user.id))

    // Get member and repository counts for each organization
    const organizations = await Promise.all(
      memberships.map(async ({ organization, role }) => {
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
    const { name, description } = body

    // Validate input
    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    // Generate slug from name
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens

    // Ensure slug is unique by appending number if needed
    let slug = baseSlug
    let counter = 1
    
    while (true) {
      const existingOrg = await db
        .select()
        .from(schema.org)
        .where(eq(schema.org.slug, slug))
        .limit(1)

      if (existingOrg.length === 0) {
        break // Slug is unique
      }
      
      slug = `${baseSlug}-${counter}`
      counter++
    }

    // Create organization
    const [newOrg] = await db
      .insert(schema.org)
      .values({
        name,
        slug,
        description,
        owner_id: session.user.id,
      })
      .returning()

    // Add creator as owner member
    await db.insert(schema.orgMember).values({
      org_id: newOrg.id,
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
