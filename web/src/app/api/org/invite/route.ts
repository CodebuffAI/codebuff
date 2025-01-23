import { NextRequest, NextResponse } from 'next/server'
import { env } from '../../../../env.mjs'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, or, ilike, and } from 'drizzle-orm'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/auth-options'

// Search for users by email or name
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('query')
  const orgId = searchParams.get('orgId')
  
  if (!query || !orgId) {
    return NextResponse.json({ users: [] })
  }

  // Check if user is admin of the organization
  const isAdmin = await db
    .select()
    .from(schema.organization_member)
    .where(
      and(
        eq(schema.organization_member.organization_id, orgId),
        eq(schema.organization_member.user_id, session.user.id || ''),
        eq(schema.organization_member.role, 'admin')
      )
    )
    .limit(1)

  if (isAdmin.length === 0) {
    return NextResponse.json(
      { error: 'Unauthorized - must be organization admin' },
      { status: 403 }
    )
  }

  // Search for users
  const users = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      name: schema.user.name,
      image: schema.user.image,
    })
    .from(schema.user)
    .where(
      or(
        ilike(schema.user.email, `%${query}%`),
        ilike(schema.user.name || '', `%${query}%`)
      )
    )
    .limit(10)

  return NextResponse.json({ users })
}

// Send invitation to join organization
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { orgId, inviteeUserId, role = 'member' } = body

    // Verify sender is admin
    const isAdmin = await db
      .select()
      .from(schema.organization_member)
      .where(
        and(
          eq(schema.organization_member.organization_id, orgId),
          eq(schema.organization_member.user_id, session.user.id || ''),
          eq(schema.organization_member.role, 'admin')
        )
      )
      .limit(1)

    if (isAdmin.length === 0) {
      return NextResponse.json(
        { error: 'Unauthorized - must be organization admin' },
        { status: 403 }
      )
    }

    // Get organization details
    const org = await db
      .select({
        name: schema.organization.name,
      })
      .from(schema.organization)
      .where(eq(schema.organization.id, orgId))
      .limit(1)

    if (!org[0]) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Check if user is already a member
    const existingMember = await db
      .select()
      .from(schema.organization_member)
      .where(
        and(
          eq(schema.organization_member.organization_id, orgId),
          eq(schema.organization_member.user_id, inviteeUserId)
        )
      )
      .limit(1)

    if (existingMember.length > 0) {
      return NextResponse.json(
        { error: 'User is already a member of this organization' },
        { status: 400 }
      )
    }

    // Insert into organization_member
    await db.insert(schema.organization_member).values({
      organization_id: orgId,
      user_id: inviteeUserId,
      role,
    })

    // Get invitee details for email
    const invitee = await db
      .select({
        email: schema.user.email,
        name: schema.user.name,
      })
      .from(schema.user)
      .where(eq(schema.user.id, inviteeUserId))
      .limit(1)

    if (!invitee[0]) {
      return NextResponse.json(
        { error: 'Invitee not found' },
        { status: 404 }
      )
    }

    // Send invitation email via Loops
    await fetch('https://app.loops.so/api/v1/events/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LOOPS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventName: 'org_invite_sent',
        email: invitee[0].email,
        data: {
          inviteeName: invitee[0].name || invitee[0].email,
          inviterEmail: session.user.email,
          inviterName: session.user.name || session.user.email,
          orgName: org[0].name,
          role,
        },
      }),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error sending organization invitation:', error)
    return NextResponse.json(
      { error: 'Failed to send invitation' },
      { status: 500 }
    )
  }
}
