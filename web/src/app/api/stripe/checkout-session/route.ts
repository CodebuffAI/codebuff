import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options';
import { env } from '@/env.mjs';
import { stripeServer } from '@/lib/stripe';

export const GET = async () => {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      {
        error: {
          code: 'no-access',
          message: 'You are not signed in.',
        },
      },
      { status: 401 }
    );
  }

  const checkoutSession = await stripeServer.checkout.sessions.create({
    mode: 'subscription',
    customer: session.user.stripeCustomerId,
    line_items: [
      {
        price: env.STRIPE_SUBSCRIPTION_PRICE_ID,
        quantity: 1,
      },
    ],
    success_url: `${env.APP_URL}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: env.APP_URL,
  });

  return NextResponse.json({ session: checkoutSession }, { status: 200 });
};
