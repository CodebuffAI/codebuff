import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

import type { SQL } from 'drizzle-orm'

import { grantTypeEnum } from './enums'
import { org } from './organizations'
import { user } from './users'

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
  (table) => [
    index('idx_credit_ledger_active_balance')
      .on(
        table.user_id,
        table.balance,
        table.expires_at,
        table.priority,
        table.created_at,
      )
      .where(sql`${table.balance} != 0 AND ${table.expires_at} IS NULL`),
    index('idx_credit_ledger_org').on(table.org_id),
  ],
)

export const syncFailure = pgTable(
  'sync_failure',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
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
  (table) => [
    index('idx_sync_failure_retry')
      .on(table.retry_count, table.last_attempt_at)
      .where(sql`${table.retry_count} < 5`),
  ],
)

// Usage tracking table - stores LLM message costs and token usage
export const message = pgTable(
  'message',
  {
    id: text('id').primaryKey(),
    finished_at: timestamp('finished_at', { mode: 'date' }).notNull(),
    client_id: text('client_id'),
    client_request_id: text('client_request_id'),
    model: text('model').notNull(),
    agent_id: text('agent_id'),
    request: jsonb('request'),
    lastMessage: jsonb('last_message').generatedAlwaysAs(
      (): SQL => sql`${message.request} -> -1`,
    ),
    reasoning_text: text('reasoning_text'),
    response: jsonb('response').notNull(),
    input_tokens: integer('input_tokens').notNull().default(0),
    cache_creation_input_tokens: integer('cache_creation_input_tokens'),
    cache_read_input_tokens: integer('cache_read_input_tokens')
      .notNull()
      .default(0),
    reasoning_tokens: integer('reasoning_tokens'),
    output_tokens: integer('output_tokens').notNull(),
    cost: numeric('cost', { precision: 100, scale: 20 }).notNull(),
    credits: integer('credits').notNull(),
    byok: boolean('byok').notNull().default(false),
    latency_ms: integer('latency_ms'),
    user_id: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    org_id: text('org_id').references(() => org.id, { onDelete: 'cascade' }),
    repo_url: text('repo_url'),
  },
  (table) => [
    index('message_user_id_idx').on(table.user_id),
    index('message_finished_at_user_id_idx').on(
      table.finished_at,
      table.user_id,
    ),
    index('message_org_id_idx').on(table.org_id),
    index('message_org_id_finished_at_idx').on(table.org_id, table.finished_at),
  ],
)

// Ad impression tracking - grants credits to users for viewing ads
export const adImpression = pgTable(
  'ad_impression',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ad_text: text('ad_text').notNull(),
    title: text('title').notNull(),
    cta: text('cta').notNull().default(''),
    url: text('url').notNull(),
    favicon: text('favicon').notNull(),
    click_url: text('click_url').notNull(),
    imp_url: text('imp_url').notNull().unique(),
    payout: numeric('payout', { precision: 10, scale: 6 }).notNull(),
    credits_granted: integer('credits_granted').notNull(),
    grant_operation_id: text('grant_operation_id'),
    served_at: timestamp('served_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    impression_fired_at: timestamp('impression_fired_at', {
      mode: 'date',
      withTimezone: true,
    }),
    clicked_at: timestamp('clicked_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [
    index('idx_ad_impression_user').on(table.user_id, table.served_at),
    index('idx_ad_impression_imp_url').on(table.imp_url),
  ],
)
