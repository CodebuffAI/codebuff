import type { NextAuthOptions } from 'next-auth'
import GitHubProvider from 'next-auth/providers/github'
import { DrizzleAdapter } from '@auth/drizzle-adapter'

import { env } from '@/env.mjs'
import { stripeServer } from 'common/src/util/stripe'
import db from 'common/src/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { Adapter } from 'next-auth/adapters'
import { parse, format } from 'url'
import { CREDITS_USAGE_LIMITS } from 'common/constants'
import { getNextQuotaReset } from 'common/src/util/dates'

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
        session.user.subscription_active = user.subscription_active
        session.user.image = user.image
        session.user.name = user.name
        session.user.email = user.email
        session.user.stripe_customer_id = user.stripe_customer_id
        session.user.stripe_price_id = user.stripe_price_id
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      const parsedUrl = parse(url, true)
      // const pathname = parsedUrl.pathname
      const query = parsedUrl.query

      // Construct the new URL with the `onboard` page and the original query params
      const newUrl = format({
        pathname: `${baseUrl}/onboard`,
        query,
      })

      return newUrl
    },
  },
  events: {
    createUser: async ({ user }) => {
      if (!user.email || !user.name) return
      await stripeServer.customers
        .create({
          email: user.email,
          name: user.name,
          metadata: {
            user_id: user.id,
          },
        })
        .then(async (customer) => {
          return db
            .update(schema.user)
            .set({
              stripe_customer_id: customer.id,
              quota_exceeded: false,
              quota: CREDITS_USAGE_LIMITS.FREE,
            })
            .where(eq(schema.user.id, user.id))
        })
    },
  },
}
