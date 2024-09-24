import type { NextAuthOptions } from 'next-auth'
import GitHubProvider from 'next-auth/providers/github'
import { DrizzleAdapter } from '@auth/drizzle-adapter'

import { env } from '@/env.mjs'
import { stripeServer } from '@/lib/stripe'
import db from 'common/src/db'
import * as models from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { Adapter } from 'next-auth/adapters'

export const authOptions: NextAuthOptions = {
  adapter: DrizzleAdapter(db, {
    usersTable: models.users,
    accountsTable: models.accounts,
    sessionsTable: models.sessions,
    verificationTokensTable: models.verificationTokens,
  }) as Adapter,
  providers: [
    GitHubProvider({
      clientId: env.GITHUB_ID,
      clientSecret: env.GITHUB_SECRET,
    }),
  ],
  session: {
    strategy: 'database',
    maxAge: 90 * 24 * 60 * 60, // 90 days
  },
  events: {
    createUser: async ({ user }) => {
      console.log('createUser', user)
      if (!user.email || !user.name) return
      await stripeServer.customers
        .create({
          email: user.email,
          name: user.name,
        })
        .then(async (customer) => {
          return db
            .update(models.users)
            .set({
              stripeCustomerId: customer.id,
            })
            .where(eq(models.users.id, user.id))
        })
    },
  },
}
