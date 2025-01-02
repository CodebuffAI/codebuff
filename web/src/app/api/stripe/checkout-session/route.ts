import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { env } from '@/env.mjs'
import { stripeServer } from 'common/src/util/stripe'

export const GET = async (request: Request) => {
  const { searchParams } = new URL(request.url)
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
  }    const targetPlan = searchParams.get('plan')
    if (!targetPlan) {
      return NextResponse.json(
        {
          error: {
            code: 'invalid-plan',
            message: 'Target plan is required',
          },
        },
        { status: 400 }
      )
    }

    const priceId = targetPlan === 'Pro' ? env.STRIPE_PRO_PRICE_ID : env.STRIPE_MOAR_PRO_PRICE_ID
    const overagePriceId = targetPlan === 'Pro' ? env.STRIPE_PRO_OVERAGE_PRICE_ID : env.STRIPE_MOAR_PRO_OVERAGE_PRICE_ID

    const checkoutSession = await stripeServer.checkout.sessions.create({
      mode: 'subscription',
      customer: session.user.stripe_customer_id,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
        {
          price: overagePriceId,
        },
      ],
    success_url: `${env.NEXT_PUBLIC_APP_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&${searchParams}`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}?${searchParams}`,
    allow_promotion_codes: true,
  })

  return NextResponse.json({ session: checkoutSession }, { status: 200 })
}
