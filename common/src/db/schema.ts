import {
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer,
  uuid,
  boolean,
  index,
} from 'drizzle-orm/pg-core'
import type { AdapterAccount } from 'next-auth/adapters'

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
  usage: integer('usage').notNull().default(0),
  limit: integer('limit').notNull().default(500),
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

export const session = pgTable(
  'session',
  {
    sessionToken: text('sessionToken').notNull().primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
    fingerprintId: text('fingerprintId'),
    fingerprintHash: text('fingerprintHash'),
  },
  (table) => {
    return {
      nameIdx: index('fingerprintId_idx').on(table.fingerprintId),
    }
  }
)

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

export const fingerprint = pgTable('fingerprint', {
  id: text('id').primaryKey(),
  userId: text('userId').references(() => user.id),
  sessionToken: text('sessionToken')
    .references(() => session.sessionToken)
    .unique(),
  usage: integer('usage').notNull().default(0),
  limit: integer('limit').notNull().default(100),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull().defaultNow(),
})
