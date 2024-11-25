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
  }

  const checkoutSession = await stripeServer.checkout.sessions.create({
    mode: 'subscription',
    customer: session.user.stripe_customer_id,
    line_items: [
      {
        price: env.STRIPE_SUBSCRIPTION_PRICE_ID,
        quantity: 1,
      },
      {
        price: env.STRIPE_OVERAGE_PRICE_ID,
      },
    ],
    success_url: `${env.NEXT_PUBLIC_APP_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&${searchParams}`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}?${searchParams}`,
    allow_promotion_codes: true,
  })

  return NextResponse.json({ session: checkoutSession }, { status: 200 })
}
