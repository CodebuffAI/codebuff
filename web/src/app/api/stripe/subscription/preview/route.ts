import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { stripeServer } from 'common/src/util/stripe'
import { authOptions } from '../../../auth/[...nextauth]/auth-options'
import { env } from '@/env.mjs'
import { PlanName } from 'common/src/types/plan'

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const targetPlan = searchParams.get('targetPlan') as PlanName
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

  try {
    // Get current subscription if any
    const subscriptions = await stripeServer.subscriptions.list({
      customer: session.user.stripe_customer_id,
      status: 'active',
      limit: 1,
    })

    const currentSubscription = subscriptions.data[0]

    // Get the price ID for the target plan
    const priceId =
      targetPlan === 'Pro'
        ? env.STRIPE_PRO_PRICE_ID
        : env.STRIPE_MOAR_PRO_PRICE_ID

    // Use Stripe's upcoming invoice API to preview changes
    if (currentSubscription) {
      // Check if trying to upgrade to current plan
      const currentPriceId = currentSubscription.items.data[0].price.id
      if (currentPriceId === priceId) {
        return NextResponse.json(
          {
            error: {
              code: 'invalid-upgrade',
              message: 'You are already subscribed to this plan.',
            },
          },
          { status: 400 }
        )
      }

      const items = [
        {
          id: currentSubscription.items.data[0].id,
          price: priceId,
        },
      ]

      const preview = await stripeServer.invoices.retrieveUpcoming({
        customer: session.user.stripe_customer_id,
        subscription: currentSubscription.id,
        subscription_items: items,
        subscription_proration_date: Math.floor(Date.now() / 1000),
      })

      return NextResponse.json({
        currentMonthlyRate: currentSubscription.items.data[0].price.unit_amount
          ? currentSubscription.items.data[0].price.unit_amount / 100
          : 0,
        newMonthlyRate: targetPlan === 'Pro' ? 49 : 249,
        daysRemainingInBillingPeriod: Math.ceil(
          (currentSubscription.current_period_end * 1000 - Date.now()) /
            (1000 * 60 * 60 * 24)
        ),
        prorationAmount: preview.amount_due / 100,
        prorationDate: currentSubscription.current_period_end,
      })
    } else {
      // New subscription - no proration needed
      return NextResponse.json({
        currentMonthlyRate: 0,
        newMonthlyRate: targetPlan === 'Pro' ? 49 : 249,
        daysRemainingInBillingPeriod: 0,
        prorationAmount: targetPlan === 'Pro' ? 49 : 249,
        prorationDate: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days from now
      })
    }
  } catch (error: any) {
    console.error('Error fetching subscription preview:', error)
    return NextResponse.json(
      {
        error: {
          code: error.code || 'stripe-error',
          message: error.message || 'Failed to fetch subscription preview',
        },
      },
      { status: error.statusCode || 500 }
    )
  }
}
