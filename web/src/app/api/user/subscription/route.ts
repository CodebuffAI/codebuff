import {
  checkRateLimit,
  getActiveSubscription,
  getSubscriptionLimits,
} from '@codebuff/billing'
import { SUBSCRIPTION_DISPLAY_NAME } from '@codebuff/common/constants/subscription-plans'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

import type {
  NoSubscriptionResponse,
  ActiveSubscriptionResponse,
} from '@codebuff/common/types/subscription'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  // Fetch user preference for always use a-la-carte
  const [subscription, userPrefs] = await Promise.all([
    getActiveSubscription({ userId, logger }),
    db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: { fallback_to_a_la_carte: true },
    }),
  ])

  const fallbackToALaCarte = userPrefs?.fallback_to_a_la_carte ?? false

  if (!subscription || !subscription.tier) {
    const response: NoSubscriptionResponse = { hasSubscription: false, fallbackToALaCarte }
    return NextResponse.json(response)
  }

  const [rateLimit, limits] = await Promise.all([
    checkRateLimit({ userId, subscription, logger }),
    getSubscriptionLimits({ userId, logger, tier: subscription.tier }),
  ])

  const response: ActiveSubscriptionResponse = {
    hasSubscription: true,
    displayName: SUBSCRIPTION_DISPLAY_NAME,
    subscription: {
      id: subscription.stripe_subscription_id,
      status: subscription.status,
      billingPeriodEnd: subscription.billing_period_end.toISOString(),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at?.toISOString() ?? null,
      tier: subscription.tier,
      scheduledTier: subscription.scheduled_tier,
    },
    rateLimit: {
      limited: rateLimit.limited,
      reason: rateLimit.reason,
      canStartNewBlock: rateLimit.canStartNewBlock,
      blockUsed: rateLimit.blockUsed,
      blockLimit: rateLimit.blockLimit,
      blockResetsAt: rateLimit.blockResetsAt?.toISOString(),
      weeklyUsed: rateLimit.weeklyUsed,
      weeklyLimit: rateLimit.weeklyLimit,
      weeklyResetsAt: rateLimit.weeklyResetsAt.toISOString(),
      weeklyPercentUsed: rateLimit.weeklyPercentUsed,
    },
    limits,
    fallbackToALaCarte,
  }
  return NextResponse.json(response)
}
