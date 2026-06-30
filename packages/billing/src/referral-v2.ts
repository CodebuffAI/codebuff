import {
  FREEBUFF_REFERRAL_SIGNUP_LIMIT,
  REFERRAL_SIGNUP_WINDOW_DAYS,
} from '@codebuff/common/constants/freebuff-referral-tiers'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, count, eq, isNull, sql } from 'drizzle-orm'

import type { FreebuffAccessTier } from '@codebuff/common/constants/freebuff-models'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'

/**
 * Write side of the unified referral model (docs/referrals.md), Phase 2.
 *
 * Two events feed `referral_v2`, dual-written alongside the legacy per-program
 * `referral` rows until the cutover:
 *   - attribution at signup  → {@link recordReferralV2Attribution}
 *   - activation on admit     → {@link recordReferralV2Activation}
 *
 * Qualification is NOT written here — it is derived at read time from the
 * referred user's GitHub account age (see referral-stats.ts).
 *
 * `conn` is injectable (defaults to the shared `db`) so callers can run a write
 * inside an existing transaction and tests can target a test database.
 */
type DbConn = PostgresJsDatabase<typeof schema>

/**
 * The access tier a referral should hold after the referred user activates at
 * `incoming`, given the `current` stored tier. 'full' outranks 'limited', and a
 * tier never downgrades (a one-time limited activation can later upgrade to
 * full, but not vice-versa). Pure so the policy is exhaustively unit-testable.
 */
export function nextActivationTier(
  current: FreebuffAccessTier | null,
  incoming: FreebuffAccessTier,
): FreebuffAccessTier {
  return current === 'full' || incoming === 'full' ? 'full' : 'limited'
}

/**
 * Upsert the unified referral attribution row. Idempotent and "first referrer
 * wins": the `referred_id` primary key + `onConflictDoNothing` mean re-running
 * never changes an existing row, and the UNIQUE `referred_github_user_id`
 * enforces burn-once (one GitHub identity is the referred party at most once,
 * even across re-signups under a new freebuff user). Looks up the referred
 * user's GitHub id itself (null for Google-only signups; multiple NULLs are
 * allowed under the unique constraint).
 *
 * Enforces the anti-abuse invariants directly (docs/referrals.md), so they keep
 * holding once the legacy redeem path that historically gated them is torn down:
 * no same-user self-referral, the 30-day signup attribution window, no reverse
 * (mutual) referrals, and a generous per-referrer signup cap. Each violation is
 * a quiet skip (returns false) — attribution is best-effort and never throws on
 * an auth hop.
 *
 * On self-referral by IDENTITY (the referrer using a second GitHub of their
 * own): there is no deterministic check, by design. The `account` table keys a
 * GitHub id to exactly one freebuff user, so a referred GitHub id can never also
 * be the referrer's — the case reduces to the same-user guard below. A
 * determined operator using a SEPARATE freebuff account + a SEPARATE aged GitHub
 * is a sybil, bounded by burn-once (one reward per GitHub identity) and caught
 * by the periodic abuse sweep (revoked_at) — not detectable here.
 *
 * Returns true iff this call created the row.
 */
export async function recordReferralV2Attribution(params: {
  referrerId: string
  referredId: string
  now?: Date
  conn?: DbConn
  logger?: Logger
}): Promise<boolean> {
  const { referrerId, referredId, now = new Date(), conn = db, logger } = params

  // No same-user self-referral.
  if (referrerId === referredId) return false

  // Idempotent + first-referrer-wins: one row per referred user (PK). If a row
  // already exists this is a re-run (the cookie re-redeems on every web token
  // refresh) — no-op WITHOUT paying for the validation queries below, keeping
  // the token-refresh hot path cheap. Genuine first attributions are rare.
  const [existing] = await conn
    .select({ referredId: schema.referralV2.referred_id })
    .from(schema.referralV2)
    .where(eq(schema.referralV2.referred_id, referredId))
    .limit(1)
  if (existing) return false

  // 30-day signup attribution window: only recently-created accounts count, so a
  // referrer can't claim a long-pre-existing account.
  const [referred] = await conn
    .select({ createdAt: schema.user.created_at })
    .from(schema.user)
    .where(eq(schema.user.id, referredId))
    .limit(1)
  const signupCutoff = new Date(
    now.getTime() - REFERRAL_SIGNUP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  )
  if (!referred || referred.createdAt < signupCutoff) {
    logger?.info(
      { referrerId, referredId },
      'referral_v2 attribution skipped: signup outside the attribution window',
    )
    return false
  }

  // No reverse referrals: if this referrer was themselves referred BY the user
  // they're now referring, refuse — blocks two accounts farming each other.
  const [reverse] = await conn
    .select({ referredId: schema.referralV2.referred_id })
    .from(schema.referralV2)
    .where(
      and(
        eq(schema.referralV2.referrer_id, referredId),
        eq(schema.referralV2.referred_id, referrerId),
      ),
    )
    .limit(1)
  if (reverse) {
    logger?.info(
      { referrerId, referredId },
      'referral_v2 attribution skipped: reverse referral',
    )
    return false
  }

  // Anti-spam signup cap. Generous (well above any read-time reward cap), so it
  // never blocks a legitimate referrer — it only bounds pathological row growth.
  const [{ n: referrerCount }] = await conn
    .select({ n: count() })
    .from(schema.referralV2)
    .where(eq(schema.referralV2.referrer_id, referrerId))
  if (referrerCount >= FREEBUFF_REFERRAL_SIGNUP_LIMIT) {
    logger?.warn(
      { referrerId, referredId, referrerCount },
      'referral_v2 attribution skipped: referrer signup limit reached',
    )
    return false
  }

  const [github] = await conn
    .select({ providerAccountId: schema.account.providerAccountId })
    .from(schema.account)
    .where(
      and(
        eq(schema.account.userId, referredId),
        eq(schema.account.provider, 'github'),
      ),
    )
    .limit(1)

  const inserted = await conn
    .insert(schema.referralV2)
    .values({
      referred_id: referredId,
      referrer_id: referrerId,
      referred_github_user_id: github?.providerAccountId ?? null,
      created_at: now,
    })
    .onConflictDoNothing()
    .returning({ referredId: schema.referralV2.referred_id })

  return inserted.length > 0
}

/**
 * Record that the referred user activated (used a product) at `accessTier`.
 * Stamps `activated_at` the first time and upgrades `activation_access_tier`
 * per {@link nextActivationTier}. A no-op (zero rows) for users with no
 * referral row. Idempotent.
 *
 * The read + write should share a transaction for atomicity; pass the admit
 * transaction as `conn`. Outside a transaction the worst case is a benign tier
 * flap that self-corrects on the next activation.
 */
export async function recordReferralV2Activation(params: {
  referredId: string
  accessTier: FreebuffAccessTier
  now?: Date
  conn?: DbConn
}): Promise<void> {
  const { referredId, accessTier, now = new Date(), conn = db } = params

  const [existing] = await conn
    .select({
      activatedAt: schema.referralV2.activated_at,
      tier: schema.referralV2.activation_access_tier,
    })
    .from(schema.referralV2)
    .where(eq(schema.referralV2.referred_id, referredId))
    .limit(1)
  if (!existing) return

  await conn
    .update(schema.referralV2)
    .set({
      activated_at: existing.activatedAt ?? now,
      activation_access_tier: nextActivationTier(existing.tier, accessTier),
    })
    .where(eq(schema.referralV2.referred_id, referredId))
}

/**
 * Backfill a referral's `referred_github_user_id` once the referred user links a
 * GitHub account. Attribution can happen before the account is linked (the
 * `createUser` auth event fires ahead of `linkAccount`) or for a Google-only
 * signup that connects GitHub later — in both cases the row is written with a
 * null github id, and the derived qualification join drops it (so it never
 * counts) until this fills it in.
 *
 * No-op when the user has no referral row or the id is already set. Burn-once
 * safe: skips when that GitHub identity already backs another referral (the
 * NOT EXISTS guard avoids tripping the UNIQUE constraint).
 */
export async function linkReferralV2GithubId(params: {
  referredId: string
  githubUserId: string
  conn?: DbConn
}): Promise<void> {
  const { referredId, githubUserId, conn = db } = params
  await conn
    .update(schema.referralV2)
    .set({ referred_github_user_id: githubUserId })
    .where(
      and(
        eq(schema.referralV2.referred_id, referredId),
        isNull(schema.referralV2.referred_github_user_id),
        sql`NOT EXISTS (SELECT 1 FROM referral_v2 e WHERE e.referred_github_user_id = ${githubUserId})`,
      ),
    )
}
