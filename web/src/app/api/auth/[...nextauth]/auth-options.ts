import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { processAndGrantCredit } from '@codebuff/billing'
import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { DEFAULT_FREE_CREDITS_GRANT } from '@codebuff/common/old-constants'
import { getNextQuotaReset } from '@codebuff/common/util/dates'
import { generateCompactId } from '@codebuff/common/util/string'
import { logSyncFailure } from '@codebuff/common/util/sync-failure'
import { loops, env } from '@codebuff/internal'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { eq } from 'drizzle-orm'
import GitHubProvider from 'next-auth/providers/github'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { NextAuthOptions } from 'next-auth'
import type { Adapter } from 'next-auth/adapters'

import { logger } from '@/util/logger'

async function createAndLinkStripeCustomer(params: {
  userId: string
  email: string | null
  name: string | null
}): Promise<string | null> {
  const { userId, email, name } = params

  if (!email || !name) {
    logger.warn(
      { userId },
      'User email or name missing, cannot create Stripe customer.',
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
      'Stripe customer created with usage subscription and linked to user.',
    )
    return customer.id
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Unknown error creating Stripe customer'
    logger.error(
      { userId, error },
      'Failed to create Stripe customer or update user record.',
    )
    await logSyncFailure({
      id: userId,
      errorMessage,
      provider: 'stripe',
      logger,
    })
    return null
  }
}

async function createInitialCreditGrant(params: {
  userId: string
  expiresAt: Date | null
  logger: Logger
}): Promise<void> {
  const { userId, expiresAt, logger } = params

  try {
    const operationId = `free-${userId}-${generateCompactId()}`
    const nextQuotaReset = getNextQuotaReset(expiresAt)

    await processAndGrantCredit({
      ...params,
      amount: DEFAULT_FREE_CREDITS_GRANT,
      type: 'free',
      description: 'Initial free credits',
      expiresAt: nextQuotaReset,
      operationId,
    })

    logger.info(
      {
        userId,
        operationId,
        creditsGranted: DEFAULT_FREE_CREDITS_GRANT,
        expiresAt: nextQuotaReset,
      },
      'Initial free credit grant created.',
    )
  } catch (grantError) {
    const errorMessage =
      grantError instanceof Error
        ? grantError.message
        : 'Unknown error creating initial credit grant'
    logger.error(
      { userId, error: grantError },
      'Failed to create initial credit grant.',
    )
    await logSyncFailure({
      id: userId,
      errorMessage,
      provider: 'stripe',
      logger,
    })
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
      console.log('🟡 NextAuth redirect callback:', { url, baseUrl })

      const potentialRedirectUrl = new URL(url, baseUrl)
      const authCode = potentialRedirectUrl.searchParams.get('auth_code')
      let referralCode = potentialRedirectUrl.searchParams.get('referral_code')

      console.log('🟡 NextAuth redirect parsed params:', {
        authCode: !!authCode,
        referralCode,
        allParams: Object.fromEntries(
          potentialRedirectUrl.searchParams.entries(),
        ),
      })

      if (authCode) {
        const onboardUrl = new URL(`${baseUrl}/onboard`)
        potentialRedirectUrl.searchParams.forEach((value, key) => {
          onboardUrl.searchParams.set(key, value)
        })
        console.log('🟡 NextAuth CLI flow redirect to:', onboardUrl.toString())
        logger.info(
          { url, authCode, redirectTarget: onboardUrl.toString() },
          'Redirecting CLI flow to /onboard',
        )
        return onboardUrl.toString()
      }

      if (url.startsWith('/') || potentialRedirectUrl.origin === baseUrl) {
        console.log(
          '🟡 NextAuth web flow redirect to:',
          potentialRedirectUrl.toString(),
        )
        logger.info(
          { url, redirectTarget: potentialRedirectUrl.toString() },
          'Redirecting web flow to callbackUrl',
        )
        return potentialRedirectUrl.toString()
      }

      console.log(
        '🟡 NextAuth external/invalid URL, redirect to baseUrl:',
        baseUrl,
      )
      logger.info(
        { url, baseUrl, redirectTarget: baseUrl },
        'Callback URL is external or invalid, redirecting to baseUrl',
      )
      return baseUrl
    },
  },
  events: {
    createUser: async ({ user }) => {
      logger.info(
        { userId: user.id, email: user.email },
        'createUser event triggered',
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

      const customerId = await createAndLinkStripeCustomer({
        ...userData,
        userId: userData.id,
      })

      if (customerId) {
        await createInitialCreditGrant({
          userId: userData.id,
          expiresAt: userData.next_quota_reset,
          logger,
        })
      }

      // Call the imported function
      await loops.sendSignupEventToLoops({
        ...userData,
        userId: userData.id,
        logger,
      })

      trackEvent({
        event: AnalyticsEvent.SIGNUP,
        userId: userData.id,
        logger,
      })

      logger.info({ user }, 'createUser event processing finished.')
    },
  },
}
