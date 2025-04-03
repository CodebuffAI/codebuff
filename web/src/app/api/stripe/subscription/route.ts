import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { getCurrentSubscription } from 'common/src/util/stripe'
import { getPlanFromPriceId } from '@/lib/stripe-utils'
import type Stripe from 'stripe'

export const GET = async (request: Request) => {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return NextResponse.json(
      { error: { code: 'no-access', message: 'You are not signed in.' } },
      { status: 401 }
    )
  }

  try {
    const subscription = await getCurrentSubscription(
      session.user.stripe_customer_id
    )
    const basePriceItem = subscription?.items.data.find(
      (item: Stripe.SubscriptionItem) =>
        item.price.recurring?.usage_type === 'licensed'
    )

    const currentPlan = getPlanFromPriceId(basePriceItem?.price.id)

    return NextResponse.json({ currentPlan })
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
