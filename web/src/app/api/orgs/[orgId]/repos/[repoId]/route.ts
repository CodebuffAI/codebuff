import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, and } from 'drizzle-orm'

interface RouteParams {
  params: { orgId: string; repoId: string }
}

export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { orgId, repoId } = params

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

    // Check if repository exists
    const repository = await db
      .select()
      .from(schema.orgRepo)
      .where(
        and(
          eq(schema.orgRepo.id, repoId),
          eq(schema.orgRepo.org_id, orgId)
        )
      )
      .limit(1)

    if (repository.length === 0) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
    }

    // Permanently delete repository (hard delete)
    await db
      .delete(schema.orgRepo)
      .where(eq(schema.orgRepo.id, repoId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing repository:', error)
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

    const { orgId, repoId } = params
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

    // Check if repository exists
    const repository = await db
      .select()
      .from(schema.orgRepo)
      .where(
        and(
          eq(schema.orgRepo.id, repoId),
          eq(schema.orgRepo.org_id, orgId)
        )
      )
      .limit(1)

    if (repository.length === 0) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
    }

    // Update repository status
    await db
      .update(schema.orgRepo)
      .set({ is_active: body.isActive })
      .where(eq(schema.orgRepo.id, repoId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating repository:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
