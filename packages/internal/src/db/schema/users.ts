import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

import { apiKeyTypeEnum, ReferralStatus, sessionTypeEnum } from './enums'

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
  stripe_customer_id: text('stripe_customer_id').unique(),
  stripe_price_id: text('stripe_price_id'),
  next_quota_reset: timestamp('next_quota_reset', { mode: 'date' }).default(
    sql<Date>`now() + INTERVAL '1 month'`,
  ),
  created_at: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  referral_code: text('referral_code')
    .unique()
    .default(sql`'ref-' || gen_random_uuid()`),
  referral_limit: integer('referral_limit').notNull().default(5),
  discord_id: text('discord_id').unique(),
  handle: text('handle').unique(),
  auto_topup_enabled: boolean('auto_topup_enabled').notNull().default(false),
  auto_topup_threshold: integer('auto_topup_threshold'),
  auto_topup_amount: integer('auto_topup_amount'),
  banned: boolean('banned').notNull().default(false),
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
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
)

export const fingerprint = pgTable('fingerprint', {
  id: text('id').primaryKey(),
  sig_hash: text('sig_hash'),
  created_at: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const session = pgTable('session', {
  sessionToken: text('sessionToken').notNull().primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
  fingerprint_id: text('fingerprint_id').references(() => fingerprint.id),
  type: sessionTypeEnum('type').notNull().default('web'),
  created_at: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const verificationToken = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
)

export const encryptedApiKeys = pgTable(
  'encrypted_api_keys',
  {
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: apiKeyTypeEnum('type').notNull(),
    api_key: text('api_key').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.user_id, table.type] }),
  }),
)

export const referral = pgTable(
  'referral',
  {
    referrer_id: text('referrer_id')
      .notNull()
      .references(() => user.id),
    referred_id: text('referred_id')
      .notNull()
      .references(() => user.id),
    status: ReferralStatus('status').notNull().default('pending'),
    credits: integer('credits').notNull(),
    created_at: timestamp('created_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { mode: 'date' }),
  },
  (table) => [primaryKey({ columns: [table.referrer_id, table.referred_id] })],
)
