import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { eq } from 'drizzle-orm'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { logger } from '@/util/logger'
import { stripeServer } from 'common/src/util/stripe'
import { convertCreditsToUsdCents, getUserCostPerCredit } from 'common/src/billing/conversion'
import { env } from '@/env.mjs'
import { generateCompactId } from 'common/src/util/string'

const buyCreditsSchema = z.object({
  credits: z.number().int().min(500, { message: "Minimum purchase is 500 credits." }), // Enforce minimum purchase
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id
  const userEmail = session.user.email

  let data
  try {
    data = await req.json()
    const validation = buyCreditsSchema.safeParse(data)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', issues: validation.error.issues },
        { status: 400 }
      )
    }
    data = validation.data
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { credits } = data

  try {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: { stripe_customer_id: true },
    })

    if (!user?.stripe_customer_id) {
      logger.error({ userId }, "User attempting to buy credits has no Stripe customer ID.");
      return NextResponse.json({ error: 'Stripe customer not found.' }, { status: 400 })
    }

    const centsPerCredit = await getUserCostPerCredit(userId);
    const amountInCents = convertCreditsToUsdCents(credits, centsPerCredit);

    if (amountInCents <= 0) {
      logger.error({ userId, credits, centsPerCredit }, "Calculated zero or negative amount in cents for credit purchase.");
      return NextResponse.json({ error: 'Invalid credit amount calculation.' }, { status: 400 })
    }

    const operationId = `buy-${userId}-${generateCompactId()}`;

    const checkoutSession = await stripeServer.checkout.sessions.create({
      payment_method_types: ['card'],
      customer: user.stripe_customer_id,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Codebuff Credits - ${credits.toLocaleString()}`,
              description: 'One-time credit purchase. Credits do not expire.',
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${env.NEXT_PUBLIC_APP_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&purchase=credits`,
      cancel_url: `${env.NEXT_PUBLIC_APP_URL}/usage?purchase_canceled=true`,
      metadata: {
        userId: userId,
        credits: credits.toString(),
        operationId: operationId,
        grantType: 'purchase',
      },
      payment_intent_data: {
        setup_future_usage: 'off_session',
        metadata: {
          userId: userId,
          credits: credits.toString(),
          operationId: operationId,
          grantType: 'purchase',
        }
      }
    })

    if (!checkoutSession.url) {
      logger.error({ userId, credits }, "Stripe checkout session created without a URL.");
      return NextResponse.json({ error: 'Could not create Stripe checkout session.' }, { status: 500 })
    }

    logger.info({ userId, credits, operationId, sessionId: checkoutSession.id }, "Created Stripe checkout session for credit purchase");

    return NextResponse.json({ sessionId: checkoutSession.id })

  } catch (error: any) {
    logger.error(
      { error: error.message, userId, credits },
      'Failed to create Stripe checkout session for credit purchase'
    )
    const stripeErrorMessage = error?.raw?.message || 'Internal server error creating checkout session.';
    return NextResponse.json(
      { error: stripeErrorMessage },
      { status: 500 }
    )
  }
}