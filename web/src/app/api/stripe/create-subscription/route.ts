import { getActiveSubscription, getPriceIdFromTier } from '@codebuff/billing'
import { SUBSCRIPTION_TIERS } from '@codebuff/common/constants/subscription-plans'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import type { SubscriptionTierPrice } from '@codebuff/common/constants/subscription-plans'
import type { NextRequest } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const body = await req.json().catch(() => null)
  const rawTier = Number(body?.tier)
  if (!rawTier || !(rawTier in SUBSCRIPTION_TIERS)) {
    return NextResponse.json(
      { error: `Invalid tier. Must be one of: ${Object.keys(SUBSCRIPTION_TIERS).join(', ')}.` },
      { status: 400 },
    )
  }
  const tier = rawTier as SubscriptionTierPrice

  const priceId = getPriceIdFromTier(tier)
  if (!priceId) {
    return NextResponse.json(
      { error: 'Subscription tier not available' },
      { status: 503 },
    )
  }

  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { stripe_customer_id: true, banned: true },
  })

  if (user?.banned) {
    logger.warn({ userId }, 'Banned user attempted to create subscription')
    return NextResponse.json(
      { error: 'Your account has been suspended. Please contact support.' },
      { status: 403 },
    )
  }

  if (!user?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'Stripe customer not found.' },
      { status: 400 },
    )
  }

  const existing = await getActiveSubscription({ userId, logger })
  if (existing) {
    return NextResponse.json(
      { error: 'You already have an active subscription.' },
      { status: 409 },
    )
  }

  try {
    const checkoutSession = await stripeServer.checkout.sessions.create({
      customer: user.stripe_customer_id,
      mode: 'subscription',
      tax_id_collection: { enabled: true },  // optional (EU B2B)
      customer_update: { name: "auto", address: "auto" },
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/profile?tab=usage&subscription_success=true`,
      cancel_url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/pricing?canceled=true`,
      metadata: {
        userId,
        type: 'strong_subscription',
      },
      subscription_data: {
        description: `Codebuff Strong — $${tier}/mo`,
        metadata: {
          userId,
        },
      },
    })

    if (!checkoutSession.url) {
      logger.error({ userId }, 'Stripe checkout session created without a URL')
      return NextResponse.json(
        { error: 'Could not create checkout session.' },
        { status: 500 },
      )
    }

    logger.info(
      { userId, sessionId: checkoutSession.id, tier },
      'Created Strong subscription checkout session',
    )

    return NextResponse.json({ sessionId: checkoutSession.id })
  } catch (error: unknown) {
    const message =
      (error as { raw?: { message?: string } })?.raw?.message ||
      'Internal server error creating subscription.'
    logger.error(
      { error: message, userId },
      'Failed to create subscription checkout',
    )
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
