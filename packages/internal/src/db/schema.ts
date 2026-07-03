import { GrantTypeValues } from '@codebuff/common/types/grant'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { ReferralStatusValues } from '../types/referral'

import type { SQL } from 'drizzle-orm'
import type { AdapterAccount } from 'next-auth/adapters'
import type {
  FreebuffCountryBlockReason,
  FreebuffIpPrivacySignal,
  FreebuffPrivacyDecision,
  FreebuffPrivacyProviderDecision,
  FreebuffScamalyticsStatus,
  FreebuffSpurStatus,
} from '@codebuff/common/types/freebuff-session'

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
  GrantTypeValues[0],
  ...GrantTypeValues.slice(1),
])
export type GrantType = (typeof grantTypeEnum.enumValues)[number]

export const sessionTypeEnum = pgEnum('session_type', ['web', 'pat', 'cli'])

// Free-mode access tier. Defined here, above every table that references it
// (`referral`, `freeSession`, `freeSessionAdmit`), because pgTable() evaluates
// at module load — a forward reference to an enum declared further down would
// hit its temporal dead zone.
export const freebuffAccessTierEnum = pgEnum('freebuff_access_tier', [
  'full',
  'limited',
])

export const agentRunStatus = pgEnum('agent_run_status', [
  'running',
  'completed',
  'failed',
  'cancelled',
])

export const agentStepStatus = pgEnum('agent_step_status', [
  'running',
  'completed',
  'skipped',
])

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
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
  stripe_customer_id: text('stripe_customer_id').unique(),
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
  fallback_to_a_la_carte: boolean('fallback_to_a_la_carte')
    .notNull()
    .default(false),
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
    stripe_subscription_id: text('stripe_subscription_id'),
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
    index('idx_credit_ledger_subscription').on(
      table.user_id,
      table.type,
      table.created_at,
    ),
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
    is_legacy: boolean('is_legacy').notNull().default(false),
    // Which referral program attributed this signup. The CLI program ('cli')
    // and Freebuff Web ('web') share the token + ledger but have different
    // qualification bars, so scores are computed per program.
    program: text('program').notNull().default('cli'),
    created_at: timestamp('created_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', { mode: 'date' }),
    // Referral-program-v2 completion marker: set when the referred user passed
    // the full gate (GitHub bright line + burn-once + full-access activation).
    // Null on all legacy/old-program rows, so the referral score counts only
    // rows where this is set. See packages/billing/src/referral-program.ts.
    qualified_at: timestamp('qualified_at', { mode: 'date' }),
  },
  (table) => [
    // Program is part of the PK so a referred user can participate in more than
    // one program for the same referrer (e.g. a single freebuff.com link grants
    // both the Web tier 'web' row and the CLI GLM 'glm' row). Each program is
    // scored and burned-once independently downstream.
    primaryKey({
      columns: [table.referrer_id, table.referred_id, table.program],
    }),
    // Score reads: count qualified referrals per referrer / referred.
    index('idx_referral_qualified_referrer').on(
      table.referrer_id,
      table.qualified_at,
    ),
    index('idx_referral_qualified_referred').on(
      table.referred_id,
      table.qualified_at,
    ),
  ],
)

/**
 * Unified referral model (docs/referrals.md). One row per *referred* user — the
 * `referred_id` PK means a user is referred at most once, ever, across every
 * product. Supersedes `referral` + its `program` dimension (the old table is
 * dropped once products cut over).
 *
 * Qualification is deliberately NOT stored here: a referral "counts" when the
 * referred user's GitHub account is at least MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL
 * (4 months) old, which is DERIVED at read time from the immutable
 * `github_account_created_at` in `referral_qualification`
 * (joined via `referred_github_user_id`). Because the account age only ever
 * increases, this ages in automatically — no `qualified_at` flag to flip and no
 * sweep to flip it. The only writes are attribution (at signup) and activation
 * (on first product use).
 */
export const referralV2 = pgTable(
  'referral_v2',
  {
    // The referred user. PK: referred at most once, ever.
    referred_id: text('referred_id')
      .primaryKey()
      .references(() => user.id),
    referrer_id: text('referrer_id')
      .notNull()
      .references(() => user.id),
    // Immutable GitHub numeric id of the referred user, and the anti-sybil
    // burn-once key: UNIQUE means one GitHub identity is the referred party in
    // at most one referral, ever. Nullable for Google-only signups (Postgres
    // allows multiple NULLs under a UNIQUE constraint). Also the join key to
    // `referral_qualification` for the derived age check.
    referred_github_user_id: text('referred_github_user_id').unique(),
    // Attribution time — written at signup.
    created_at: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
    // First product use. A referral only COUNTS once this is set.
    activated_at: timestamp('activated_at', { mode: 'date' }),
    // Best access tier the referred user has activated at ('full' > 'limited').
    // Drives the benefit: 'full' → GLM/Opus, 'limited' → CLI daily-session bonus.
    activation_access_tier: freebuffAccessTierEnum('activation_access_tier'),
    // Clawback: a revoked referral is excluded from every count.
    revoked_at: timestamp('revoked_at', { mode: 'date' }),
    // Sock-puppet evidence, captured from the request that attributed the
    // referral. Signals only — they never gate the reward (a shared IP or
    // even a shared browser is what a genuine in-person referral looks like:
    // "try it, here's my laptop"). Meaningful only when corroborated by real
    // farm signals; the abuse sweep + scripts do that weighing (see
    // docs/referrals.md "Anti-abuse invariants").
    // HMAC-SHA256 of the redeeming request's IP (same hashClientIp secret as
    // free_session / free_mode_country_access_cache, so hashes are joinable).
    referred_ip_hash: text('referred_ip_hash'),
    // The redeeming browser's vly_device_id cookie — survives IP rotation.
    referred_device_id: text('referred_device_id'),
    // Computed at attribution: the referrer was recently seen on the same
    // IP (free_mode_country_access_cache) / browser (user_device). NULL when
    // the signal was unavailable, false when checked and clean.
    referrer_ip_overlap: boolean('referrer_ip_overlap'),
    referrer_device_overlap: boolean('referrer_device_overlap'),
  },
  (table) => [
    // Stats reads filter by referrer.
    index('idx_referral_v2_referrer').on(table.referrer_id),
    // Farm forensics cluster referred users by shared device / IP.
    index('idx_referral_v2_referred_device').on(table.referred_device_id),
    index('idx_referral_v2_referred_ip').on(table.referred_ip_hash),
  ],
)

/**
 * Referral link clicks, deduped per (referral_code, device_id) so the count is
 * unique visitors who landed via a share link — not raw page loads. Written
 * best-effort from the client capture hop (ReferralCodeCapture ->
 * storeReferralCookie), the same hop that sets the attribution cookie, so a
 * click is recorded exactly when a browser is first stamped for a code. Powers
 * the referrer funnel (clicks -> signups -> valid signups) on /web/referrals.
 *
 * `referrer_id` is resolved from `user.referral_code` at write time so funnel
 * reads filter by referrer without a join. Rows for unknown/legacy codes are
 * never inserted (the resolver returns null and the write is skipped).
 */
export const referralClick = pgTable(
  'referral_click',
  {
    // The share code from the URL (`user.referral_code`, `ref-<uuid>`).
    referral_code: text('referral_code').notNull(),
    // The owner of that code — resolved at write time so reads skip the join.
    referrer_id: text('referrer_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // The landing browser's vly_device_id cookie; the dedup key with the code.
    device_id: text('device_id').notNull(),
    // HMAC of the landing request IP (optional; forensics only, never gates).
    ip_hash: text('ip_hash'),
    created_at: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    // One click per browser per code: reloads/return visits don't re-count.
    primaryKey({ columns: [table.referral_code, table.device_id] }),
    // Funnel reads filter by referrer.
    index('idx_referral_click_referrer').on(table.referrer_id),
  ],
)

/**
 * Which browsers (vly_device_id cookie) each signed-in user has been seen on.
 * Written from the freebuff web authed hops (convex-token refresh, the
 * /get-started referral-eligibility check) — the same hops that redeem
 * referral cookies. Purpose-built for sock-puppet detection: a referral whose
 * `referred_device_id` matches one of the referrer's rows here means the
 * "friend" signed up from the referrer's own browser.
 */
export const userDevice = pgTable(
  'user_device',
  {
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    device_id: text('device_id').notNull(),
    first_seen: timestamp('first_seen', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    last_seen: timestamp('last_seen', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.device_id] }),
    // Overlap checks and farm clustering look up by device.
    index('idx_user_device_device').on(table.device_id),
  ],
)

// Caches the GitHub "bright line" referral-qualification result, and enforces
// burn-once. Keyed by the immutable GitHub numeric user id (NOT the freebuff
// user id) so the record survives account deletion / re-signup / email changes:
// a given GitHub account can only ever earn one referral bonus.
export const referralQualification = pgTable(
  'referral_qualification',
  {
    // Immutable GitHub numeric user id (account.providerAccountId for provider
    // 'github'). The durable identity we key everything on.
    github_user_id: text('github_user_id').primaryKey(),
    // The freebuff user this GitHub account currently belongs to. Nullable with
    // set-null on delete so the qualification/burn-once record outlives the user
    // row (recreating an account must not reset burn-once).
    user_id: text('user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    // Denormalized cache of the bright-line result. Qualification is DERIVED on
    // read from the stored facts below + the current policy, so these two are
    // just an indexable convenience kept in sync; they are not the source of
    // truth and may lag a policy change until the next read.
    qualified: boolean('qualified').notNull(),
    reason: text('reason'),
    // --- GitHub facts (the source of truth). Stored so qualification can be
    // re-derived and future signals/tiers computed without re-crawling. The two
    // timestamps are non-forgeable GitHub server-set dates the bright line uses.
    github_account_created_at: timestamp('github_account_created_at', {
      mode: 'date',
    }),
    oldest_public_repo_created_at: timestamp('oldest_public_repo_created_at', {
      mode: 'date',
    }),
    // The GitHub login (handle) captured on the same API call. Used to
    // personalize invite landing pages ("X invited you…") when the inviter has
    // no display name set. Nullable (unknown / not fetched / pre-backfill rows).
    github_login: text('github_login'),
    // Extra public signals captured on the same API call, for future tiering /
    // threshold experiments without a re-crawl. Nullable (unknown / not fetched).
    github_followers: integer('github_followers'),
    github_public_repos: integer('github_public_repos'),
    github_two_factor_enabled: boolean('github_two_factor_enabled'),
    // When we last fetched facts from GitHub (drives the negative-result TTL).
    checked_at: timestamp('checked_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
    // Burn-once: set the first time this GitHub account is consumed to grant a
    // referral bonus. A non-null value means it can never earn another. Shared
    // by the CLI ('cli') and Freebuff Web ('web') programs.
    bonus_consumed_at: timestamp('bonus_consumed_at', { mode: 'date' }),
    // The freebuff user that earned the bonus credited to this GitHub account
    // (the referred user), kept for auditability.
    bonus_consumed_by_user_id: text('bonus_consumed_by_user_id').references(
      () => user.id,
      { onDelete: 'set null' },
    ),
    // Separate burn-once ledger for the GLM 5.2 program. Kept independent of the
    // shared bonus above so a GitHub identity that already earned a web/cli
    // bonus can still qualify exactly one GLM referral (and vice versa) — the
    // GLM reward is a distinct perk, not the same single-bonus pool.
    glm_bonus_consumed_at: timestamp('glm_bonus_consumed_at', { mode: 'date' }),
    glm_bonus_consumed_by_user_id: text(
      'glm_bonus_consumed_by_user_id',
    ).references(() => user.id, { onDelete: 'set null' }),
  },
  (table) => [index('idx_referral_qualification_user').on(table.user_id)],
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
    // Always going to be 0 if using OpenRouter
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
    ttft_ms: integer('ttft_ms'),
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

export const session = pgTable(
  'session',
  {
    sessionToken: text('sessionToken').notNull().primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
    fingerprint_id: text('fingerprint_id').references(() => fingerprint.id),
    cli_auth_hash: text('cli_auth_hash'),
    type: sessionTypeEnum('type').notNull().default('web'),
    created_at: timestamp('created_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('session_cli_auth_code_idx')
      .on(table.fingerprint_id, table.cli_auth_hash)
      .where(sql`${table.cli_auth_hash} IS NOT NULL`),
  ],
)

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

export const composioSession = pgTable('composio_session', {
  user_id: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  session_id: text('session_id').notNull().unique(),
  created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow(),
})

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
    // Unique constraint on org + repo URL
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

// Ad impression logging table
export const adImpression = pgTable(
  'ad_impression',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    // Which upstream ad network served this ad ('gravity', 'carbon', 'zeroclick', ...)
    provider: text('provider').notNull().default('gravity'),

    // Ad content (normalized across providers)
    ad_text: text('ad_text').notNull(),
    title: text('title').notNull(),
    cta: text('cta').notNull().default(''),
    url: text('url').notNull(),
    favicon: text('favicon').notNull(),
    click_url: text('click_url').notNull(),
    imp_url: text('imp_url').notNull().unique(), // Unique to prevent duplicates
    // Extra tracking pixel URLs (e.g. Carbon's `pixel` field, `||`-separated).
    // Each string may contain `[timestamp]` which is substituted at fire time.
    extra_pixels: text('extra_pixels').array(),
    // Payout is Gravity-shaped; Carbon uses CPM and reports no per-impression
    // payout, so this is nullable to avoid polluting revenue dashboards with
    // fake numbers.
    payout: numeric('payout', { precision: 10, scale: 6 }),

    // Credit tracking
    credits_granted: integer('credits_granted').notNull(),
    grant_operation_id: text('grant_operation_id'), // Links to credit_ledger.operation_id

    // Timestamps
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

// Subscription tables
export const subscription = pgTable(
  'subscription',
  {
    stripe_subscription_id: text('stripe_subscription_id').primaryKey(),
    stripe_customer_id: text('stripe_customer_id').notNull(),
    user_id: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    stripe_price_id: text('stripe_price_id').notNull(),
    tier: integer('tier'),
    scheduled_tier: integer('scheduled_tier'),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    billing_period_start: timestamp('billing_period_start', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    billing_period_end: timestamp('billing_period_end', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    cancel_at_period_end: boolean('cancel_at_period_end')
      .notNull()
      .default(false),
    canceled_at: timestamp('canceled_at', { mode: 'date', withTimezone: true }),
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_subscription_customer').on(table.stripe_customer_id),
    index('idx_subscription_user').on(table.user_id),
    index('idx_subscription_status')
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
  ],
)

export const limitOverride = pgTable('limit_override', {
  user_id: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  credits_per_block: integer('credits_per_block').notNull(),
  block_duration_hours: integer('block_duration_hours').notNull(),
  weekly_credit_limit: integer('weekly_credit_limit').notNull(),
  created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type GitEvalMetadata = {
  numCases?: number // Number of eval cases successfully run (total)
  avgScore?: number // Average score across all cases
  avgCompletion?: number // Average completion across all cases
  avgEfficiency?: number // Average efficiency across all cases
  avgCodeQuality?: number // Average code quality across all cases
  avgDuration?: number // Average duration across all cases
  suite?: string // Name of the repo (eg: codebuff, manifold)
  avgTurns?: number // Average number of user turns across all cases
}

// Request type for the insert API
export interface GitEvalResultRequest {
  cost_mode?: string
  reasoner_model?: string
  agent_model?: string
  metadata?: GitEvalMetadata
  cost?: number
}

export const gitEvalResults = pgTable('git_eval_results', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  cost_mode: text('cost_mode'),
  reasoner_model: text('reasoner_model'),
  agent_model: text('agent_model'),
  metadata: jsonb('metadata'), // GitEvalMetadata
  cost: integer('cost').notNull().default(0),
  is_public: boolean('is_public').notNull().default(false),
  created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Agent Store tables
export const publisher = pgTable(
  'publisher',
  {
    id: text('id').primaryKey().notNull(), // user-selectable id (must match /^[a-z0-9-]+$/)
    name: text('name').notNull(),
    email: text('email'), // optional, for support
    verified: boolean('verified').notNull().default(false),
    bio: text('bio'),
    avatar_url: text('avatar_url'),

    // Ownership - exactly one must be set
    user_id: text('user_id').references(() => user.id, {
      onDelete: 'no action',
    }),
    org_id: text('org_id').references(() => org.id, { onDelete: 'no action' }),

    created_by: text('created_by')
      .notNull()
      .references(() => user.id),
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Constraint to ensure exactly one owner type
    check(
      'publisher_single_owner',
      sql`(${table.user_id} IS NOT NULL AND ${table.org_id} IS NULL) OR
    (${table.user_id} IS NULL AND ${table.org_id} IS NOT NULL)`,
    ),
  ],
)

export const agentConfig = pgTable(
  'agent_config',
  {
    id: text('id')
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    version: text('version').notNull(), // Semantic version e.g., '1.0.0'
    publisher_id: text('publisher_id')
      .notNull()
      .references(() => publisher.id),
    major: integer('major').generatedAlwaysAs(
      (): SQL =>
        sql`CAST(SPLIT_PART(${agentConfig.version}, '.', 1) AS INTEGER)`,
    ),
    minor: integer('minor').generatedAlwaysAs(
      (): SQL =>
        sql`CAST(SPLIT_PART(${agentConfig.version}, '.', 2) AS INTEGER)`,
    ),
    patch: integer('patch').generatedAlwaysAs(
      (): SQL =>
        sql`CAST(SPLIT_PART(${agentConfig.version}, '.', 3) AS INTEGER)`,
    ),
    data: jsonb('data').notNull(), // All agentConfig details
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.publisher_id, table.id, table.version] }),
    index('idx_agent_config_publisher').on(table.publisher_id),
  ],
)

export const agentRun = pgTable(
  'agent_run',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Identity and relationships
    user_id: text('user_id').references(() => user.id, { onDelete: 'cascade' }),

    // Agent identity (either "publisher/agent@version" OR a plain string with no '/' or '@')
    agent_id: text('agent_id').notNull(),

    // Agent identity (full versioned ID like "CodebuffAI/reviewer@1.0.0")
    publisher_id: text('publisher_id').generatedAlwaysAs(
      sql`CASE
             WHEN agent_id ~ '^[^/@]+/[^/@]+@[^/@]+$'
               THEN split_part(agent_id, '/', 1)
             ELSE NULL
           END`,
    ),
    // agent_name: middle part for full pattern; otherwise the whole id
    agent_name: text('agent_name').generatedAlwaysAs(
      sql`CASE
             WHEN agent_id ~ '^[^/@]+/[^/@]+@[^/@]+$'
               THEN split_part(split_part(agent_id, '/', 2), '@', 1)
             ELSE agent_id
           END`,
    ),
    agent_version: text('agent_version').generatedAlwaysAs(
      sql`CASE
             WHEN agent_id ~ '^[^/@]+/[^/@]+@[^/@]+$'
               THEN split_part(agent_id, '@', 2)
             ELSE NULL
           END`,
    ),

    // Hierarchy tracking
    ancestor_run_ids: text('ancestor_run_ids').array(), // array of ALL run IDs from root (inclusive) to self (exclusive)
    // Derived from ancestor_run_ids - root is first element
    root_run_id: text('root_run_id').generatedAlwaysAs(
      sql`CASE WHEN array_length(ancestor_run_ids, 1) >= 1 THEN ancestor_run_ids[1] ELSE id END`,
    ),
    // Derived from ancestor_run_ids - parent is second-to-last element
    parent_run_id: text('parent_run_id').generatedAlwaysAs(
      sql`CASE WHEN array_length(ancestor_run_ids, 1) >= 1 THEN ancestor_run_ids[array_length(ancestor_run_ids, 1)] ELSE NULL END`,
    ),
    // Derived from ancestor_run_ids - depth is array length minus 1
    depth: integer('depth').generatedAlwaysAs(
      sql`COALESCE(array_length(ancestor_run_ids, 1), 1)`,
    ),

    // Performance metrics
    duration_ms: integer('duration_ms').generatedAlwaysAs(
      sql`CASE WHEN completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000 ELSE NULL END::integer`,
    ), // total time from start to completion in milliseconds
    total_steps: integer('total_steps').default(0), // denormalized count

    // Credit tracking
    direct_credits: numeric('direct_credits', {
      precision: 10,
      scale: 6,
    }).default('0'), // credits used by this agent only
    total_credits: numeric('total_credits', {
      precision: 10,
      scale: 6,
    }).default('0'), // credits used by this agent + all descendants

    // Status tracking
    status: agentRunStatus('status').notNull().default('running'),
    error_message: text('error_message'),

    // Timestamps
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', {
      mode: 'date',
      withTimezone: true,
    }),
  },
  (table) => [
    // Performance indices
    index('idx_agent_run_user_id').on(table.user_id, table.created_at),
    index('idx_agent_run_parent').on(table.parent_run_id),
    index('idx_agent_run_root').on(table.root_run_id),
    index('idx_agent_run_agent_id').on(table.agent_id, table.created_at),
    index('idx_agent_run_publisher').on(table.publisher_id, table.created_at),
    index('idx_agent_run_status')
      .on(table.status)
      .where(sql`${table.status} = 'running'`),
    index('idx_agent_run_ancestors_gin').using('gin', table.ancestor_run_ids),
    // Performance indexes for agent store
    index('idx_agent_run_completed_publisher_agent')
      .on(table.publisher_id, table.agent_name)
      .where(sql`${table.status} = 'completed'`),
    index('idx_agent_run_completed_recent')
      .on(table.created_at, table.publisher_id, table.agent_name)
      .where(sql`${table.status} = 'completed'`),
    index('idx_agent_run_completed_version')
      .on(
        table.publisher_id,
        table.agent_name,
        table.agent_version,
        table.created_at,
      )
      .where(sql`${table.status} = 'completed'`),
    index('idx_agent_run_completed_user')
      .on(table.user_id)
      .where(sql`${table.status} = 'completed'`),
  ],
)

export const agentStep = pgTable(
  'agent_step',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Relationship to run
    agent_run_id: text('agent_run_id')
      .notNull()
      .references(() => agentRun.id, { onDelete: 'cascade' }),
    step_number: integer('step_number').notNull(), // sequential within the run

    // Performance metrics
    duration_ms: integer('duration_ms').generatedAlwaysAs(
      sql`CASE WHEN completed_at IS NOT NULL THEN EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000 ELSE NULL END::integer`,
    ), // total time from start to completion in milliseconds
    credits: numeric('credits', {
      precision: 10,
      scale: 6,
    })
      .notNull()
      .default('0'), // credits used by this step

    // Spawned agents tracking
    child_run_ids: text('child_run_ids').array(), // array of agent_run IDs created by this step
    spawned_count: integer('spawned_count').generatedAlwaysAs(
      sql`array_length(child_run_ids, 1)`,
    ),

    // Message tracking (if applicable)
    message_id: text('message_id'), // reference to message table if needed

    // Status
    status: agentStepStatus('status').notNull().default('completed'),
    error_message: text('error_message'),

    // Timestamps
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    completed_at: timestamp('completed_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Unique constraint for step numbers per run
    uniqueIndex('unique_step_number_per_run').on(
      table.agent_run_id,
      table.step_number,
    ),
    // Performance indices
    index('idx_agent_step_run_id').on(table.agent_run_id),
    index('idx_agent_step_children_gin').using('gin', table.child_run_ids),
  ],
)

export const freebuffDailyUsage = pgTable(
  'freebuff_daily_usage',
  {
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    usage_date: date('usage_date').notNull(),
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.usage_date] }),
    index('idx_freebuff_daily_usage_date').on(table.usage_date),
  ],
)

export const freeSessionStatusEnum = pgEnum('free_session_status', [
  'queued',
  'active',
])
/**
 * Free-user session / waiting-room state. One row per user is enforced by the
 * PK on user_id so a single account cannot occupy multiple active sessions.
 *
 * Status transitions:
 *   none  → (POST /session)        → queued
 *   queued → (admission tick)      → active
 *   active → (expires_at in past)  → treated as expired; next POST re-queues
 *   any   → (DELETE /session)      → row removed
 *
 * active_instance_id is server-generated on every POST /session and rotates
 * when a new CLI takes over. Chat completions requires a matching
 * active_instance_id so prior instances stop serving requests.
 */
export const freeSession = pgTable(
  'free_session',
  {
    user_id: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: freeSessionStatusEnum('status').notNull(),
    active_instance_id: text('active_instance_id').notNull(),
    /** Which freebuff model this row is queued for / locked to. Each model has
     *  its own queue (admission picks one queued user per model per tick) and
     *  the model is fixed for the life of an active session. */
    model: text('model').notNull(),
    access_tier: freebuffAccessTierEnum('access_tier')
      .notNull()
      .default('full'),
    /** Sticky Fireworks upstream this session is pinned to, decided once at
     *  admission from the dedicated deployment's health: 'deployment' (healthy
     *  at admit time) or 'serverless' (degraded/unhealthy → shed onto the
     *  always-on backup). Fixed for the session's life so the prompt cache
     *  never cold-starts from a mid-session upstream switch. Null for models
     *  with no serverless backup (the hot path uses default deployment
     *  routing). See `routeForAdmission` in fireworks-health.ts. */
    fireworks_route: text('fireworks_route').$type<
      'deployment' | 'serverless'
    >(),
    /** Sticky upstream pin for MiniMax-family models that default to the
     *  Fireworks serverless API and fall back to the official MiniMax API on
     *  rate limits. Set to 'minimax' the first time Fireworks rate-limits the
     *  session, then honored for every later request so the warm prompt cache
     *  never cold-starts from a mid-session upstream switch. Null → default
     *  (Fireworks) upstream. See minimax-m3-router.ts. */
    minimax_upstream: text('minimax_upstream').$type<'fireworks' | 'minimax'>(),
    /** Resolved country/privacy metadata from the latest successful
     *  free-session POST country gate. Raw IP is not stored; `client_ip_hash`
     *  is HMAC-SHA256 with the server auth secret for correlation only. */
    country_code: text('country_code'),
    cf_country: text('cf_country'),
    geoip_country: text('geoip_country'),
    country_block_reason: text(
      'country_block_reason',
    ).$type<FreebuffCountryBlockReason | null>(),
    ip_privacy_signals: text('ip_privacy_signals')
      .array()
      .$type<FreebuffIpPrivacySignal[] | null>(),
    client_ip_hash: text('client_ip_hash'),
    country_checked_at: timestamp('country_checked_at', {
      mode: 'date',
      withTimezone: true,
    }),
    queued_at: timestamp('queued_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    admitted_at: timestamp('admitted_at', {
      mode: 'date',
      withTimezone: true,
    }),
    expires_at: timestamp('expires_at', {
      mode: 'date',
      withTimezone: true,
    }),
    created_at: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Per-model dequeue: WHERE status='queued' AND model=$1 ORDER BY queued_at
    index('idx_free_session_queue').on(
      table.status,
      table.model,
      table.queued_at,
    ),
    // Expiry sweep: SELECT ... WHERE status='active' AND expires_at < now()
    index('idx_free_session_expiry').on(table.expires_at),
  ],
)

/**
 * Freebuff Desktop multi-session state. Sibling of `free_session`, kept separate
 * so the single-session CLI/web invariant on `free_session` (PK on user_id +
 * takeover) is preserved byte-for-byte: this table is only ever touched by
 * desktop requests carrying the multi-session flag.
 *
 * Unlike `free_session`, a single user may hold MANY concurrent rows here — one
 * per parallel desktop tab, each keyed by its own active_instance_id. There is
 * no queue/takeover: desktop sessions are admitted immediately (status always
 * 'active') and never supersede each other.
 *
 * The one hard limit is the `premium_bucket` concurrency cap, enforced as a DB
 * invariant by `uniq_free_session_desktop_premium_active`: at most one active
 * premium-bucket session (premium models + MiniMax M3 + GLM 5.2, see
 * isFreebuffDesktopPremiumBucketModelId — plus EVERY model on the limited
 * access tier, which is capped to one freebuff tab at a time) per user. A
 * racing second premium admit hits a unique violation (23505), which the store
 * maps to `premium_slot_taken`. Unlimited-bucket rows are outside the partial
 * index → unbounded concurrency.
 */
export const freeSessionDesktop = pgTable(
  'free_session_desktop',
  {
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** One instance id per desktop tab. Part of the composite PK so tabs never
     *  collide or supersede one another. */
    active_instance_id: text('active_instance_id').notNull(),
    /** Desktop sessions are admitted immediately, but the column mirrors
     *  free_session so shared view/sweep code reads the same shape. */
    status: freeSessionStatusEnum('status').notNull(),
    /** Freebuff model this tab's session is locked to. */
    model: text('model').notNull(),
    /** Whether `model` is in the premium concurrency bucket. Stored (not derived
     *  at query time) so the partial unique index below is a trivial DB
     *  invariant immune to model-list drift. */
    premium_bucket: boolean('premium_bucket').notNull().default(false),
    access_tier: freebuffAccessTierEnum('access_tier')
      .notNull()
      .default('full'),
    /** See free_session.fireworks_route. */
    fireworks_route: text('fireworks_route').$type<
      'deployment' | 'serverless'
    >(),
    /** See free_session.minimax_upstream. */
    minimax_upstream: text('minimax_upstream').$type<'fireworks' | 'minimax'>(),
    country_code: text('country_code'),
    cf_country: text('cf_country'),
    geoip_country: text('geoip_country'),
    country_block_reason: text(
      'country_block_reason',
    ).$type<FreebuffCountryBlockReason | null>(),
    ip_privacy_signals: text('ip_privacy_signals')
      .array()
      .$type<FreebuffIpPrivacySignal[] | null>(),
    client_ip_hash: text('client_ip_hash'),
    country_checked_at: timestamp('country_checked_at', {
      mode: 'date',
      withTimezone: true,
    }),
    queued_at: timestamp('queued_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    admitted_at: timestamp('admitted_at', {
      mode: 'date',
      withTimezone: true,
    }),
    expires_at: timestamp('expires_at', {
      mode: 'date',
      withTimezone: true,
    }),
    created_at: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.active_instance_id] }),
    // At most one active premium-bucket session per user (the concurrency cap).
    uniqueIndex('uniq_free_session_desktop_premium_active')
      .on(table.user_id)
      .where(sql`${table.status} = 'active' AND ${table.premium_bucket} = true`),
    // Expiry sweep.
    index('idx_free_session_desktop_expiry').on(table.expires_at),
    // Per-IP active-session count (abuse instrumentation).
    index('idx_free_session_desktop_ip').on(
      table.status,
      table.client_ip_hash,
    ),
    // Cheap per-user total-active count + lookups.
    index('idx_free_session_desktop_user_status').on(
      table.user_id,
      table.status,
    ),
  ],
)

/**
 * Shared cache for free-mode country/privacy decisions. Raw IP addresses are
 * never persisted; client_ip_hash is HMAC-SHA256 with the server auth secret.
 */
export const freeModeCountryAccessCache = pgTable(
  'free_mode_country_access_cache',
  {
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    client_ip_hash: text('client_ip_hash').notNull(),
    allowed: boolean('allowed').notNull(),
    country_code: text('country_code'),
    cf_country: text('cf_country'),
    geoip_country: text('geoip_country'),
    country_block_reason: text(
      'country_block_reason',
    ).$type<FreebuffCountryBlockReason | null>(),
    ip_privacy_signals: text('ip_privacy_signals')
      .array()
      .$type<FreebuffIpPrivacySignal[] | null>(),
    spur_ip_privacy_signals: text('spur_ip_privacy_signals')
      .array()
      .$type<FreebuffIpPrivacySignal[] | null>(),
    spur_status: text('spur_status').$type<FreebuffSpurStatus | null>(),
    scamalytics_ip_privacy_signals: text('scamalytics_ip_privacy_signals')
      .array()
      .$type<FreebuffIpPrivacySignal[] | null>(),
    scamalytics_status: text(
      'scamalytics_status',
    ).$type<FreebuffScamalyticsStatus | null>(),
    scamalytics_score: integer('scamalytics_score'),
    scamalytics_risk: text('scamalytics_risk'),
    risk_score: integer('risk_score'),
    privacy_decision: text(
      'privacy_decision',
    ).$type<FreebuffPrivacyDecision | null>(),
    privacy_provider_decision: text(
      'privacy_provider_decision',
    ).$type<FreebuffPrivacyProviderDecision | null>(),
    // Browser-supplied hints recorded at check time (web surface only).
    // Downgrade-only signals; persisted for tuning before tightening.
    client_timezone: text('client_timezone'),
    client_tz_country: text('client_tz_country'),
    client_languages: text('client_languages'),
    client_hints_suspicious: boolean('client_hints_suspicious'),
    checked_at: timestamp('checked_at', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    expires_at: timestamp('expires_at', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    created_at: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.user_id, table.client_ip_hash] }),
    index('idx_free_mode_country_cache_expires_at').on(table.expires_at),
  ],
)

/**
 * Audit log of every admission — one row per queued→active transition. Used
 * to track shared premium-session usage for Freebuff's 5 sessions per Pacific
 * day allowance. `session_units` starts at 1.0 and may be reduced when users
 * end active sessions early.
 *
 * Separate from `free_session` because that table is one-row-per-user (state,
 * not history); the UPSERT path there would otherwise destroy prior admissions.
 */
export const freeSessionAdmit = pgTable(
  'free_session_admit',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    model: text('model').notNull(),
    access_tier: freebuffAccessTierEnum('access_tier')
      .notNull()
      .default('full'),
    admitted_at: timestamp('admitted_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    session_units: numeric('session_units', {
      precision: 3,
      scale: 1,
    })
      .notNull()
      .default('1.0'),
  },
  (table) => [
    // Rate-limit lookup: WHERE user_id=$1 AND model=$2 AND admitted_at > $cutoff
    index('idx_free_session_admit_user_model_time').on(
      table.user_id,
      table.model,
      table.admitted_at,
    ),
  ],
)

export const freebuffStreakRewardPoolEnum = pgEnum(
  'freebuff_streak_reward_pool',
  ['premium', 'limited', 'glm'],
)

/**
 * Streak milestone rewards. One row per (user, pool, milestone-day): when a
 * user's daily Freebuff streak crosses a 7-day multiple they earn a bonus
 * session in their primary daily pool (`premium`/`limited`) plus — for
 * full-access users — a weekly GLM 5.2 bonus (`glm`).
 *
 * The reward is consumed by *raising the effective session limit* for the
 * matching pool over the period the milestone was reached in: the session-quota
 * gate sums `session_units` for rows whose `awarded_at` falls inside the current
 * Pacific day (premium/limited) or week (glm) and adds them to the base limit.
 * `reward_key` is the Pacific usage-date the milestone completed on; a user can
 * complete at most one milestone per day, so (user_id, pool, reward_key) makes
 * the award idempotent across retries and concurrent requests.
 */
export const freebuffStreakReward = pgTable(
  'freebuff_streak_reward',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    pool: freebuffStreakRewardPoolEnum('pool').notNull(),
    /** The Pacific usage-date (YYYY-MM-DD) whose usage completed the milestone. */
    reward_key: text('reward_key').notNull(),
    session_units: numeric('session_units', {
      precision: 3,
      scale: 1,
    })
      .notNull()
      .default('1.0'),
    awarded_at: timestamp('awarded_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    created_at: timestamp('created_at', {
      mode: 'date',
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('unique_freebuff_streak_reward_user_pool_key').on(
      table.user_id,
      table.pool,
      table.reward_key,
    ),
    // Bonus-sum lookup: WHERE user_id=$1 AND pool=$2 AND awarded_at >= $since
    index('idx_freebuff_streak_reward_user_pool_time').on(
      table.user_id,
      table.pool,
      table.awarded_at,
    ),
  ],
)

export const chatMessageRoleEnum = pgEnum('chat_message_role', [
  'user',
  'assistant',
])

/**
 * Freebuff web chat (freebuff.com/chat). One row per conversation in the
 * sidebar. Messages live in `chat_message`.
 */
export const chatThread = pgTable(
  'chat_thread',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default('New chat'),
    model: text('model').notNull(),
    // Serialized SDK RunState; passed back as `previousRun` so the base-chat
    // agent continues the conversation with its native message history.
    run_state: jsonb('run_state'),
    // While set in the future, a response is being generated for this thread.
    // Claimed atomically before each run so concurrent sends can't clobber
    // run_state; expires on its own if the server dies mid-run.
    run_claimed_until: timestamp('run_claimed_until', {
      mode: 'date',
      withTimezone: true,
    }),
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Sidebar listing: WHERE user_id=$1 ORDER BY updated_at DESC
    index('idx_chat_thread_user_updated').on(table.user_id, table.updated_at),
  ],
)

export const chatMessage = pgTable(
  'chat_message',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    thread_id: text('thread_id')
      .notNull()
      .references(() => chatThread.id, { onDelete: 'cascade' }),
    // Denormalized from chat_thread for cheap per-user rate-limit counts.
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: chatMessageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    // Block tree (text/tool/agent blocks) for assistant turns that spawned
    // subagents; null for plain-text turns. See freebuff/web chat blocks.ts.
    blocks: jsonb('blocks'),
    // Image attachments on user turns: an array of { storageId, mediaType }.
    // Bytes live in the blob store (Convex file storage); only opaque refs are
    // persisted. Serving URLs are resolved on read, never stored. Null for
    // turns without images.
    images: jsonb('images'),
    // Document attachments on user turns: an array of { storageId, mediaType,
    // name, chars, tokens, truncated }. Unlike images, the blob holds the
    // EXTRACTED text (converted to LLM-readable UTF-8 at upload time), so the
    // chat agent can read it inline or search it. Null for turns without docs.
    attachments: jsonb('attachments'),
    model: text('model'),
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_chat_message_thread_created').on(
      table.thread_id,
      table.created_at,
    ),
    // Rate-limit lookup: WHERE user_id=$1 AND role='user' AND created_at > $cutoff
    index('idx_chat_message_user_created').on(table.user_id, table.created_at),
  ],
)

/**
 * Append-only ledger for chat rate limiting. One row per accepted user
 * message. Deliberately NOT tied to chat_thread/chat_message: deleting a
 * thread cascades away its messages, which would otherwise reset the
 * user's rate-limit counters (unlimited free LLM via send → delete → repeat).
 */
export const chatUsageEvent = pgTable(
  'chat_usage_event',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Rate-limit lookup: WHERE user_id=$1 AND created_at > $cutoff
    index('idx_chat_usage_event_user_created').on(
      table.user_id,
      table.created_at,
    ),
  ],
)
