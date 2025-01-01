import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { stripeServer } from 'common/src/util/stripe'
import { authOptions } from '../../auth/[...nextauth]/auth-options'
import { env } from '@/env.mjs'
import { PlanName } from 'common/src/types/plan'

export const GET = async () => {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json(
      {
        error: {
          code: 'no-access',
          message: 'You are not signed in.',
        },
      },
      { status: 401 }
    )
  }

  if (!session.user.stripe_price_id) {
    return NextResponse.json({ currentPlan: null })
  }

  try {
    const subscription = await stripeServer.subscriptions.retrieve(
      session.user.stripe_price_id
    )

    // Get the base subscription price (not the metered price)
    const basePriceItem = subscription.items.data.find(
      (item) => item.price.recurring?.usage_type === 'licensed'
    )

    // Map price IDs to plan names
    let currentPlan: PlanName | null = null
    if (basePriceItem?.price.id === env.STRIPE_PRO_PRICE_ID) {
      currentPlan = 'Pro'
    } else if (basePriceItem?.price.id === env.STRIPE_MOAR_PRO_PRICE_ID) {
      currentPlan = 'Moar Pro'
    }

    return NextResponse.json({
      currentPlan,
    } as { currentPlan: PlanName | null })
  } catch (error) {
    console.error('Error fetching subscription:', error)
    return NextResponse.json(
      {
        error: {
          code: 'stripe-error',
          message: 'Failed to fetch subscription details',
        },
      },
      { status: 500 }
    )
  }
}
