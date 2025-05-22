import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
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

    // Check if repository exists
    const repository = await db
      .select()
      .from(schema.organizationRepository)
      .where(
        and(
          eq(schema.organizationRepository.id, repoId),
          eq(schema.organizationRepository.organization_id, orgId)
        )
      )
      .limit(1)

    if (repository.length === 0) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
    }

    // Deactivate repository (soft delete)
    await db
      .update(schema.organizationRepository)
      .set({ is_active: false })
      .where(eq(schema.organizationRepository.id, repoId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing repository:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
