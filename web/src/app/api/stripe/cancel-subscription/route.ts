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
  } catch (error: unknown) {
    const message =
      (error as { raw?: { message?: string } })?.raw?.message ||
      'Failed to cancel subscription in Stripe.'
    logger.error(
      { error: message, userId, subscriptionId: subscription.stripe_subscription_id },
      'Stripe subscription cancellation failed',
    )
    return NextResponse.json({ error: message }, { status: 500 })
  }

  try {
    await db
      .update(schema.subscription)
      .set({ cancel_at_period_end: true, scheduled_tier: null })
      .where(
        eq(
          schema.subscription.stripe_subscription_id,
          subscription.stripe_subscription_id,
        ),
      )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(
      { error: message, userId, subscriptionId: subscription.stripe_subscription_id },
      'Stripe subscription set to cancel but failed to update local DB — data is inconsistent',
    )
    return NextResponse.json(
      { error: 'Subscription canceled but failed to update records. Please contact support.' },
      { status: 500 },
    )
  }

  logger.info(
    { userId, subscriptionId: subscription.stripe_subscription_id },
    'Subscription set to cancel at period end',
  )

  return NextResponse.json({ success: true })
}
