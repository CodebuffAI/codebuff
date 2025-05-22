import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'
import { stripeServer } from 'common/util/stripe'
import { logger } from '@/util/logger'

interface RouteParams {
  params: { orgId: string }
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

    // Check if user is owner of this organization
    const membership = await db
      .select({ 
        role: schema.orgMember.role,
        organization: schema.org,
        user: schema.user
      })
      .from(schema.orgMember)
      .innerJoin(
        schema.org,
        eq(schema.orgMember.org_id, schema.org.id)
      )
      .innerJoin(
        schema.user,
        eq(schema.orgMember.user_id, schema.user.id)
      )
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

    const { role, organization, user } = membership[0]
    if (role !== 'owner') {
      return NextResponse.json({ 
        error: 'Only organization owners can set up billing' 
      }, { status: 403 })
    }

    // Check if organization already has Stripe customer
    if (organization.stripe_customer_id) {
      return NextResponse.json({
        error: 'Billing is already set up for this organization',
        stripe_customer_id: organization.stripe_customer_id,
      }, { status: 409 })
    }

    // Create Stripe customer for organization
    const stripeCustomer = await stripeServer.customers.create({
      name: organization.name,
      description: `Organization: ${organization.name} (${organization.slug})`,
      email: user.email, // Use owner's email for billing notifications
      metadata: {
        organization_id: organization.id,
        organization_slug: organization.slug,
        owner_id: organization.owner_id,
        type: 'organization',
      },
    })

    // Update organization with Stripe customer ID
    await db
      .update(schema.org)
      .set({ 
        stripe_customer_id: stripeCustomer.id,
        updated_at: new Date(),
      })
      .where(eq(schema.org.id, orgId))

    logger.info(
      { 
        organizationId: orgId, 
        stripeCustomerId: stripeCustomer.id,
        ownerId: session.user.id 
      },
      'Successfully set up organization billing'
    )

    return NextResponse.json({ 
      success: true,
      stripe_customer_id: stripeCustomer.id,
      billing_portal_url: null, // Will be available after first payment method is added
    })
  } catch (error) {
    logger.error(
      { organizationId: params.orgId, error },
      'Error setting up organization billing'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
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
      .select({ 
        role: schema.orgMember.role,
        organization: schema.org
      })
      .from(schema.orgMember)
      .innerJoin(
        schema.org,
        eq(schema.orgMember.org_id, schema.org.id)
      )
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

    const { role, organization } = membership[0]

    // Generate billing portal URL if Stripe customer exists
    let billing_portal_url = null
    if (organization.stripe_customer_id && (role === 'owner' || role === 'admin')) {
      try {
        const portalSession = await stripeServer.billingPortal.sessions.create({
          customer: organization.stripe_customer_id,
          return_url: `${request.nextUrl.origin}/organizations/${orgId}`,
        })
        billing_portal_url = portalSession.url
      } catch (error) {
        logger.warn(
          { organizationId: orgId, stripeCustomerId: organization.stripe_customer_id },
          'Failed to create billing portal session'
        )
      }
    }

    return NextResponse.json({
      is_setup: !!organization.stripe_customer_id,
      stripe_customer_id: organization.stripe_customer_id,
      billing_portal_url,
      user_role: role,
    })
  } catch (error) {
    logger.error(
      { organizationId: params.orgId, error },
      'Error fetching organization billing status'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
