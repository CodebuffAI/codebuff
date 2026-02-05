import { env } from '@codebuff/internal/env'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stripeCustomerId = session.user.stripe_customer_id
  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: 'No Stripe customer ID found' },
      { status: 400 }
    )
  }

  try {
    const portalSession = await stripeServer.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/profile`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    logger.error(
      { userId: session.user.id, error },
      'Failed to create billing portal session'
    )
    return NextResponse.json(
      { error: 'Failed to create billing portal session' },
      { status: 500 }
    )
  }
}
