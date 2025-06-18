import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { logger } from '@/util/logger'

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
    const userMembership = await db
      .select({ role: schema.orgMember.role })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (userMembership.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get all pending invitations
    const invitations = await db
      .select({
        id: schema.orgInvite.id,
        email: schema.orgInvite.email,
        role: schema.orgInvite.role,
        invited_by_name: schema.user.name,
        created_at: schema.orgInvite.created_at,
        expires_at: schema.orgInvite.expires_at,
      })
      .from(schema.orgInvite)
      .innerJoin(schema.user, eq(schema.orgInvite.invited_by, schema.user.id))
      .where(
        and(
          eq(schema.orgInvite.org_id, orgId),
          isNull(schema.orgInvite.accepted_at)
        )
      )

    return NextResponse.json({ invitations })
  } catch (error) {
    console.error('Error fetching organization invitations:', error)
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

    const { role: userRole } = membership[0]
    if (userRole !== 'owner' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Check if invitation already exists
    const existingInvitation = await db
      .select()
      .from(schema.orgInvite)
      .where(
        and(
          eq(schema.orgInvite.org_id, orgId),
          eq(schema.orgInvite.email, body.email),
          isNull(schema.orgInvite.accepted_at)
        )
      )
      .limit(1)

    if (existingInvitation.length > 0) {
      return NextResponse.json(
        { error: 'Invitation already exists for this email' },
        { status: 409 }
      )
    }

    // Create invitation
    const token = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days from now

    await db.insert(schema.orgInvite).values({
      org_id: orgId,
      email: body.email,
      role: body.role,
      token,
      invited_by: session.user.id,
      expires_at: expiresAt,
    })

    logger.info(
      { orgId, email: body.email, role: body.role },
      'Organization invitation created'
    )

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error('Error creating invitation:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
