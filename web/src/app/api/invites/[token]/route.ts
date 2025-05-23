import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and, gt, isNull } from 'drizzle-orm'
import { sendOrganizationWelcomeEmail } from '@/lib/loops-email'
import { logger } from '@/util/logger'

interface RouteParams {
  params: { token: string }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { token } = params

    // Get invitation details
    const invitation = await db
      .select({
        id: schema.orgInvite.id,
        org_id: schema.orgInvite.org_id,
        email: schema.orgInvite.email,
        role: schema.orgInvite.role,
        expires_at: schema.orgInvite.expires_at,
        accepted_at: schema.orgInvite.accepted_at,
        organization_name: schema.org.name,
        organization_slug: schema.org.slug,
        inviter_name: schema.user.name,
      })
      .from(schema.orgInvite)
      .innerJoin(schema.org, eq(schema.orgInvite.org_id, schema.org.id))
      .innerJoin(schema.user, eq(schema.orgInvite.invited_by, schema.user.id))
      .where(eq(schema.orgInvite.token, token))
      .limit(1)

    if (invitation.length === 0) {
      return NextResponse.json(
        { error: 'Invalid invitation token' },
        { status: 404 }
      )
    }

    const inv = invitation[0]

    // Check if invitation has expired
    if (inv.expires_at < new Date()) {
      return NextResponse.json(
        { error: 'Invitation has expired' },
        { status: 410 }
      )
    }

    // Check if invitation has already been accepted
    if (inv.accepted_at) {
      return NextResponse.json(
        { error: 'Invitation has already been accepted' },
        { status: 410 }
      )
    }

    return NextResponse.json({
      invitation: {
        organization_name: inv.organization_name,
        organization_slug: inv.organization_slug,
        email: inv.email,
        role: inv.role,
        inviter_name: inv.inviter_name,
        expires_at: inv.expires_at.toISOString(),
      },
    })
  } catch (error) {
    logger.error({ token: params.token, error }, 'Error fetching invitation')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token } = params

    // Get invitation details
    const invitation = await db
      .select()
      .from(schema.orgInvite)
      .innerJoin(schema.org, eq(schema.orgInvite.org_id, schema.org.id))
      .where(
        and(
          eq(schema.orgInvite.token, token),
          gt(schema.orgInvite.expires_at, new Date()),
          isNull(schema.orgInvite.accepted_at)
        )
      )
      .limit(1)

    if (invitation.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation' },
        { status: 404 }
      )
    }

    const inv = invitation[0].org_invite
    const org = invitation[0].org

    // Check if the invitation email matches the logged-in user's email
    if (inv.email !== session.user.email) {
      return NextResponse.json(
        { error: 'Invitation email does not match your account' },
        { status: 403 }
      )
    }

    // Check if user is already a member
    const existingMember = await db
      .select()
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, inv.org_id),
          eq(schema.orgMember.user_id, session.user.id)
        )
      )
      .limit(1)

    if (existingMember.length > 0) {
      return NextResponse.json(
        { error: 'You are already a member of this organization' },
        { status: 409 }
      )
    }

    // Accept the invitation in a transaction
    await db.transaction(async (tx) => {
      // Add user to organization
      await tx.insert(schema.orgMember).values({
        org_id: inv.org_id,
        user_id: session.user!.id,
        role: inv.role,
      })

      // Mark invitation as accepted
      await tx
        .update(schema.orgInvite)
        .set({
          accepted_at: new Date(),
          accepted_by: session.user!.id,
        })
        .where(eq(schema.orgInvite.id, inv.id))
    })

    // Send welcome email
    await sendOrganizationWelcomeEmail({
      email: session.user.email!,
      firstName: session.user.name?.split(' ')[0],
      organizationName: org.name,
      role: inv.role,
    })

    logger.info(
      {
        organizationId: inv.org_id,
        userId: session.user!.id,
        email: session.user!.email!,
        role: inv.role,
      },
      'User accepted organization invitation'
    )

    return NextResponse.json({
      success: true,
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: inv.role,
      },
    })
  } catch (error) {
    logger.error({ token: params.token, error }, 'Error accepting invitation')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
