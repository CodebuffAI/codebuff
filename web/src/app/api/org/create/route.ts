import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/env.mjs'
import db from 'common/src/db'
import * as schema from 'common/src/db/schema'
import { eq } from 'drizzle-orm'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { stripeServer } from 'common/src/util/stripe'

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
    const { name } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Organization name is required' },
        { status: 400 }
      )
    }

    // Get owner's details including Stripe info
    const owner = await db.query.user.findFirst({
      where: eq(schema.user.id, session.user.id || ''),
      columns: {
        id: true,
        email: true,
        stripe_customer_id: true,
        stripe_price_id: true,
      },
    })

    if (!owner) {
      return NextResponse.json(
        { error: 'Owner not found' },
        { status: 404 }
      )
    }

    // Create Stripe customer for organization
    const stripeCustomer = await stripeServer.customers.create({
      email: owner.email,
      name: name,
      metadata: {
        organization_name: name,
        owner_id: owner.id,
      },
    })

    // Create organization record
    const [organization] = await db
      .insert(schema.organization)
      .values({
        name,
        owner_id: owner.id,
        stripe_customer_id: stripeCustomer.id,
      })
      .returning()

    // Add owner as admin
    await db.insert(schema.organization_member).values({
      organization_id: organization.id,
      user_id: owner.id,
      role: 'admin',
    })

    // If owner has an active subscription, offer to replicate it
    if (owner.stripe_customer_id && owner.stripe_price_id) {
      const subscriptions = await stripeServer.subscriptions.list({
        customer: owner.stripe_customer_id,
        status: 'active',
        limit: 1,
      })

      if (subscriptions.data[0]?.id) {
        // Return subscription info so frontend can prompt user to replicate it
        return NextResponse.json({
          organization,
          can_replicate_subscription: true,
          subscription: {
            price_id: owner.stripe_price_id,
          },
        })
      }
    }

    return NextResponse.json({ 
      organization,
      can_replicate_subscription: false,
    })
  } catch (error) {
    console.error('Error creating organization:', error)
    return NextResponse.json(
      { error: 'Failed to create organization' },
      { status: 500 }
    )
  }
}
