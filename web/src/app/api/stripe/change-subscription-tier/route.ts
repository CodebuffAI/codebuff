import {
  expireActiveBlockGrants,
  getActiveSubscription,
  getPriceIdFromTier,
} from '@codebuff/billing'
import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { SUBSCRIPTION_TIERS } from '@codebuff/common/constants/subscription-plans'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
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

  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { banned: true },
  })

  if (user?.banned) {
    logger.warn({ userId }, 'Banned user attempted to change subscription tier')
    return NextResponse.json(
      { error: 'Your account has been suspended. Please contact support.' },
      { status: 403 },
    )
  }

  const body = await req.json().catch(() => null)
  const rawTier = Number(body?.tier)
  if (!rawTier || !(rawTier in SUBSCRIPTION_TIERS)) {
    return NextResponse.json(
      { error: `Invalid tier. Must be one of: ${Object.keys(SUBSCRIPTION_TIERS).join(', ')}.` },
      { status: 400 },
    )
  }
  const tier = rawTier as SubscriptionTierPrice

  const subscription = await getActiveSubscription({ userId, logger })
  if (!subscription) {
    return NextResponse.json(
      { error: 'No active subscription found.' },
      { status: 404 },
    )
  }

  if (subscription.tier == null) {
    logger.error(
      { userId, subscriptionId: subscription.stripe_subscription_id },
      'Subscription has no tier configured',
    )
    return NextResponse.json(
      { error: 'Subscription has no tier configured.' },
      { status: 400 },
    )
  }

  if (tier === subscription.tier && subscription.scheduled_tier == null) {
    return NextResponse.json(
      { error: 'Already on the requested tier.' },
      { status: 400 },
    )
  }

  if (subscription.scheduled_tier === tier) {
    return NextResponse.json(
      { error: 'Already scheduled for that tier.' },
      { status: 400 },
    )
  }

  const isCancelDowngrade = tier === subscription.tier && subscription.scheduled_tier != null
  const isUpgrade = !isCancelDowngrade && tier > subscription.tier

  const newPriceId = getPriceIdFromTier(tier)
  if (!newPriceId) {
    return NextResponse.json(
      { error: 'Subscription tier not available' },
      { status: 503 },
    )
  }

  try {
    const stripeSub = await stripeServer.subscriptions.retrieve(
      subscription.stripe_subscription_id,
    )
    const itemId = stripeSub.items.data[0]?.id
    if (!itemId) {
      logger.error(
        { userId, subscriptionId: subscription.stripe_subscription_id },
        'Stripe subscription has no items',
      )
      return NextResponse.json(
        { error: 'Subscription configuration error.' },
        { status: 500 },
      )
    }

    await stripeServer.subscriptions.update(
      subscription.stripe_subscription_id,
      {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: isUpgrade ? 'always_invoice' : 'none',
      },
    )

    try {
      if (isCancelDowngrade) {
        await db
          .update(schema.subscription)
          .set({ scheduled_tier: null })
          .where(
            eq(
              schema.subscription.stripe_subscription_id,
              subscription.stripe_subscription_id,
            ),
          )
      } else if (isUpgrade) {
        await Promise.all([
          db
            .update(schema.subscription)
            .set({
              tier,
              stripe_price_id: newPriceId,
              scheduled_tier: null,
            })
            .where(
              eq(
                schema.subscription.stripe_subscription_id,
                subscription.stripe_subscription_id,
              ),
            ),
          expireActiveBlockGrants({
            userId,
            subscriptionId: subscription.stripe_subscription_id,
            logger,
          }),
        ])
      } else {
        // Downgrade — only schedule the new lower tier for next billing period.
        // Keep current tier and stripe_price_id unchanged so limits stay.
        await db
          .update(schema.subscription)
          .set({
            scheduled_tier: tier,
          })
          .where(
            eq(
              schema.subscription.stripe_subscription_id,
              subscription.stripe_subscription_id,
            ),
          )
      }
    } catch (dbError) {
      logger.error(
        { error: dbError, userId, subscriptionId: subscription.stripe_subscription_id },
        'DB update failed after Stripe tier change — webhook will reconcile',
      )
    }

    trackEvent({
      event: AnalyticsEvent.SUBSCRIPTION_TIER_CHANGED,
      userId,
      properties: {
        subscriptionId: subscription.stripe_subscription_id,
        previousTier: subscription.tier,
        newTier: tier,
        isUpgrade,
        isCancelDowngrade,
      },
      logger,
    })

    const logMessage = isCancelDowngrade
      ? 'Pending downgrade canceled'
      : isUpgrade
        ? 'Subscription upgraded — billed immediately'
        : 'Subscription downgraded — scheduled for next billing period'

    logger.info(
      {
        userId,
        subscriptionId: subscription.stripe_subscription_id,
        previousTier: subscription.tier,
        newTier: tier,
        isUpgrade,
        isCancelDowngrade,
      },
      logMessage,
    )

    return NextResponse.json({ success: true, previousTier: subscription.tier, newTier: tier })
  } catch (error: unknown) {
    const message = error instanceof Error
      ? error.message
      : 'Internal server error changing subscription tier.'
    logger.error(
      {
        error,
        userId,
        subscriptionId: subscription.stripe_subscription_id,
      },
      'Failed to change subscription tier',
    )
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
