import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'
import { UpdateMemberRoleRequest } from 'common/types/organization'

interface RouteParams {
  params: { orgId: string; userId: string }
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

    const { orgId, userId } = params
    const body: UpdateMemberRoleRequest = await request.json()

    // Check if current user is owner or admin
    const currentUserMembership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (currentUserMembership.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const { role: currentUserRole } = currentUserMembership[0]
    if (currentUserRole !== 'owner' && currentUserRole !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Get target member's current role
    const targetMembership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, userId)
        )
      )
      .limit(1)

    if (targetMembership.length === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const { role: targetRole } = targetMembership[0]

    // Only owners can change owner roles
    if (targetRole === 'owner') {
      if (currentUserRole !== 'owner') {
        return NextResponse.json({ error: 'Only owners can modify owner roles' }, { status: 403 })
      }
    }

    // Update member role
    await db
      .update(schema.orgMember)
      .set({ role: body.role })
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, userId)
        )
      )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating member role:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
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

    const { orgId, userId } = params

    // Check if current user is owner or admin, or removing themselves
    const currentUserMembership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (currentUserMembership.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const { role: currentUserRole } = currentUserMembership[0]
    const isRemovingSelf = session.user.id === userId

    if (!isRemovingSelf && currentUserRole !== 'owner' && currentUserRole !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Get target member's role
    const targetMembership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, userId)
        )
      )
      .limit(1)

    if (targetMembership.length === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    const { role: targetRole } = targetMembership[0]

    // Only owners can remove other owners
    if (targetRole === 'owner' && !isRemovingSelf && currentUserRole !== 'owner') {
      return NextResponse.json({ error: 'Only owners can remove other owners' }, { status: 403 })
    }

    // Remove member
    await db
      .delete(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, userId)
        )
      )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing member:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
