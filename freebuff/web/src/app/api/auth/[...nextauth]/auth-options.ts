// TODO: Extract shared auth config to packages/auth to avoid duplication with web/src/app/api/auth/[...nextauth]/auth-options.ts
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { SESSION_MAX_AGE_SECONDS } from '@codebuff/common/old-constants'
import { loops } from '@codebuff/internal'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { logSyncFailure } from '@codebuff/internal/util/sync-failure'
import { eq } from 'drizzle-orm'
import GitHubProvider from 'next-auth/providers/github'

import type { NextAuthOptions } from 'next-auth'
import type { Adapter } from 'next-auth/adapters'

import {
  getCliAuthCodeHashPrefix,
  getCliAuthOnboardSearchParams,
  isCliAuthCodeCandidate,
} from '@/app/onboard/_helpers'
import { getFreebuffNextAuthUrl } from '../../../../lib/freebuff-server-env'
import { logger } from '@/util/logger'

const useJwtOnlyAuth =
  env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev' &&
  process.env.FREEBUFF_DEV_AUTH_WITHOUT_DB === 'true'

async function getPrimaryGitHubEmail(accessToken?: string) {
  if (!accessToken) return null

  try {
    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
      },
    })

    if (!response.ok) return null

    const emails = (await response.json()) as Array<{
      email?: string
      primary?: boolean
      verified?: boolean
    }>

    return (
      emails.find((email) => email.primary && email.verified)?.email ??
      emails.find((email) => email.verified)?.email ??
      null
    )
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch primary GitHub email')
    return null
  }
}

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

    await db
      .update(schema.user)
      .set({
        stripe_customer_id: customer.id,
      })
      .where(eq(schema.user.id, userId))

    logger.info(
      { userId, customerId: customer.id },
      'Stripe customer created and linked to user.',
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

export const authOptions: NextAuthOptions = {
  ...(useJwtOnlyAuth
    ? {}
    : {
        adapter: DrizzleAdapter(db, {
          usersTable: schema.user,
          accountsTable: schema.account,
          sessionsTable: schema.session,
          verificationTokensTable: schema.verificationToken,
        }) as Adapter,
      }),
  providers: [
    GitHubProvider({
      clientId: env.FREEBUFF_GITHUB_ID ?? env.CODEBUFF_GITHUB_ID,
      clientSecret: env.FREEBUFF_GITHUB_SECRET ?? env.CODEBUFF_GITHUB_SECRET,
    }),
  ],
  session: {
    strategy: useJwtOnlyAuth ? 'jwt' : 'database',
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (useJwtOnlyAuth && account?.providerAccountId) {
        token.sub = `github:${account.providerAccountId}`
      }
      if (useJwtOnlyAuth && profile) {
        const githubProfile = profile as {
          name?: string | null
          email?: string | null
          avatar_url?: string | null
          picture?: string | null
        }
        token.name = githubProfile.name ?? token.name
        token.email =
          githubProfile.email ??
          (await getPrimaryGitHubEmail(account?.access_token)) ??
          token.email
        token.picture =
          githubProfile.avatar_url ?? githubProfile.picture ?? token.picture
      }
      return token
    },
    async session({ session, user, token }) {
      if (session.user) {
        if (useJwtOnlyAuth) {
          session.user.id = token.sub ?? ''
          session.user.image = token.picture ?? null
          session.user.name = token.name ?? null
          session.user.email = token.email ?? null
          session.user.stripe_customer_id = null
        } else {
          session.user.id = user.id
          session.user.image = user.image
          session.user.name = user.name
          session.user.email = user.email
          session.user.stripe_customer_id = user.stripe_customer_id
        }
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      const potentialRedirectUrl = new URL(url, baseUrl)
      const authCode = potentialRedirectUrl.searchParams.get('auth_code')

      if (authCode) {
        if (!isCliAuthCodeCandidate(authCode)) {
          const searchParamKeys = Array.from(
            potentialRedirectUrl.searchParams.keys(),
          ).sort()
          logger.warn(
            {
              authCodeLength: authCode.length,
              authCodeTrimmedLength: authCode.trim().length,
              authCodeHashPrefix: getCliAuthCodeHashPrefix(authCode),
              authCodeParamCount:
                potentialRedirectUrl.searchParams.getAll('auth_code').length,
              searchParamKeys,
              searchParamCount: searchParamKeys.length,
              hasCallbackUrlParam: searchParamKeys.includes('callbackUrl'),
              hasCodeParam: searchParamKeys.includes('code'),
              hasRedirectParam: searchParamKeys.includes('redirect'),
              dotCount: authCode.match(/\./g)?.length ?? 0,
              hyphenCount: authCode.match(/-/g)?.length ?? 0,
              redirectUrlOrigin: potentialRedirectUrl.origin,
              baseUrl,
            },
            'Freebuff auth redirect received non-CLI-shaped auth_code',
          )
          return baseUrl
        }

        const onboardUrl = new URL('/onboard', getFreebuffNextAuthUrl())
        onboardUrl.search = getCliAuthOnboardSearchParams(
          potentialRedirectUrl.searchParams,
          authCode,
        ).toString()
        return onboardUrl.toString()
      }

      if (url.startsWith('/') || potentialRedirectUrl.origin === baseUrl) {
        return potentialRedirectUrl.toString()
      }

      return baseUrl
    },
  },
  events: useJwtOnlyAuth
    ? {}
    : {
        createUser: async ({ user }) => {
          logger.info(
            { userId: user.id, email: user.email },
            'createUser event triggered',
          )

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
            logger.error(
              { userId: user.id },
              'User data not found after creation',
            )
            return
          }

          await createAndLinkStripeCustomer({
            ...userData,
            userId: userData.id,
          })

          // Freebuff is free - new accounts do not receive any credit grant.

          await loops.sendSignupEventToLoops({
            ...userData,
            userId: userData.id,
            logger,
            signupSource: 'freebuff',
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
