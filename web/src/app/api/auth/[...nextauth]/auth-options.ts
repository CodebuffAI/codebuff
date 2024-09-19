import type { NextAuthOptions } from 'next-auth';
import GitHubProvider from 'next-auth/providers/github';
import { DrizzleAdapter } from '@auth/drizzle-adapter';

import { env } from '@/env.mjs';
import { stripeServer } from '@/lib/stripe';
import { db } from '@@/db';
import * as models from '@@/db/schema';
import { eq } from 'drizzle-orm';
import { Adapter } from 'next-auth/adapters';

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
  callbacks: {
    async session({ session, user }) {
      if (!session.user) return session;

      session.user.id = user.id;
      session.user.stripeCustomerId = user.stripeCustomerId;
      session.user.isActive = user.isActive;

      return session;
    },
  },
  events: {
    createUser: async ({ user }) => {
      console.log('createUser', user);
      if (!user.email || !user.name) return;

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
            .where(eq(models.users.id, user.id));
        });
    },
  },
};
