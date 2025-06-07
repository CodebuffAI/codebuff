import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, and } from 'drizzle-orm'
import { AddRepositoryRequest } from 'common/types/organization'
import { validateAndNormalizeRepositoryUrl, extractOwnerAndRepo } from '@codebuff/billing'

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

    // Get repositories
    const repositories = await db
      .select({
        id: schema.orgRepo.id,
        repository_url: schema.orgRepo.repo_url,
        repository_name: schema.orgRepo.repo_name,
        repo_owner: schema.orgRepo.repo_owner,
        approved_by: schema.orgRepo.approved_by,
        approved_at: schema.orgRepo.approved_at,
        is_active: schema.orgRepo.is_active,
        approver: {
          name: schema.user.name,
          email: schema.user.email,
        },
      })
      .from(schema.orgRepo)
      .innerJoin(schema.user, eq(schema.orgRepo.approved_by, schema.user.id))
      .where(eq(schema.orgRepo.org_id, orgId))

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

    // Validate and normalize repository URL
    const validation = validateAndNormalizeRepositoryUrl(body.repository_url)
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || 'Invalid repository URL' },
        { status: 400 }
      )
    }

    const normalizedUrl = validation.normalizedUrl!

    // Extract repository owner from URL
    const ownerAndRepo = extractOwnerAndRepo(normalizedUrl)
    const repoOwner = ownerAndRepo?.owner || null

    // Check if repository already exists for this organization
    const existingRepo = await db
      .select()
      .from(schema.orgRepo)
      .where(
        and(
          eq(schema.orgRepo.org_id, orgId),
          eq(schema.orgRepo.repo_url, normalizedUrl)
        )
      )
      .limit(1)

    if (existingRepo.length > 0) {
      return NextResponse.json(
        { error: 'Repository already added to organization' },
        { status: 409 }
      )
    }

    // Add repository with repo_owner field populated
    const [newRepo] = await db
      .insert(schema.orgRepo)
      .values({
        org_id: orgId,
        repo_url: normalizedUrl,
        repo_name: body.repository_name,
        repo_owner: repoOwner,
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
