import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq } from 'drizzle-orm'

import type { FreebuffAccessTier } from '@codebuff/common/constants/freebuff-models'
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
 * Returns true iff this call created the row.
 */
export async function recordReferralV2Attribution(params: {
  referrerId: string
  referredId: string
  now?: Date
  conn?: DbConn
}): Promise<boolean> {
  const { referrerId, referredId, now = new Date(), conn = db } = params

  // Never self-refer. (Identity-level self-referral — the referrer's *other*
  // linked GitHub — is screened upstream at redemption; this is the cheap
  // same-user guard.)
  if (referrerId === referredId) return false

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
