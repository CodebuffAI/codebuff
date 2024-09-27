import {
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer,
  uuid,
  boolean,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core'
import type { AdapterAccount } from 'next-auth/adapters'
import { TOKEN_USAGE_LIMITS } from 'src/constants'

export const user = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique().notNull(),
  password: text('password'),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  subscriptionActive: boolean('subscriptionActive').notNull().default(false),
  stripeCustomerId: text('stripeCustomerId').unique(),
  stripePlanId: text('stripePlanId'),
})

export const account = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccount['type']>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
)

export const usageTypeEnum = pgEnum('usageType', ['token', 'credit'])
export type UsageType = (typeof usageTypeEnum.enumValues)[number]
export const usage = pgTable('usage', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').references(() => user.id),
  fingerprintId: text('fingerprintId'),
  used: integer('used').notNull().default(0),
  limit: integer('limit').notNull().default(TOKEN_USAGE_LIMITS.ANON),
  type: usageTypeEnum('usageType').notNull().default('token'),
  startDate: timestamp('startDate', { mode: 'date' }).notNull(),
  endDate: timestamp('endDate', { mode: 'date' }).notNull(),
})

export const session = pgTable('session', {
  sessionToken: text('sessionToken').notNull().primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
  usageId: text('usageId').references(() => usage.id),
  fingerprintHash: text('fingerprintHash'),
})

export const verificationToken = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
)
