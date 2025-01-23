import { SQL, sql } from 'drizzle-orm'
import {
  timestamp,
  pgTable,
  text,
  primaryKey,
  integer,
  boolean,
  jsonb,
  numeric,
  uuid,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'
import type { AdapterAccount } from 'next-auth/adapters'
import { ReferralStatusValues } from '../types/referral'

// Define the ReferralStatus enum
export const ReferralStatus = pgEnum('referral_status', [
  ReferralStatusValues[0],
  ...ReferralStatusValues.slice(1),
])

export const user = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique().notNull(),
  password: text('password'),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  subscription_active: boolean('subscription_active').notNull().default(false),
  stripe_customer_id: text('stripe_customer_id').unique(),
  stripe_price_id: text('stripe_price_id'),
  quota: integer('quota').notNull().default(0),
  quota_exceeded: boolean('quota_exceeded').notNull().default(false),
  next_quota_reset: timestamp('next_quota_reset', { mode: 'date' }).default(
    sql<Date>`now() + INTERVAL '1 month'`
  ),
  created_at: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  referral_code: text('referral_code')
    .unique()
    .default(sql`'ref-' || gen_random_uuid()`),
  referral_limit: integer('referral_limit').notNull().default(5),
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
  ]
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
  (table) => [primaryKey({ columns: [table.referrer_id, table.referred_id] })]
)
export const fingerprint = pgTable('fingerprint', {
  id: text('id').primaryKey(),
  sig_hash: text('sig_hash'),
  quota_exceeded: boolean('quota_exceeded').notNull().default(false),
  next_quota_reset: timestamp('next_quota_reset', { mode: 'date' }).default(
    sql<Date>`now() + INTERVAL '1 month'`
  ),
  created_at: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const message = pgTable(
  'message',
  {
    id: text('id').primaryKey(),
    finished_at: timestamp('finished_at', { mode: 'date' }).notNull(),
    client_id: text('client_id').notNull(), // TODO: `CHECK` that this starts w/ prefix `mc-client-`
    client_request_id: text('client_request_id').notNull(), // TODO: `CHECK` that this starts w/ prefix `mc-input-`
    model: text('model').notNull(),
    request: jsonb('request').notNull(),
    lastMessage: jsonb('last_message').generatedAlwaysAs(
      (): SQL => sql`${message.request} -> -1`
    ),
    response: jsonb('response').notNull(),
    input_tokens: integer('input_tokens').notNull().default(0),
    cache_creation_input_tokens: integer('cache_creation_input_tokens')
      .notNull()
      .default(0),
    cache_read_input_tokens: integer('cache_read_input_tokens')
      .notNull()
      .default(0),
    output_tokens: integer('output_tokens').notNull(),
    cost: numeric('cost', { precision: 100, scale: 20 }).notNull(),
    credits: integer('credits').notNull(),
    latency_ms: integer('latency_ms'),
    user_id: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    fingerprint_id: text('fingerprint_id')
      .references(() => fingerprint.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [
    index('message_fingerprint_id_idx').on(table.fingerprint_id),
    index('message_user_id_idx').on(table.user_id),
    index('message_finished_at_idx').on(table.finished_at),
  ]
)

export const session = pgTable('session', {
  sessionToken: text('sessionToken').notNull().primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
  fingerprint_id: text('fingerprint_id').references(() => fingerprint.id),
})

export const verificationToken = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
)

export const organization = pgTable('organization', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  owner_id: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  stripe_customer_id: text('stripe_customer_id').unique(),
  allowed_repos: text('allowed_repos').array(),
  created_at: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const organization_member = pgTable(
  'organization_member',
  {
    organization_id: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').$type<'admin' | 'member'>().notNull().default('member'),
    joined_at: timestamp('joined_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organization_id, table.user_id] }),
    userIdIdx: index('organization_member_user_id_idx').on(table.user_id),
  })
)
