import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

import { orgRoleEnum } from './enums'
import { user } from './users'

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
  auto_topup_threshold: integer('auto_topup_threshold').notNull(),
  auto_topup_amount: integer('auto_topup_amount').notNull(),
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
  (table) => [primaryKey({ columns: [table.org_id, table.user_id] })],
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
    repo_owner: text('repo_owner'),
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
    // Index for org + repo URL lookups (not a unique constraint)
    index('idx_org_repo_unique').on(table.org_id, table.repo_url),
  ],
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
  (table) => [
    index('idx_org_invite_token').on(table.token),
    index('idx_org_invite_email').on(table.org_id, table.email),
    index('idx_org_invite_expires').on(table.expires_at),
  ],
)

export const orgFeature = pgTable(
  'org_feature',
  {
    org_id: text('org_id')
      .notNull()
      .references(() => org.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(),
    config: jsonb('config'),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.org_id, table.feature] }),
    index('idx_org_feature_active').on(table.org_id, table.is_active),
  ],
)
