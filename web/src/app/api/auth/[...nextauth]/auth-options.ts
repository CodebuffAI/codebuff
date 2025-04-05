import type { NextAuthOptions, User, DefaultSession } from 'next-auth'
import GitHubProvider from 'next-auth/providers/github'
import { DrizzleAdapter } from '@auth/drizzle-adapter'

import { env } from '@/env.mjs'
import { stripeServer } from 'common/src/util/stripe'
import db from 'common/src/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { Adapter } from 'next-auth/adapters'
import { parse, format } from 'url'
import { CREDITS_USAGE_LIMITS } from 'common/src/constants'
import { logger } from '@/util/logger'
import { GRANT_PRIORITIES } from 'common/src/billing/balance-calculator'
import { createStripeMonetaryAmount } from 'common/src/billing/conversion'

async function createAndLinkStripeCustomer(user: User): Promise<string | null> {
  if (!user.email || !user.name) {
    logger.warn(
      { userId: user.id },
      'User email or name missing, cannot create Stripe customer.'
    )
    return null
  }
  try {
    const customer = await stripeServer.customers.create({
      email: user.email,
      name: user.name,
      metadata: {
        user_id: user.id,
      },
    })

    await db
      .update(schema.user)
      .set({
        stripe_customer_id: customer.id,
      })
      .where(eq(schema.user.id, user.id))

    logger.info(
      { userId: user.id, customerId: customer.id },
      'Stripe customer created and linked to user.'
    )
    return customer.id
  } catch (error) {
    logger.error(
      { userId: user.id, error },
      'Failed to create Stripe customer or update user record.'
    )
    return null
  }
}

async function createInitialCreditGrant(
  customerId: string,
  userId: string
): Promise<void> {
  try {
    const initialGrantCredits = CREDITS_USAGE_LIMITS.FREE
    const stripeAmountObject = createStripeMonetaryAmount(initialGrantCredits)

    if (!stripeAmountObject) {
      logger.error(
        { userId, customerId, initialGrantCredits },
        'Initial grant amount is invalid, skipping Stripe grant creation.'
      )
      return
    }

    const grant = await stripeServer.billing.creditGrants.create({
      amount: stripeAmountObject,
      customer: customerId,
      category: 'promotional',
      applicability_config: {
        scope: {
          price_type: 'metered',
        },
      },
      metadata: {
        type: 'free',
        priority: GRANT_PRIORITIES.free.toString(),
        user_id: userId,
      },
    })
    logger.info(
      {
        userId: userId,
        customerId: customerId,
        grantId: grant.id,
        creditsGranted: initialGrantCredits,
        stripeAmountCents: stripeAmountObject.monetary.value,
      },
      'Initial free credit grant created via Stripe.'
    )
  } catch (grantError) {
    logger.error(
      { userId: userId, customerId: customerId, error: grantError },
      'Failed to create initial Stripe credit grant.'
    )
  }
}

async function sendSignupEventToLoops(user: User): Promise<void> {
  if (!user.email) {
    logger.warn(
      { userId: user.id },
      'User email missing, cannot send Loops event.'
    )
    return
  }
  try {
    await fetch('https://app.loops.so/api/v1/events/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LOOPS_API_KEY}`,
      },
      body: JSON.stringify({
        email: user.email,
        userId: user.id,
        eventName: 'signup',
        firstName: user.name?.split(' ')[0] ?? '',
      }),
    })
    logger.info(
      { email: user.email, userId: user.id },
      'Sent signup event to Loops'
    )
  } catch (loopsError) {
    logger.error(
      { error: loopsError, email: user.email, userId: user.id },
      'Failed to send Loops event'
    )
  }
}

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db, {
    usersTable: schema.user,
    accountsTable: schema.account,
    sessionsTable: schema.session,
    verificationTokensTable: schema.verificationToken,
  }) as Adapter,
  providers: [
    GitHubProvider({
      clientId: env.GITHUB_ID,
      clientSecret: env.GITHUB_SECRET,
    }),
  ],
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
        session.user.image = user.image
        session.user.name = user.name
        session.user.email = user.email
        session.user.stripe_customer_id = user.stripe_customer_id
        session.user.stripe_price_id = user.stripe_price_id
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      // Parse the URL to check for auth_code
      const potentialRedirectUrl = new URL(url, baseUrl)
      const authCode = potentialRedirectUrl.searchParams.get('auth_code')

      // If there's an auth_code, this is a CLI login flow - redirect to onboard
      if (authCode) {
        const onboardUrl = new URL(`${baseUrl}/onboard`)
        potentialRedirectUrl.searchParams.forEach((value, key) => {
          onboardUrl.searchParams.set(key, value)
        })
        logger.info(
          { url, authCode, redirectTarget: onboardUrl.toString() },
          'Redirecting CLI flow to /onboard'
        )
        return onboardUrl.toString()
      }

      // For web login flow, allow relative URLs and same-origin URLs
      if (url.startsWith('/') || potentialRedirectUrl.origin === baseUrl) {
        logger.info(
          { url, redirectTarget: potentialRedirectUrl.toString() },
          'Redirecting web flow to callbackUrl'
        )
        return potentialRedirectUrl.toString()
      }

      // Default to base URL for external callback URLs
      logger.info(
        { url, baseUrl, redirectTarget: baseUrl },
        'Callback URL is external or invalid, redirecting to baseUrl'
      )
      return baseUrl
    },
  },
  events: {
    createUser: async ({ user }) => {
      logger.info(
        { userId: user.id, email: user.email },
        'createUser event triggered'
      )

      const customerId = await createAndLinkStripeCustomer(user)

      if (customerId) {
        await createInitialCreditGrant(customerId, user.id)
      }

      await sendSignupEventToLoops(user)

      logger.info({ userId: user.id }, 'createUser event processing finished.')
    },
  },
}
