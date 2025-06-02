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
  pgEnum,
  index,
} from 'drizzle-orm/pg-core'
import type { AdapterAccount } from 'next-auth/adapters'
import { GrantTypeValues } from '../types/grant'
import { ReferralStatusValues } from '../types/referral'

export const ReferralStatus = pgEnum('referral_status', [
  ReferralStatusValues[0],
  ...ReferralStatusValues.slice(1),
])

export const apiKeyTypeEnum = pgEnum('api_key_type', [
  'anthropic',
  'gemini',
  'openai',
])

export const grantTypeEnum = pgEnum('grant_type', [
  GrantTypeValues[0], // 'free'
  ...GrantTypeValues.slice(1), // 'referral', 'purchase', 'admin', 'organization'
]);
export type GrantType = (typeof grantTypeEnum.enumValues)[number]

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
    sql<Date>`now() + INTERVAL '1 month'`
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

export const creditLedger = pgTable(
  'credit_ledger',
  {
    operation_id: text('operation_id').primaryKey(),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    principal: integer('principal').notNull(),
    balance: integer('balance').notNull(),
    type: grantTypeEnum('type').notNull(),
    description: text('description'),
    priority: integer('priority').notNull(),
    expires_at: timestamp('expires_at', { mode: 'date', withTimezone: true }),
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    org_id: text('org_id').references(() => org.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    idx_credit_ledger_active_balance: index('idx_credit_ledger_active_balance')
      .on(
        table.user_id,
        table.balance,
        table.expires_at,
        table.priority,
        table.created_at
      )
      .where(sql`${table.balance} != 0 AND ${table.expires_at} IS NULL`),
    idx_credit_ledger_org: index('idx_credit_ledger_org').on(table.org_id),
  })
)

export const syncFailure = pgTable(
  'sync_failure',
  {
    message_id: text('message_id')
      .primaryKey()
      .references(() => message.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('stripe'),
    created_at: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    last_attempt_at: timestamp('last_attempt_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    retry_count: integer('retry_count').notNull().default(1),
    last_error: text('last_error').notNull(),
  },
  (table) => ({
    idx_sync_failure_retry: index('idx_sync_failure_retry')
      .on(table.retry_count, table.last_attempt_at)
      .where(sql`${table.retry_count} < 5`),
  })
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
  created_at: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
})

export const message = pgTable(
  'message',
  {
    id: text('id').primaryKey(),
    finished_at: timestamp('finished_at', { mode: 'date' }).notNull(),
    client_id: text('client_id').notNull(),
    client_request_id: text('client_request_id').notNull(),
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
    org_id: text('org_id').references(() => org.id, { onDelete: 'cascade' }),
    repo_url: text('repo_url'),
  },
  (table) => [
    index('message_fingerprint_id_idx').on(table.fingerprint_id),
    index('message_user_id_idx').on(table.user_id),
    index('message_finished_at_user_id_idx').on(
      table.finished_at,
      table.user_id
    ),
    index('message_org_id_idx').on(table.org_id),
    index('message_org_id_finished_at_idx').on(table.org_id, table.finished_at),
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
  })
)

// Organization tables
export const orgRoleEnum = pgEnum('org_role', ['owner', 'admin', 'member'])

export const org = pgTable('org', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  description: text('description'),
  owner_id: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  stripe_customer_id: text('stripe_customer_id').unique(),
  stripe_subscription_id: text('stripe_subscription_id'),
  current_period_start: timestamp('current_period_start', {
    mode: 'date',
    withTimezone: true,
  }),
  current_period_end: timestamp('current_period_end', {
    mode: 'date',
    withTimezone: true,
  }),
  auto_topup_enabled: boolean('auto_topup_enabled').notNull().default(false),
  auto_topup_threshold: integer('auto_topup_threshold').default(500),
  auto_topup_amount: integer('auto_topup_amount').default(2000),
  credit_limit: integer('credit_limit'),
  billing_alerts: boolean('billing_alerts').notNull().default(true),
  usage_alerts: boolean('usage_alerts').notNull().default(true),
  weekly_reports: boolean('weekly_reports').notNull().default(false),
  created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const orgMember = pgTable(
  'org_member',
  {
    org_id: text('org_id')
      .notNull()
      .references(() => org.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: orgRoleEnum('role').notNull(),
    joined_at: timestamp('joined_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.org_id, table.user_id] })]
)

export const orgRepo = pgTable(
  'org_repo',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    org_id: text('org_id')
      .notNull()
      .references(() => org.id, { onDelete: 'cascade' }),
    repo_url: text('repo_url').notNull(),
    repo_name: text('repo_name').notNull(),
    approved_by: text('approved_by')
      .notNull()
      .references(() => user.id),
    approved_at: timestamp('approved_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    is_active: boolean('is_active').notNull().default(true),
  },
  (table) => [
    index('idx_org_repo_active').on(table.org_id, table.is_active),
    // Unique constraint on org + repo URL
    index('idx_org_repo_unique').on(table.org_id, table.repo_url),
  ]
)

export const orgInvite = pgTable(
  'org_invite',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    org_id: text('org_id')
      .notNull()
      .references(() => org.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: orgRoleEnum('role').notNull(),
    token: text('token').notNull().unique(),
    invited_by: text('invited_by')
      .notNull()
      .references(() => user.id),
    expires_at: timestamp('expires_at', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    accepted_at: timestamp('accepted_at', { mode: 'date', withTimezone: true }),
    accepted_by: text('accepted_by').references(() => user.id),
  },
  (table) => ({
    idx_org_invite_token: index('idx_org_invite_token').on(table.token),
    idx_org_invite_email: index('idx_org_invite_email').on(
      table.org_id,
      table.email
    ),
    idx_org_invite_expires: index('idx_org_invite_expires').on(
      table.expires_at
    ),
  })
)
