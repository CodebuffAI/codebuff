import type { NextAuthOptions } from 'next-auth'
import GitHubProvider from 'next-auth/providers/github'
import { DrizzleAdapter } from '@auth/drizzle-adapter'

import { env } from '@/env.mjs'
import { stripeServer } from '@/lib/stripe'
import db from 'common/src/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { Adapter } from 'next-auth/adapters'

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
      }
      return session
    },
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
            .update(schema.user)
            .set({
              stripeCustomerId: customer.id,
            })
            .where(eq(schema.user.id, user.id))
        })
    },
  },
}
