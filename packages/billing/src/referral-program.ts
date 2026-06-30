import {
  FREEBUFF_WEB_REFERRAL_LIMIT,
  isGithubAccountOldEnoughForReferral,
  MIN_GITHUB_ACCOUNT_AGE_MONTHS,
  MIN_GITHUB_ACCOUNT_AGE_MONTHS_GLM,
} from '@codebuff/common/constants/freebuff-referral-tiers'
import {
  FREEBUFF_GLM_V52_REFERRAL_CAP,
  FREEBUFF_GLM_V52_REFERRAL_ENABLED,
} from '@codebuff/common/constants/freebuff-models'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { getFreebuffUsageDateKey } from '@codebuff/common/util/freebuff-streak'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, count, desc, eq, sql } from 'drizzle-orm'

import {
  getReferralQualification,
  tryConsumeGlmReferralBonus,
  tryConsumeReferralBonus,
} from './referral-qualification'
import { getReferralStats } from './referral-stats'

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

/**
 * Which referral program a `referral` row belongs to. Both programs share the
 * same token (`user.referral_code`), redemption flow, and burn-once ledger,
 * but have different qualification bars — so completions are scored per
 * program and never cross-pollinate perks:
 *
 * - 'cli': GitHub bright line (12-month account + 6-month repo) + full-access
 *   activation. Perks: daily Opus allowance.
 * - 'web': Freebuff Web — GitHub account age only (see
 *   MIN_GITHUB_ACCOUNT_AGE_MONTHS in common). Perks: tiered daily model
 *   limits + watermark removal.
 * - 'glm': Freebuff CLI GLM 5.2 reward — GitHub account age only, but with the
 *   stricter MIN_GITHUB_ACCOUNT_AGE_MONTHS_GLM bar. Perks: one 1-hour GLM 5.2
 *   session per week per qualified referral (capped at
 *   FREEBUFF_GLM_V52_REFERRAL_CAP).
 */
export type ReferralProgram = 'cli' | 'web' | 'glm'

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
  program?: ReferralProgram
  now?: Date
}): Promise<RedeemReferralResult> {
  const {
    userId,
    referralCode,
    logger,
    program = 'cli',
    now = new Date(),
  } = params

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
    // One referrer per user, per program. Scoped to `program` so a user can
    // hold (at most) one referral in each program — e.g. a 'web' tier referral
    // and a 'glm' referral from the same freebuff.com link.
    db
      .select({ referrerId: schema.referral.referrer_id })
      .from(schema.referral)
      .where(
        and(
          eq(schema.referral.referred_id, userId),
          eq(schema.referral.program, program),
        ),
      )
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
    // No A-refers-B then B-refers-A loops within the same program.
    db
      .select({ referrerId: schema.referral.referrer_id })
      .from(schema.referral)
      .where(
        and(
          eq(schema.referral.referrer_id, userId),
          eq(schema.referral.referred_id, referrer.id),
          eq(schema.referral.program, program),
        ),
      )
      .limit(1),
    // Referral limit counts every attributed signup (pending + completed) so
    // a referrer can't bank unlimited pendings. Counted per program so each
    // program's cap is independent: CLI uses the per-user referral_limit
    // column, web uses the fixed cap sized for its deeper tier ladder.
    db
      .select({ n: count() })
      .from(schema.referral)
      .where(
        and(
          eq(schema.referral.referrer_id, referrer.id),
          eq(schema.referral.program, program),
        ),
      ),
  ])
  if (reverse) return { ok: false, error: 'reverse_referral' }
  // CLI uses the per-user referral_limit column (default 5). Web and GLM have
  // their own headroom: web tops out at 7 qualified, GLM at
  // FREEBUFF_GLM_V52_REFERRAL_CAP (10), so both need a signup cap above their
  // qualified ceiling to leave room for unqualified signups.
  const referralLimit =
    program === 'cli'
      ? referrer.referralLimit
      : program === 'glm'
        ? FREEBUFF_GLM_V52_REFERRAL_CAP * 2
        : FREEBUFF_WEB_REFERRAL_LIMIT
  if (referrerCount >= referralLimit) {
    return { ok: false, error: 'referrer_limit_reached' }
  }

  // credits=0: v2 never mints credits (grant-credits throws on type='referral').
  // onConflictDoNothing guards the (referrer_id, referred_id, program) PK
  // against racing double-submits. `returning` tells us whether THIS call
  // actually created the row, so the redeemed event fires once per real
  // redemption (the cookie re-runs redeem on every web token refresh).
  const inserted = await db
    .insert(schema.referral)
    .values({
      referrer_id: referrer.id,
      referred_id: userId,
      status: 'pending',
      credits: 0,
      is_legacy: false,
      program,
      created_at: now,
    })
    .onConflictDoNothing()
    .returning({ referredId: schema.referral.referred_id })

  if (inserted.length > 0) {
    logger.info(
      {
        eventId: AnalyticsEvent.FREEBUFF_REFERRAL_REDEEMED,
        userId,
        referrerId: referrer.id,
        program,
      },
      'Referral code redeemed; referral pending qualification',
    )
  }
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
 *
 * Only the `completed` transition emits a lifecycle event (low volume). The
 * "why still pending" breakdown is NOT emitted per-evaluation — that would fire
 * on every live trigger (web token refresh, ≤10 min) and dominate ingest;
 * instead the sweep aggregates outcomes across the whole pending population once
 * per run (see evaluatePendingReferrals).
 */
export async function evaluateReferralForReferredUser(params: {
  userId: string
  logger: Logger
  now?: Date
  fetchFn?: typeof fetch
  cacheOnly?: boolean
}): Promise<ReferralEvaluation> {
  const { userId, logger, now = new Date(), fetchFn, cacheOnly } = params

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
        eq(schema.referral.program, 'cli'),
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
    cacheOnly,
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
        eq(schema.referral.program, 'cli'),
      ),
    )

  logger.info(
    {
      eventId: AnalyticsEvent.FREEBUFF_REFERRAL_COMPLETED,
      program: 'cli',
      userId,
      referrerId: pending.referrerId,
    },
    'Referral completed: referred user passed qualification + activation',
  )
  return { outcome: 'completed', referrerId: pending.referrerId }
}

/**
 * Shared evaluator for the account-age-only programs ('web' and 'glm'): both
 * complete a pending referral when the referred user's GitHub account is old
 * enough (no repo / activation requirement, unlike 'cli'). They differ only in
 * the age bar and which burn-once ledger they consume, passed in by the thin
 * wrappers below. Idempotent and cheap to re-run: completed referrals return
 * no_pending_referral and the GitHub facts are cached; a too-new account stays
 * pending and ages in on a later evaluation.
 */
async function evaluateAccountAgeReferral(params: {
  userId: string
  logger: Logger
  program: 'web' | 'glm'
  minAccountAgeMonths: number
  consumeBonus: (args: {
    githubUserId: string
    consumedByUserId: string
    now: Date
  }) => Promise<boolean>
  now?: Date
  fetchFn?: typeof fetch
  cacheOnly?: boolean
}): Promise<ReferralEvaluation> {
  const {
    userId,
    logger,
    program,
    minAccountAgeMonths,
    consumeBonus,
    now = new Date(),
    fetchFn,
    cacheOnly,
  } = params

  const [pending] = await db
    .select({ referrerId: schema.referral.referrer_id })
    .from(schema.referral)
    .where(
      and(
        eq(schema.referral.referred_id, userId),
        eq(schema.referral.status, 'pending'),
        eq(schema.referral.program, program),
      ),
    )
    .limit(1)
  if (!pending) return { outcome: 'no_pending_referral' }

  // Reuse the shared GitHub facts cache; only the policy applied differs.
  const qualification = await getReferralQualification({
    userId,
    logger,
    now,
    fetchFn,
    cacheOnly,
  })
  if (!qualification.githubUserId) {
    return {
      outcome: 'not_qualified',
      reason: qualification.reason ?? 'no_github_account',
    }
  }
  if (
    !isGithubAccountOldEnoughForReferral(
      qualification.accountCreatedAt?.getTime(),
      now.getTime(),
      minAccountAgeMonths,
    )
  ) {
    return { outcome: 'not_qualified', reason: 'account_too_new' }
  }

  const burned = await consumeBonus({
    githubUserId: qualification.githubUserId,
    consumedByUserId: userId,
    now,
  })
  if (!burned) {
    logger.warn(
      { userId, program, githubUserId: qualification.githubUserId },
      'Referral gate passed but GitHub identity already consumed this bonus',
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
        eq(schema.referral.program, program),
      ),
    )

  logger.info(
    {
      eventId: AnalyticsEvent.FREEBUFF_REFERRAL_COMPLETED,
      program,
      userId,
      referrerId: pending.referrerId,
    },
    'Referral completed: referred GitHub account met the age requirement',
  )
  return { outcome: 'completed', referrerId: pending.referrerId }
}

/**
 * Freebuff Web referral: GitHub account at least MIN_GITHUB_ACCOUNT_AGE_MONTHS
 * old + the shared burn-once ledger (web perks cost less than CLI Opus access).
 */
export function evaluateWebReferralForReferredUser(params: {
  userId: string
  logger: Logger
  now?: Date
  fetchFn?: typeof fetch
  cacheOnly?: boolean
}): Promise<ReferralEvaluation> {
  return evaluateAccountAgeReferral({
    ...params,
    program: 'web',
    minAccountAgeMonths: MIN_GITHUB_ACCOUNT_AGE_MONTHS,
    // Shared burn-once across BOTH legacy programs: one GitHub identity, one
    // bonus, ever.
    consumeBonus: ({ githubUserId, consumedByUserId, now }) =>
      tryConsumeReferralBonus({
        githubUserId,
        consumedByUserId,
        requireBrightLine: false,
        now,
      }),
  })
}

/**
 * GLM referral: the stricter MIN_GITHUB_ACCOUNT_AGE_MONTHS_GLM age bar + GLM's
 * own burn-once ledger, independent of any web/cli bonus the same GitHub
 * identity may already hold.
 */
export function evaluateGlmReferralForReferredUser(params: {
  userId: string
  logger: Logger
  now?: Date
  fetchFn?: typeof fetch
  cacheOnly?: boolean
}): Promise<ReferralEvaluation> {
  return evaluateAccountAgeReferral({
    ...params,
    program: 'glm',
    minAccountAgeMonths: MIN_GITHUB_ACCOUNT_AGE_MONTHS_GLM,
    consumeBonus: tryConsumeGlmReferralBonus,
  })
}

/**
 * The referrer's GLM session entitlement: the number of 1-hour GLM 5.2 sessions
 * they may start per (Pacific) week, capped at FREEBUFF_GLM_V52_REFERRAL_CAP —
 * read live by the free-session quota.
 *
 * Phase 4 of the unified-referral migration (docs/referrals.md): the source of
 * truth is the new model's full-access referral count
 * (`getReferralStats().fullQualified`). The Phase-3 grandfather (MAX with the
 * legacy glm score) is dropped: the legacy 'glm' path completed on GitHub
 * account age ALONE, with no product-use requirement, so a friend who signed up
 * but never used a product still earned GLM. We now require **activation** —
 * the referred user must actually use a product, which is exactly what
 * `fullQualified` (activated_at IS NOT NULL, full tier) encodes. This makes the
 * "your friend must use the product" UI copy truthful and closes the
 * signup-only farming path.
 */
export async function getGlmReferralEntitlement(params: {
  userId: string
}): Promise<number> {
  // Kill-switch: while the program is wound down nobody earns GLM sessions,
  // and we skip the queries entirely.
  if (!FREEBUFF_GLM_V52_REFERRAL_ENABLED) return 0
  const stats = await getReferralStats({ referrerId: params.userId })
  return Math.min(stats.fullQualified, FREEBUFF_GLM_V52_REFERRAL_CAP)
}

/**
 * The referrer's Freebuff Web tier score (docs/referrals.md). Phase 4: reads the
 * unified model — every qualified-and-activated referral, full or limited
 * (`fullQualified + limitedQualified`; the web tier counts both). Like GLM, this
 * **requires activation**: the legacy 'web' path completed on GitHub account age
 * alone (no product use), so it is no longer read — a referral counts toward the
 * web tier only once the referred user actually uses a product. This makes the
 * tier copy truthful and matches the unified design.
 */
export async function getWebReferralScore(params: {
  userId: string
}): Promise<number> {
  const stats = await getReferralStats({ referrerId: params.userId })
  return stats.fullQualified + stats.limitedQualified
}

/** A pending-referral evaluator, keyed by the program it completes. */
export type ReferralEvaluator = (params: {
  userId: string
  logger: Logger
  now?: Date
  fetchFn?: typeof fetch
  cacheOnly?: boolean
}) => Promise<ReferralEvaluation>

/**
 * Dispatch table: which evaluator completes a pending row of each program.
 * The sweep uses this so every program gets a backstop — historically it only
 * swept 'cli', so 'web' and 'glm' pending rows that missed their live trigger
 * (web token refresh / first freebuff message of the day) had no catch-up and
 * stayed pending forever, even after the referred GitHub account aged past the
 * program's bar.
 */
export const REFERRAL_PROGRAM_EVALUATORS: Record<
  ReferralProgram,
  ReferralEvaluator
> = {
  cli: evaluateReferralForReferredUser,
  web: evaluateWebReferralForReferredUser,
  glm: evaluateGlmReferralForReferredUser,
}

/** All referral programs, in sweep order. */
export const ALL_REFERRAL_PROGRAMS: ReferralProgram[] = ['cli', 'web', 'glm']

export interface ReferralSweepResult {
  evaluated: number
  completed: number
  /** Per-program tallies, so a cron run can be read at a glance. */
  byProgram: Record<string, { evaluated: number; completed: number }>
  /**
   * Per-program outcome histogram for THIS run, keyed by outcome
   * (`not_qualified` is split by reason, e.g. `not_qualified:account_too_new`).
   * This is the "why is everything pending" breakdown: because the sweep visits
   * the whole pending population every run, one aggregate snapshot replaces a
   * per-evaluation event (which would fire on every live trigger and dominate
   * ingest). Emitted on the sweep summary event.
   */
  outcomes: Record<string, Record<string, number>>
}

/** Histogram key for an evaluation outcome; not_qualified keeps its reason. */
function outcomeKey(evaluation: ReferralEvaluation): string {
  return evaluation.outcome === 'not_qualified'
    ? `not_qualified:${evaluation.reason}`
    : evaluation.outcome
}

/** The referred-user ids with a pending row in `program`, oldest first. */
async function fetchPendingReferredIds(
  program: ReferralProgram,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .select({ referredId: schema.referral.referred_id })
    .from(schema.referral)
    .where(
      and(
        eq(schema.referral.status, 'pending'),
        eq(schema.referral.program, program),
      ),
    )
    .orderBy(schema.referral.created_at)
    .limit(limit)
  return rows.map((r) => r.referredId)
}

/**
 * Batch sweep over pending referrals, oldest first, across every program. For
 * a cron. Each referred user is evaluated with their program's own evaluator;
 * failures are logged and skipped so one bad row never stalls the run. This is
 * the only catch-up path for referrals whose live trigger was missed (or whose
 * referred GitHub account only ages past the bar later), so it must cover all
 * programs — not just 'cli'.
 *
 * `fetchPending` and `evaluators` are injectable so the orchestration is
 * unit-testable without a database (see docs/testing.md: DI over mocking).
 */
export async function evaluatePendingReferrals(params: {
  logger: Logger
  programs?: ReferralProgram[]
  /** Max rows to evaluate per program per run. */
  limit?: number
  now?: Date
  fetchFn?: typeof fetch
  /**
   * Pure-cache mode: evaluators re-derive qualification from cached GitHub
   * facts only, never calling GitHub. Deterministic aging-in still completes;
   * this is what the periodic sweep uses so it can re-check the whole pending
   * population in one fast, network-free pass instead of timing out on hundreds
   * of GitHub round-trips.
   */
  cacheOnly?: boolean
  fetchPending?: (
    program: ReferralProgram,
    limit: number,
  ) => Promise<string[]>
  evaluators?: Record<ReferralProgram, ReferralEvaluator>
}): Promise<ReferralSweepResult> {
  const {
    logger,
    programs = ALL_REFERRAL_PROGRAMS,
    limit = 100,
    now = new Date(),
    fetchFn,
    cacheOnly,
    fetchPending = fetchPendingReferredIds,
    evaluators = REFERRAL_PROGRAM_EVALUATORS,
  } = params

  const result: ReferralSweepResult = {
    evaluated: 0,
    completed: 0,
    byProgram: {},
    outcomes: {},
  }

  for (const program of programs) {
    const evaluate = evaluators[program]
    const referredIds = await fetchPending(program, limit)
    let completed = 0
    const outcomes: Record<string, number> = {}

    for (const referredId of referredIds) {
      try {
        const evaluation = await evaluate({
          userId: referredId,
          logger,
          now,
          fetchFn,
          cacheOnly,
        })
        const key = outcomeKey(evaluation)
        outcomes[key] = (outcomes[key] ?? 0) + 1
        if (evaluation.outcome === 'completed') completed++
      } catch (error) {
        logger.error(
          { error, referredId, program },
          'Failed to evaluate pending referral; skipping',
        )
      }
    }

    result.byProgram[program] = { evaluated: referredIds.length, completed }
    result.outcomes[program] = outcomes
    result.evaluated += referredIds.length
    result.completed += completed

    // A full page means the backlog for this program exceeds one run's limit —
    // the sweep isn't keeping up. Surface it so the limit/cadence can be tuned.
    if (referredIds.length >= limit) {
      logger.warn(
        { program, evaluated: referredIds.length, limit },
        'Referral sweep hit its per-program limit; pending backlog may exceed one run',
      )
    }
  }

  // One aggregate event per run carries the full pending-reason breakdown for
  // the whole population — far cheaper than a per-evaluation event, and more
  // complete (covers inactive users a live trigger would never re-evaluate).
  logger.info(
    {
      eventId: AnalyticsEvent.FREEBUFF_REFERRAL_SWEEP,
      evaluated: result.evaluated,
      completed: result.completed,
      byProgram: result.byProgram,
      outcomes: result.outcomes,
    },
    'Pending-referral sweep complete',
  )
  return result
}

/**
 * The referral score: completed (v2-qualified) referrals you made, plus 1 if
 * you were yourself referred and your own referral completed. Downstream
 * perks (e.g. daily Opus allowance, Freebuff Web tier) are sized from this
 * number at read time — no credits, no stored balance, nothing to claw back
 * if a referral is later revoked (revocation = clearing qualified_at).
 *
 * Scored per program: each program's perks only count referrals qualified
 * under that program's own bar.
 */
export async function getReferralScore(params: {
  userId: string
  program?: ReferralProgram
}): Promise<number> {
  const { userId, program = 'cli' } = params

  const [row] = await db
    .select({
      referredCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${schema.referral}
        WHERE ${schema.referral.referrer_id} = ${userId}
          AND ${schema.referral.program} = ${program}
          AND ${schema.referral.qualified_at} IS NOT NULL
      )`,
      wasReferred: sql<boolean>`EXISTS (
        SELECT 1 FROM ${schema.referral}
        WHERE ${schema.referral.referred_id} = ${userId}
          AND ${schema.referral.program} = ${program}
          AND ${schema.referral.qualified_at} IS NOT NULL
      )`,
    })
    .from(sql`(SELECT 1) AS one`)

  return (row?.referredCount ?? 0) + (row?.wasReferred ? 1 : 0)
}
