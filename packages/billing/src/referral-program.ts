import { getFreebuffUsageDateKey } from '@codebuff/common/util/freebuff-streak'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, count, desc, eq, sql } from 'drizzle-orm'

import {
  getReferralQualification,
  tryConsumeReferralBonus,
} from './referral-qualification'

import type { Logger } from '@codebuff/common/types/contracts/logger'

/**
 * Referral program v2.
 *
 * Flow: a user shares their referral link; a new user signs up and redeems the
 * code, creating a PENDING `referral` row. The referral completes (and only
 * then counts for anyone) once the referred user passes the full gate:
 *
 *   1. GitHub bright line (see referral-qualification.ts) — aged account with
 *      an old public repo, burn-once per GitHub identity, AND
 *   2. Full-access activation — sent at least one freebuff message on a day
 *      they were admitted at access tier 'full' (approved country, no
 *      VPN/proxy/datacenter IP).
 *
 * The program's output is the *referral score*: the number of completed
 * referrals you made, plus 1 if you yourself were referred and completed.
 * Downstream perks (e.g. daily Opus allowance) are sized from that number.
 *
 * Deliberately NOT granted: credits. The old referral program was removed for
 * credit-farm abuse and grant-credits.ts hard-throws on `type='referral'`.
 * This program never mints credits; rewards are model-access perks derived
 * from the score at read time.
 *
 * Old-program rows in the `referral` table are distinguished by
 * `qualified_at IS NULL` — only v2 completions set it, and the score counts
 * only rows where it is set.
 */

/** Only signups this recent can be attributed to a referral code. */
export const REFERRAL_SIGNUP_WINDOW_DAYS = 30

export type RedeemReferralError =
  | 'invalid_code'
  | 'self_referral'
  | 'already_referred'
  | 'reverse_referral'
  | 'referrer_limit_reached'
  | 'signup_too_old'
  | 'user_not_found'
  | 'user_banned'

export type RedeemReferralResult =
  | { ok: true; referrerId: string }
  | { ok: false; error: RedeemReferralError }

/** User-facing messages for each redemption error. */
export const REDEEM_REFERRAL_ERROR_MESSAGES: Record<
  RedeemReferralError,
  string
> = {
  invalid_code: "This referral code doesn't exist.",
  self_referral: "You can't use your own referral code.",
  already_referred:
    "You've already been referred by someone. Each user can only be referred once.",
  reverse_referral:
    'You referred this user already, so they can’t refer you back.',
  referrer_limit_reached:
    'This user has reached their referral limit. Ask them for a fresh link later!',
  signup_too_old: `Referral codes can only be redeemed within the first ${REFERRAL_SIGNUP_WINDOW_DAYS} days after signing up.`,
  user_not_found: 'User not found.',
  user_banned: 'This account is not eligible for referrals.',
}

/**
 * HTTP status for each redemption error. Lives next to the error taxonomy so
 * every surface (web route, future CLI/SDK endpoints) maps errors identically.
 */
export const REDEEM_REFERRAL_ERROR_STATUS: Record<RedeemReferralError, number> =
  {
    invalid_code: 404,
    self_referral: 400,
    already_referred: 409,
    reverse_referral: 409,
    referrer_limit_reached: 400,
    signup_too_old: 400,
    user_not_found: 404,
    user_banned: 403,
  }

/**
 * Redeem a referral code for a (recently signed up) user, creating a PENDING
 * referral row. No rewards are granted here — the referral only counts once
 * the referred user passes the qualification gate (see
 * evaluateReferralForReferredUser).
 */
export async function redeemReferralCode(params: {
  userId: string
  referralCode: string
  logger: Logger
  now?: Date
}): Promise<RedeemReferralResult> {
  const { userId, referralCode, logger, now = new Date() } = params

  // The first three lookups are independent of each other; run them together.
  const [[referrer], [referred], [alreadyReferred]] = await Promise.all([
    db
      .select({
        id: schema.user.id,
        referralLimit: schema.user.referral_limit,
        banned: schema.user.banned,
      })
      .from(schema.user)
      .where(eq(schema.user.referral_code, referralCode))
      .limit(1),
    db
      .select({
        id: schema.user.id,
        createdAt: schema.user.created_at,
        banned: schema.user.banned,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1),
    // One referrer per user, ever.
    db
      .select({ referrerId: schema.referral.referrer_id })
      .from(schema.referral)
      .where(eq(schema.referral.referred_id, userId))
      .limit(1),
  ])

  if (!referrer) return { ok: false, error: 'invalid_code' }
  if (referrer.id === userId) return { ok: false, error: 'self_referral' }
  if (referrer.banned) return { ok: false, error: 'user_banned' }
  if (!referred) return { ok: false, error: 'user_not_found' }
  if (referred.banned) return { ok: false, error: 'user_banned' }

  const signupCutoff = new Date(
    now.getTime() - REFERRAL_SIGNUP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  )
  if (referred.createdAt < signupCutoff) {
    return { ok: false, error: 'signup_too_old' }
  }
  if (alreadyReferred) return { ok: false, error: 'already_referred' }

  // These two need referrer.id; run them together.
  const [[reverse], [{ n: referrerCount }]] = await Promise.all([
    // No A-refers-B then B-refers-A loops.
    db
      .select({ referrerId: schema.referral.referrer_id })
      .from(schema.referral)
      .where(
        and(
          eq(schema.referral.referrer_id, userId),
          eq(schema.referral.referred_id, referrer.id),
        ),
      )
      .limit(1),
    // Referral limit counts every attributed signup (pending + completed) so a
    // referrer can't bank unlimited pendings.
    db
      .select({ n: count() })
      .from(schema.referral)
      .where(eq(schema.referral.referrer_id, referrer.id)),
  ])
  if (reverse) return { ok: false, error: 'reverse_referral' }
  if (referrerCount >= referrer.referralLimit) {
    return { ok: false, error: 'referrer_limit_reached' }
  }

  // credits=0: v2 never mints credits (grant-credits throws on type='referral').
  // onConflictDoNothing guards the (referrer_id, referred_id) PK against racing
  // double-submits.
  await db
    .insert(schema.referral)
    .values({
      referrer_id: referrer.id,
      referred_id: userId,
      status: 'pending',
      credits: 0,
      is_legacy: false,
      created_at: now,
    })
    .onConflictDoNothing()

  logger.info(
    { userId, referrerId: referrer.id },
    'Referral code redeemed; referral pending qualification',
  )
  return { ok: true, referrerId: referrer.id }
}

/**
 * Pure day-intersection: did any full-access admit happen on a day the user
 * also sent a message? Both sides are converted to the canonical freebuff
 * usage-date key (America/Los_Angeles) so this exactly matches how
 * freebuff_daily_usage rows are written.
 */
export function hasUsageOnFullAccessDay(params: {
  fullAccessAdmitTimes: Date[]
  usageDateKeys: string[]
}): boolean {
  const { fullAccessAdmitTimes, usageDateKeys } = params
  if (fullAccessAdmitTimes.length === 0 || usageDateKeys.length === 0) {
    return false
  }
  const usageDays = new Set(usageDateKeys)
  return fullAccessAdmitTimes.some((t) =>
    usageDays.has(getFreebuffUsageDateKey(t)),
  )
}

/**
 * Activation check: the user was admitted to a free session at access tier
 * 'full' (approved country, no VPN/proxy — the tier already encodes the
 * country gate + IP privacy decision) AND sent at least one message that same
 * day. Both source tables are durable history (free_session_admit is an
 * append-only admission log; freebuff_daily_usage is written per usage day),
 * unlike free_session rows which are deleted at session end.
 */
/**
 * Both reads are bounded to the most recent year's worth of rows: any genuine
 * activation has a same-day admit + usage pair well inside that window, and
 * the cap keeps the check O(1) as accounts age.
 */
const ACTIVATION_LOOKBACK_ROWS = 366

export async function hasFullAccessActivation(params: {
  userId: string
}): Promise<boolean> {
  const { userId } = params

  const admits = await db
    .select({ admittedAt: schema.freeSessionAdmit.admitted_at })
    .from(schema.freeSessionAdmit)
    .where(
      and(
        eq(schema.freeSessionAdmit.user_id, userId),
        eq(schema.freeSessionAdmit.access_tier, 'full'),
      ),
    )
    .orderBy(desc(schema.freeSessionAdmit.admitted_at))
    .limit(ACTIVATION_LOOKBACK_ROWS)
  if (admits.length === 0) return false

  const usageDays = await db
    .select({ usageDate: schema.freebuffDailyUsage.usage_date })
    .from(schema.freebuffDailyUsage)
    .where(eq(schema.freebuffDailyUsage.user_id, userId))
    .orderBy(desc(schema.freebuffDailyUsage.usage_date))
    .limit(ACTIVATION_LOOKBACK_ROWS)

  return hasUsageOnFullAccessDay({
    fullAccessAdmitTimes: admits.map((a) => a.admittedAt),
    usageDateKeys: usageDays.map((u) => u.usageDate),
  })
}

export type ReferralEvaluation =
  | { outcome: 'no_pending_referral' }
  | { outcome: 'not_qualified'; reason: string }
  | { outcome: 'not_activated' }
  | { outcome: 'bonus_already_consumed' }
  | { outcome: 'completed'; referrerId: string }

/**
 * Evaluate the referred user's pending referral and complete it if the full
 * gate passes. Idempotent and cheap to re-run: a completed referral returns
 * no_pending_referral, the GitHub qualification is cached, and the activation
 * check is two indexed reads. Intended to be fired after freebuff usage is
 * recorded (the moment activation can flip) and/or from a periodic sweep.
 */
export async function evaluateReferralForReferredUser(params: {
  userId: string
  logger: Logger
  now?: Date
  fetchFn?: typeof fetch
}): Promise<ReferralEvaluation> {
  const { userId, logger, now = new Date(), fetchFn } = params

  const [pending] = await db
    .select({
      referrerId: schema.referral.referrer_id,
      status: schema.referral.status,
    })
    .from(schema.referral)
    .where(
      and(
        eq(schema.referral.referred_id, userId),
        eq(schema.referral.status, 'pending'),
      ),
    )
    .limit(1)
  if (!pending) return { outcome: 'no_pending_referral' }

  // Cheapest check first: activation needs no external API.
  const activated = await hasFullAccessActivation({ userId })
  if (!activated) return { outcome: 'not_activated' }

  const qualification = await getReferralQualification({
    userId,
    logger,
    now,
    fetchFn,
  })
  if (!qualification.qualified || !qualification.githubUserId) {
    return {
      outcome: 'not_qualified',
      reason: qualification.reason ?? 'unknown',
    }
  }

  // Burn-once: one GitHub identity can complete at most one referral, ever.
  const burned = await tryConsumeReferralBonus({
    githubUserId: qualification.githubUserId,
    consumedByUserId: userId,
    now,
  })
  if (!burned) {
    logger.warn(
      { userId, githubUserId: qualification.githubUserId },
      'Referral gate passed but GitHub identity already consumed a bonus',
    )
    return { outcome: 'bonus_already_consumed' }
  }

  await db
    .update(schema.referral)
    .set({ status: 'completed', completed_at: now, qualified_at: now })
    .where(
      and(
        eq(schema.referral.referred_id, userId),
        eq(schema.referral.status, 'pending'),
      ),
    )

  logger.info(
    { userId, referrerId: pending.referrerId },
    'Referral completed: referred user passed qualification + activation',
  )
  return { outcome: 'completed', referrerId: pending.referrerId }
}

/**
 * Batch sweep over pending referrals, oldest first. For a cron. Each referred
 * user is evaluated independently; failures are logged and skipped.
 */
export async function evaluatePendingReferrals(params: {
  logger: Logger
  limit?: number
  now?: Date
  fetchFn?: typeof fetch
}): Promise<{ evaluated: number; completed: number }> {
  const { logger, limit = 100, now = new Date(), fetchFn } = params

  const pendings = await db
    .select({ referredId: schema.referral.referred_id })
    .from(schema.referral)
    .where(eq(schema.referral.status, 'pending'))
    .orderBy(schema.referral.created_at)
    .limit(limit)

  let completed = 0
  for (const { referredId } of pendings) {
    try {
      const result = await evaluateReferralForReferredUser({
        userId: referredId,
        logger,
        now,
        fetchFn,
      })
      if (result.outcome === 'completed') completed++
    } catch (error) {
      logger.error(
        { error, referredId },
        'Failed to evaluate pending referral; skipping',
      )
    }
  }
  return { evaluated: pendings.length, completed }
}

/**
 * The referral score: completed (v2-qualified) referrals you made, plus 1 if
 * you were yourself referred and your own referral completed. Downstream
 * perks (e.g. daily Opus allowance) are sized from this number at read time —
 * no credits, no stored balance, nothing to claw back if a referral is later
 * revoked (revocation = clearing qualified_at).
 */
export async function getReferralScore(params: {
  userId: string
}): Promise<number> {
  const { userId } = params

  const [row] = await db
    .select({
      referredCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${schema.referral}
        WHERE ${schema.referral.referrer_id} = ${userId}
          AND ${schema.referral.qualified_at} IS NOT NULL
      )`,
      wasReferred: sql<boolean>`EXISTS (
        SELECT 1 FROM ${schema.referral}
        WHERE ${schema.referral.referred_id} = ${userId}
          AND ${schema.referral.qualified_at} IS NOT NULL
      )`,
    })
    .from(sql`(SELECT 1) AS one`)

  return (row?.referredCount ?? 0) + (row?.wasReferred ? 1 : 0)
}
