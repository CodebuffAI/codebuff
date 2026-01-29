import { getActiveSubscription } from '@codebuff/billing'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const subscription = await getActiveSubscription({ userId, logger })
  if (!subscription) {
    return NextResponse.json(
      { error: 'No active subscription found.' },
      { status: 404 },
    )
  }

  try {
    await stripeServer.subscriptions.update(
      subscription.stripe_subscription_id,
      { cancel_at_period_end: true },
    )

    await db
      .update(schema.subscription)
      .set({ cancel_at_period_end: true, scheduled_tier: null, updated_at: new Date() })
      .where(
        eq(
          schema.subscription.stripe_subscription_id,
          subscription.stripe_subscription_id,
        ),
      )

    logger.info(
      { userId, subscriptionId: subscription.stripe_subscription_id },
      'Subscription set to cancel at period end',
    )

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message =
      (error as { raw?: { message?: string } })?.raw?.message ||
      'Internal server error canceling subscription.'
    logger.error(
      { error: message, userId, subscriptionId: subscription.stripe_subscription_id },
      'Failed to cancel subscription',
    )
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
