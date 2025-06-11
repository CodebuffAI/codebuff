import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { processAndGrantCredit } from '@codebuff/billing'
import { DEFAULT_FREE_CREDITS_GRANT } from 'common/constants'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { trackEvent } from 'common/src/analytics'
import { AnalyticsEvent } from 'common/src/constants/analytics-events'
import { getNextQuotaReset } from 'common/src/util/dates'
import { generateCompactId } from 'common/src/util/string'
import { stripeServer } from 'common/src/util/stripe'
import { logSyncFailure } from 'common/src/util/sync-failure'
import { eq } from 'drizzle-orm'
import type { NextAuthOptions } from 'next-auth'
import { Adapter } from 'next-auth/adapters'
import GitHubProvider from 'next-auth/providers/github'
import { loops } from '@codebuff/internal'

import { env } from '@/env'
import { logger } from '@/util/logger'

async function createAndLinkStripeCustomer(
  userId: string,
  email: string | null,
  name: string | null
): Promise<string | null> {
  if (!email || !name) {
    logger.warn(
      { userId },
      'User email or name missing, cannot create Stripe customer.'
    )
    return null
  }
  try {
    const customer = await stripeServer.customers.create({
      email,
      name,
      metadata: {
        user_id: userId,
      },
    })

    // Create subscription with the usage price
    await stripeServer.subscriptions.create({
      customer: customer.id,
      items: [{ price: env.STRIPE_USAGE_PRICE_ID }],
    })

    await db
      .update(schema.user)
      .set({
        stripe_customer_id: customer.id,
        stripe_price_id: env.STRIPE_USAGE_PRICE_ID,
      })
      .where(eq(schema.user.id, userId))

    logger.info(
      { userId, customerId: customer.id },
      'Stripe customer created with usage subscription and linked to user.'
    )
    return customer.id
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error creating Stripe customer'
    logger.error(
      { userId, error },
      'Failed to create Stripe customer or update user record.'
    )
    await logSyncFailure(userId, errorMessage)
    return null
  }
}

async function createInitialCreditGrant(
  userId: string,
  expiresAt: Date | null
): Promise<void> {
  try {
    const operationId = `free-${userId}-${generateCompactId()}`
    const nextQuotaReset = getNextQuotaReset(expiresAt)

    await processAndGrantCredit(
      userId,
      DEFAULT_FREE_CREDITS_GRANT,
      'free',
      'Initial free credits',
      nextQuotaReset,
      operationId
    )

    logger.info(
      {
        userId,
        operationId,
        creditsGranted: DEFAULT_FREE_CREDITS_GRANT,
        expiresAt: nextQuotaReset,
      },
      'Initial free credit grant created.'
    )
  } catch (grantError) {
    const errorMessage =
      grantError instanceof Error
        ? grantError.message
        : 'Unknown error creating initial credit grant'
    logger.error(
      { userId, error: grantError },
      'Failed to create initial credit grant.'
    )
    await logSyncFailure(userId, errorMessage)
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
      clientId: env.CODEBUFF_GITHUB_ID,
      clientSecret: env.CODEBUFF_GITHUB_SECRET,
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
      const potentialRedirectUrl = new URL(url, baseUrl)
      const authCode = potentialRedirectUrl.searchParams.get('auth_code')

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

      if (url.startsWith('/') || potentialRedirectUrl.origin === baseUrl) {
        logger.info(
          { url, redirectTarget: potentialRedirectUrl.toString() },
          'Redirecting web flow to callbackUrl'
        )
        return potentialRedirectUrl.toString()
      }

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

      // Get all user data we need upfront
      const userData = await db.query.user.findFirst({
        where: eq(schema.user.id, user.id),
        columns: {
          id: true,
          email: true,
          name: true,
          next_quota_reset: true,
        },
      })

      if (!userData) {
        logger.error({ userId: user.id }, 'User data not found after creation')
        return
      }

      const customerId = await createAndLinkStripeCustomer(
        userData.id,
        userData.email,
        userData.name
      )

      if (customerId) {
        await createInitialCreditGrant(userData.id, userData.next_quota_reset)
      }

      // Call the imported function
      await loops.sendSignupEventToLoops(
        userData.id,
        userData.email,
        userData.name
      )

      trackEvent(AnalyticsEvent.SIGNUP, userData.id)

      logger.info({ user }, 'createUser event processing finished.')
    },
  },
}
