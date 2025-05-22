import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'
import { AddRepositoryRequest } from 'common/types/organization'
import { validateAndNormalizeRepositoryUrl } from '@codebuff/billing'

interface RouteParams {
  params: { orgId: string }
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params

    // Check if user is a member of this organization
    const membership = await db
      .select({ role: schema.organizationMember.role })
      .from(schema.organizationMember)
      .where(
        and(
          eq(schema.organizationMember.organization_id, orgId),
          eq(schema.organizationMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (membership.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get repositories
    const repositories = await db
      .select({
        id: schema.organizationRepository.id,
        repository_url: schema.organizationRepository.repository_url,
        repository_name: schema.organizationRepository.repository_name,
        approved_by: schema.organizationRepository.approved_by,
        approved_at: schema.organizationRepository.approved_at,
        is_active: schema.organizationRepository.is_active,
        approver: {
          name: schema.user.name,
          email: schema.user.email,
        },
      })
      .from(schema.organizationRepository)
      .innerJoin(schema.user, eq(schema.organizationRepository.approved_by, schema.user.id))
      .where(eq(schema.organizationRepository.organization_id, orgId))

    return NextResponse.json({ repositories })
  } catch (error) {
    console.error('Error fetching repositories:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId } = params
    const body: AddRepositoryRequest = await request.json()

    // Check if user is owner or admin
    const membership = await db
      .select({ role: schema.organizationMember.role })
      .from(schema.organizationMember)
      .where(
        and(
          eq(schema.organizationMember.organization_id, orgId),
          eq(schema.organizationMember.user_id, session.user.id)
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

    // Validate and normalize repository URL
    const validation = validateAndNormalizeRepositoryUrl(body.repository_url)
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || 'Invalid repository URL' },
        { status: 400 }
      )
    }

    const normalizedUrl = validation.normalizedUrl!

    // Check if repository already exists for this organization
    const existingRepo = await db
      .select()
      .from(schema.organizationRepository)
      .where(
        and(
          eq(schema.organizationRepository.organization_id, orgId),
          eq(schema.organizationRepository.repository_url, normalizedUrl)
        )
      )
      .limit(1)

    if (existingRepo.length > 0) {
      return NextResponse.json(
        { error: 'Repository already added to organization' },
        { status: 409 }
      )
    }

    // Add repository
    const [newRepo] = await db
      .insert(schema.organizationRepository)
      .values({
        organization_id: orgId,
        repository_url: normalizedUrl,
        repository_name: body.repository_name,
        approved_by: session.user.id,
      })
      .returning()

    return NextResponse.json(newRepo, { status: 201 })
  } catch (error) {
    console.error('Error adding repository:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
