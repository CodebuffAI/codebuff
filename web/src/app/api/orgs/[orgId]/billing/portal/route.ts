import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { eq, and } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import type { NextRequest } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { ORG_BILLING_ENABLED } from '@/lib/billing-config'
import { logger } from '@/util/logger'

interface RouteParams {
  params: Promise<{
    orgId: string
  }>
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  if (!ORG_BILLING_ENABLED) {
    return NextResponse.json(
      { error: 'Organization billing is temporarily disabled' },
      { status: 503 }
    )
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = await params

  try {
    // Check if user has access to this organization
    const membership = await db
      .select({
        role: schema.orgMember.role,
        organization: schema.org,
      })
      .from(schema.orgMember)
      .innerJoin(schema.org, eq(schema.orgMember.org_id, schema.org.id))
      .where(
        and(
          eq(schema.orgMember.org_id, orgId),
          eq(schema.orgMember.user_id, session.user.id),
        ),
      )
      .limit(1)

    if (membership.length === 0) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 },
      )
    }

    const { role, organization } = membership[0]

    // Check if user has permission to access billing
    if (role !== 'owner' && role !== 'admin') {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 },
      )
    }

    if (!organization.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No Stripe customer ID found for organization' },
        { status: 400 },
      )
    }

    const portalSession = await stripeServer.billingPortal.sessions.create({
      customer: organization.stripe_customer_id,
      return_url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/orgs/${organization.slug}/settings`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    logger.error(
      { userId: session.user.id, orgId, error },
      'Failed to create org billing portal session',
    )
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 },
    )
  }
}
