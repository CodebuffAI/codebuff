import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { getReferralQualification } from '@codebuff/billing'
import { SESSION_MAX_AGE_SECONDS } from '@codebuff/common/old-constants'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { logSyncFailure } from '@codebuff/internal/util/sync-failure'
import { and, eq } from 'drizzle-orm'
import GitHubProvider from 'next-auth/providers/github'
import GoogleProvider from 'next-auth/providers/google'

import { LINK_INTENT_COOKIE } from './constants'
import { decideExplicitLink, isUnverifiedGoogleEmail } from './link-guard'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { NextAuthOptions } from 'next-auth'
import type { Adapter } from 'next-auth/adapters'

const GITHUB_PROVIDER = 'github'

export interface OAuthCredentials {
  githubId: string
  githubSecret: string
  /** Google is registered only when both id and secret are present. */
  googleId?: string
  googleSecret?: string
}

export interface AuthHooks {
  /**
   * App-specific post-signup side effects (credits + Loops for Codebuff,
   * welcome email for Freebuff, analytics for both). Runs inside NextAuth's
   * `events.createUser`, AFTER the shared Stripe customer is created.
   */
  onCreateUser: (user: {
    id: string
    email: string | null
    name: string | null
    next_quota_reset: Date | null
  }) => Promise<void>
  logger: Logger
}

export interface CreateAuthOptionsConfig {
  credentials: OAuthCredentials
  hooks: AuthHooks
  /**
   * App-specific redirect callback. The CLI auth_code → /onboard handling
   * differs per app (different base URL + helper validation + logging), so it
   * stays injected rather than shared.
   */
  redirect: NonNullable<NextAuthOptions['callbacks']>['redirect']
  /**
   * Freebuff dev-only escape hatch (FREEBUFF_DEV_AUTH_WITHOUT_DB): no adapter,
   * JWT session strategy, no DB writes / events. Defaults to false.
   */
  jwtOnly?: boolean
}

/**
 * Shared Stripe customer creation, previously duplicated verbatim in both
 * apps' auth-options. Runs first in the createUser event so the app-specific
 * hook can rely on the customer existing.
 */
async function createAndLinkStripeCustomer(params: {
  userId: string
  email: string | null
  name: string | null
  logger: Logger
}): Promise<string | null> {
  const { userId, email, name, logger } = params

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
      metadata: { user_id: userId },
    })

    await db
      .update(schema.user)
      .set({ stripe_customer_id: customer.id })
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
    await logSyncFailure({ id: userId, errorMessage, provider: 'stripe', logger })
    return null
  }
}

/** GitHub's primary verified email, used only in the JWT-only dev path. */
async function getPrimaryGitHubEmail(
  accessToken: string | undefined,
  logger: Logger,
): Promise<string | null> {
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
      emails.find((e) => e.primary && e.verified)?.email ??
      emails.find((e) => e.verified)?.email ??
      null
    )
  } catch (error) {
    logger.warn({ error }, 'Failed to fetch primary GitHub email')
    return null
  }
}

async function readLinkIntentCookie(): Promise<string | null> {
  try {
    const { cookies } = await import('next/headers')
    const store = await cookies()
    return store.get(LINK_INTENT_COOKIE)?.value ?? null
  } catch {
    // Outside a Next request context (or API change): treat as no link intent.
    return null
  }
}

/**
 * When an authenticated user explicitly links a second provider, NextAuth's
 * default behavior is dangerous: if the new provider's email matches no
 * existing user, it CREATES a brand-new user and silently switches the session
 * to it (forking the account, splitting saved chats/projects). The common
 * same-verified-email case is handled by `allowDangerousEmailAccountLinking`;
 * this guard only blocks the fork.
 *
 * Returns `true` to allow, or a redirect path (string) to abort with an error.
 */
async function guardExplicitLink(params: {
  provider: string
  providerAccountId: string
  email: string | null | undefined
  returnPath: string
  logger: Logger
}): Promise<true | string> {
  const { provider, providerAccountId, email, returnPath, logger } = params

  // Already-linked account → returning user; let the normal flow log them in.
  const [existingAccount] = await db
    .select({ userId: schema.account.userId })
    .from(schema.account)
    .where(
      and(
        eq(schema.account.provider, provider),
        eq(schema.account.providerAccountId, providerAccountId),
      ),
    )
    .limit(1)

  // A new account row only attaches to an existing user if some user already
  // owns this (verified) email; otherwise NextAuth would fork a new account.
  let existingUser: { id: string } | undefined
  if (!existingAccount && email) {
    ;[existingUser] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1)
  }

  const decision = decideExplicitLink({
    accountExists: !!existingAccount,
    emailUserExists: !!existingUser,
    returnPath,
  })
  if (decision !== true) {
    logger.warn(
      { provider, hasEmail: !!email },
      'Blocked explicit account link that would fork a new account',
    )
  }
  return decision
}

export function createAuthOptions(
  config: CreateAuthOptionsConfig,
): NextAuthOptions {
  const { credentials, hooks, redirect, jwtOnly = false } = config
  const { logger } = hooks

  const providers: NextAuthOptions['providers'] = [
    GitHubProvider({
      clientId: credentials.githubId,
      clientSecret: credentials.githubSecret,
      // Safe: GitHub OAuth only returns provider-verified emails. Lets a user
      // who first signed in with Google link GitHub by matching email.
      allowDangerousEmailAccountLinking: true,
    }),
  ]
  if (credentials.googleId && credentials.googleSecret) {
    providers.push(
      GoogleProvider({
        clientId: credentials.googleId,
        clientSecret: credentials.googleSecret,
        // Safe ONLY because we additionally reject unverified Google emails in
        // the signIn callback below. Auto-links to an existing same-email user.
        allowDangerousEmailAccountLinking: true,
      }),
    )
  }

  return {
    ...(jwtOnly
      ? {}
      : {
          adapter: DrizzleAdapter(db, {
            usersTable: schema.user,
            accountsTable: schema.account,
            sessionsTable: schema.session,
            verificationTokensTable: schema.verificationToken,
          }) as Adapter,
        }),
    providers,
    session: {
      strategy: jwtOnly ? 'jwt' : 'database',
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
    callbacks: {
      async signIn({ user, account, profile }) {
        if (!account) return true

        // 1. Security gate: never trust an unverified Google email for linking.
        //    Only a literal `email_verified === true` is accepted.
        if (
          isUnverifiedGoogleEmail({
            provider: account.provider,
            emailVerified: (profile as { email_verified?: unknown } | undefined)
              ?.email_verified,
          })
        ) {
          logger.warn(
            { provider: account.provider },
            'Rejected Google sign-in: email not verified',
          )
          return false
        }

        // 2. Explicit-link fork guard (only when a link is in progress).
        const linkReturnPath = await readLinkIntentCookie()
        if (linkReturnPath) {
          const guard = await guardExplicitLink({
            provider: account.provider,
            providerAccountId: account.providerAccountId,
            email: user?.email,
            returnPath: linkReturnPath,
            logger,
          })
          if (guard !== true) return guard
        }

        return true
      },
      async session({ session, user, token }) {
        if (session.user) {
          if (jwtOnly) {
            // Loose-cast: the apps' next-auth augmentations disagree on
            // stripe_customer_id nullability, and this dev-only branch never
            // runs in the stricter (web) app.
            const su = session.user as unknown as Record<string, unknown>
            su.id = token?.sub ?? ''
            su.image = (token?.picture as string | null) ?? null
            su.name = (token?.name as string | null) ?? null
            su.email = (token?.email as string | null) ?? null
            su.stripe_customer_id = null
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
      ...(jwtOnly
        ? {
            async jwt({ token, account, profile }) {
              if (account?.providerAccountId) {
                token.sub = `${account.provider}:${account.providerAccountId}`
              }
              if (profile) {
                const p = profile as {
                  name?: string | null
                  email?: string | null
                  avatar_url?: string | null
                  picture?: string | null
                }
                token.name = p.name ?? token.name
                // Prefer the profile email; for GitHub (which may omit it) fall
                // back to the verified primary email, then to the prior token.
                let resolvedEmail = p.email ?? null
                if (!resolvedEmail && account?.provider === GITHUB_PROVIDER) {
                  resolvedEmail = await getPrimaryGitHubEmail(
                    account?.access_token,
                    logger,
                  )
                }
                token.email = resolvedEmail ?? token.email
                token.picture = p.avatar_url ?? p.picture ?? token.picture
              }
              return token
            },
          }
        : {}),
      redirect,
    },
    events: jwtOnly
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
              userId: userData.id,
              email: userData.email,
              name: userData.name,
              logger,
            })

            await hooks.onCreateUser(userData)

            logger.info({ user }, 'createUser event processing finished.')
          },
          // Fires after a provider's account row is written — on first signup
          // AND on every later explicit link. Warm the GitHub referral-
          // qualification cache (account age / oldest repo) as soon as a GitHub
          // token is available. Fire-and-forget: a failure just defers to the
          // next real referral check, which self-populates the cache.
          linkAccount: async ({ user, account }) => {
            if (account.provider !== GITHUB_PROVIDER) return
            getReferralQualification({ userId: user.id, logger }).catch(
              (error) =>
                logger.error(
                  { error, userId: user.id },
                  'Failed to prime referral qualification on GitHub link',
                ),
            )
          },
        },
  }
}
