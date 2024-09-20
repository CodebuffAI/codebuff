import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';

import { env } from '@/env.mjs';
import { stripeServer } from '@/lib/stripe';
import db from 'common/db';
import * as models from 'common/db/schema';

const webhookHandler = async (req: NextRequest) => {
  try {
    const buf = await req.text();
    const sig = req.headers.get('stripe-signature')!;

    let event: Stripe.Event;

    try {
      event = stripeServer.webhooks.constructEvent(
        buf,
        sig,
        env.STRIPE_WEBHOOK_SECRET_KEY
      );
    } catch (err) {
      return NextResponse.json(
        {
          error: {
            message: `Webhook Error - ${err}`,
          },
        },
        { status: 400 }
      );
    }

    const subscription = event.data.object as Stripe.Subscription;

    switch (event.type) {
      case 'customer.subscription.created':
        await db
          .update(models.users)
          .set({ isActive: true })
          .where(
            eq(models.users.stripeCustomerId, subscription.customer as string)
          );
        break;
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json(
      {
        error: {
          message: 'Method Not Allowed',
        },
      },
      { status: 405 }
    ).headers.set('Allow', 'POST');
  }
};

export { webhookHandler as POST };
