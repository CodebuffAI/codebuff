import { recordReferralV2Activation } from '@codebuff/billing'
import { db } from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, asc, count, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'

import { logger } from '@/util/logger'

import type { FireworksRoute } from './fireworks-health'
import type { FreebuffAccessTier } from '@codebuff/common/constants/freebuff-models'
import type {
  FreeSessionCountryAccessMetadata,
  InternalSessionRow,
} from './types'

/** Generate a cryptographically random instance id (token). */
export function newInstanceId(): string {
  return crypto.randomUUID()
}

export async function getSessionRow(
  userId: string,
): Promise<InternalSessionRow | null> {
  const row = await db.query.freeSession.findFirst({
    where: eq(schema.freeSession.user_id, userId),
  })
  return (row as InternalSessionRow | undefined) ?? null
}

/**
 * Join the queue (or take over an existing row with a new instance_id).
 *
 * Semantics:
 *   - If no row exists: insert status=queued for `model`, fresh instance_id,
 *     queued_at=now.
 *   - If row exists and active+unexpired and model matches: rotate
 *     instance_id (takeover), preserve status/admitted_at/expires_at.
 *   - If row exists and active+unexpired but the user picked a different
 *     model: reject with `model_locked` — the active session is bound to the
 *     model it was admitted with. The CLI should end the session first.
 *   - If row exists and expired: reset to queued with fresh instance_id,
 *     fresh queued_at, and the requested model — effectively re-queue at
 *     the back of the new model's queue.
 *   - If row exists and already queued: if model matches, rotate
 *     instance_id and preserve queued_at; if model differs, switch model
 *     and reset queued_at to now (move to back of the new queue).
 *
 * Never trusts client-supplied timestamps or instance ids.
 */
export class FreeSessionModelLockedError extends Error {
  constructor(public readonly currentModel: string) {
    super(
      `Active session is locked to model ${currentModel}; end the session before switching.`,
    )
    this.name = 'FreeSessionModelLockedError'
  }
}

/**
 * Desktop multi-session: a second active premium-bucket session was requested
 * while one is already running for this user. Thrown by `admitDesktopSession`
 * when the partial unique index `uniq_free_session_desktop_premium_active`
 * rejects the insert (race-safe). Carries the existing premium session's model +
 * instance id so the public API can return a `premium_slot_taken` response.
 */
export class FreeSessionPremiumSlotTakenError extends Error {
  constructor(
    public readonly currentModel: string,
    public readonly currentInstanceId: string,
  ) {
    super(
      `A premium-bucket session is already active (${currentModel}); only one is allowed per user.`,
    )
    this.name = 'FreeSessionPremiumSlotTakenError'
  }
}

function countryAccessColumns(
  countryAccess: FreeSessionCountryAccessMetadata | undefined,
) {
  if (!countryAccess) return {}
  return {
    country_code: countryAccess.countryCode,
    cf_country: countryAccess.cfCountry,
    geoip_country: countryAccess.geoipCountry,
    country_block_reason: countryAccess.blockReason,
    ip_privacy_signals: countryAccess.ipPrivacySignals,
    client_ip_hash: countryAccess.clientIpHash,
    country_checked_at: countryAccess.checkedAt,
  }
}

export async function joinOrTakeOver(params: {
  userId: string
  model: string
  accessTier: FreebuffAccessTier
  now: Date
  countryAccess?: FreeSessionCountryAccessMetadata
}): Promise<InternalSessionRow> {
  const { userId, model, accessTier, now, countryAccess } = params
  const nextInstanceId = newInstanceId()
  const countryAccessUpdate = countryAccessColumns(countryAccess)

  // postgres-js does NOT coerce raw JS Date values when they're interpolated
  // inside a `sql\`...\`` fragment (the column-type hint that Drizzle's
  // values() path relies on is absent there). Pre-serialize to an ISO string
  // and cast to timestamptz so the driver binds it as text.
  const nowIso = sql`${now.toISOString()}::timestamptz`
  // Single UPSERT that encodes every case in one round-trip, race-safe
  // against concurrent POSTs for the same user (the PK would otherwise turn
  // two parallel INSERTs into a 500). Inside ON CONFLICT DO UPDATE, bare
  // column references resolve to the existing row.
  //
  // Decision table (pre-update state → post-update state):
  //   no row                     → INSERT: status=queued, queued_at=now,
  //                                model=$model
  //   active & expires_at > now  →
  //     same model: rotate instance_id only (takeover)
  //     diff model: throw FreeSessionModelLockedError post-fetch (we can't
  //       easily express the reject-without-update branch in a single UPSERT;
  //       see below)
  //   queued, same model         → rotate instance_id, preserve queued_at
  //   queued, diff model         → switch model, reset queued_at=now
  //                                (move to back of new queue)
  //   active & expired           → re-queue at back: status=queued,
  //                                queued_at=now, model=$model,
  //                                admitted_at/expires_at=null
  const activeUnexpired = sql`${schema.freeSession.status} = 'active' AND ${schema.freeSession.expires_at} > ${nowIso}`
  const sameModel = sql`${schema.freeSession.model} = ${model}`

  const [row] = await db
    .insert(schema.freeSession)
    .values({
      user_id: userId,
      status: 'queued',
      active_instance_id: nextInstanceId,
      model,
      access_tier: accessTier,
      ...countryAccessUpdate,
      queued_at: now,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.freeSession.user_id,
      set: {
        // For active+unexpired rows the instance_id only rotates if the model
        // matches; otherwise we keep the existing id so the active session
        // stays valid for the other CLI/tab. We then detect the mismatch
        // post-update and throw, so the caller can return a clean error.
        active_instance_id: sql`CASE
          WHEN ${activeUnexpired} AND NOT (${sameModel}) THEN ${schema.freeSession.active_instance_id}
          ELSE ${nextInstanceId}
        END`,
        ...countryAccessUpdate,
        updated_at: now,
        status: sql`CASE WHEN ${activeUnexpired} THEN 'active'::free_session_status ELSE 'queued'::free_session_status END`,
        // Keep model when active+unexpired (locked); switch otherwise.
        model: sql`CASE
          WHEN ${activeUnexpired} THEN ${schema.freeSession.model}
          ELSE ${model}
        END`,
        access_tier: sql`CASE
          WHEN ${activeUnexpired} THEN ${schema.freeSession.access_tier}
          ELSE ${accessTier}::freebuff_access_tier
        END`,
        queued_at: sql`CASE
          WHEN ${activeUnexpired} THEN ${schema.freeSession.queued_at}
          WHEN ${schema.freeSession.status} = 'queued' AND ${sameModel} THEN ${schema.freeSession.queued_at}
          ELSE ${nowIso}
        END`,
        admitted_at: sql`CASE WHEN ${activeUnexpired} THEN ${schema.freeSession.admitted_at} ELSE NULL END`,
        expires_at: sql`CASE WHEN ${activeUnexpired} THEN ${schema.freeSession.expires_at} ELSE NULL END`,
      },
    })
    .returning()

  if (!row) {
    throw new Error(`joinOrTakeOver returned no row for user=${userId}`)
  }

  // Active sessions are locked to their original model — surface a typed
  // error so the public API can translate it into a structured response.
  if (row.status === 'active' && row.model !== model) {
    throw new FreeSessionModelLockedError(row.model)
  }

  return row as InternalSessionRow
}

export function getRoundedSessionUnits(params: {
  admittedAt: Date | null
  now: Date
  sessionLengthMs: number
}): number {
  const { admittedAt, now, sessionLengthMs } = params
  if (!admittedAt || sessionLengthMs <= 0) return 0
  const usedMs = Math.max(
    0,
    Math.min(sessionLengthMs, now.getTime() - admittedAt.getTime()),
  )
  return Math.ceil((usedMs / sessionLengthMs) * 10) / 10
}

type FreeSessionTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Stamp the final charged session units onto the user's most recent admit for
 * this row's (model, access_tier) — but only while the session is still
 * active+unexpired (an already-expired/swept row was billed at admit time).
 * Shared by `endSession` (free_session) and `endDesktopSession`
 * (free_session_desktop), which carry the same admit-accounting columns.
 */
async function finalizeLatestAdmit(
  tx: FreeSessionTx,
  row: {
    status: 'queued' | 'active'
    admitted_at: Date | null
    expires_at: Date | null
    model: string
    access_tier: FreebuffAccessTier | null
  },
  userId: string,
  now: Date,
  sessionLengthMs: number,
): Promise<void> {
  if (
    row.status !== 'active' ||
    !row.admitted_at ||
    !row.expires_at ||
    row.expires_at.getTime() <= now.getTime()
  ) {
    return
  }
  const sessionUnits = getRoundedSessionUnits({
    admittedAt: row.admitted_at,
    now,
    sessionLengthMs,
  }).toFixed(1)

  const [latestAdmit] = await tx
    .select({ id: schema.freeSessionAdmit.id })
    .from(schema.freeSessionAdmit)
    .where(
      and(
        eq(schema.freeSessionAdmit.user_id, userId),
        eq(schema.freeSessionAdmit.model, row.model),
        eq(schema.freeSessionAdmit.access_tier, row.access_tier ?? 'full'),
      ),
    )
    .orderBy(desc(schema.freeSessionAdmit.admitted_at))
    .limit(1)

  if (latestAdmit) {
    await tx
      .update(schema.freeSessionAdmit)
      .set({ session_units: sessionUnits })
      .where(eq(schema.freeSessionAdmit.id, latestAdmit.id))
  }
}

export async function endSession(params: {
  userId: string
  now: Date
  sessionLengthMs: number
}): Promise<void> {
  const { userId, now, sessionLengthMs } = params
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.freeSession)
      .where(eq(schema.freeSession.user_id, userId))
      .for('update')
      .limit(1)

    if (row) await finalizeLatestAdmit(tx, row, userId, now, sessionLengthMs)

    await tx
      .delete(schema.freeSession)
      .where(eq(schema.freeSession.user_id, userId))
  })
}

/**
 * Count sessions currently in `active` status that share one hashed egress IP.
 * Powers the log-only per-IP concurrency instrumentation in `requestSession`:
 * a residential / CGNAT IP holds a handful of concurrent sessions, a
 * registration farm holds hundreds. There is no index on `client_ip_hash` yet —
 * `free_session` is one row per user and bounded by live concurrency, so this
 * filtered count is cheap; add a partial index (`WHERE status='active'`) when
 * this graduates from log-only to enforcement.
 */
export async function countActiveSessionsForIpHash(
  clientIpHash: string,
): Promise<number> {
  // Sum across both session tables: a single egress IP may carry CLI/web rows
  // (free_session) and desktop multi-session rows (free_session_desktop). Once
  // desktop ships, the "one row per user" assumption no longer holds for the
  // desktop table, so the per-IP count must include it or it under-reports.
  const [cli, desktop] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.freeSession)
      .where(
        and(
          eq(schema.freeSession.status, 'active'),
          eq(schema.freeSession.client_ip_hash, clientIpHash),
        ),
      ),
    db
      .select({ n: count() })
      .from(schema.freeSessionDesktop)
      .where(
        and(
          eq(schema.freeSessionDesktop.status, 'active'),
          eq(schema.freeSessionDesktop.client_ip_hash, clientIpHash),
        ),
      ),
  ])
  return Number(cli[0]?.n ?? 0) + Number(desktop[0]?.n ?? 0)
}

/**
 * Remove rows whose active session has expired past the drain grace window.
 * Rows whose `expires_at` is in the past but still inside `expires_at + grace`
 * are kept so an in-flight agent run can finish. Safe to call repeatedly.
 */
export async function sweepExpired(
  now: Date,
  graceMs: number,
): Promise<number> {
  const cutoff = new Date(now.getTime() - graceMs)
  const [deleted, deletedDesktop] = await Promise.all([
    db
      .delete(schema.freeSession)
      .where(
        and(
          eq(schema.freeSession.status, 'active'),
          lt(schema.freeSession.expires_at, cutoff),
        ),
      )
      .returning({ user_id: schema.freeSession.user_id }),
    db
      .delete(schema.freeSessionDesktop)
      .where(
        and(
          eq(schema.freeSessionDesktop.status, 'active'),
          lt(schema.freeSessionDesktop.expires_at, cutoff),
        ),
      )
      .returning({ user_id: schema.freeSessionDesktop.user_id }),
  ])
  return deleted.length + deletedDesktop.length
}

/**
 * Promote a specific queued user to active. Used by the instant-admit path
 * in `requestSession` when the model's active-session count is below its
 * configured capacity — skips the FIFO advisory-lock dance because each
 * call targets a distinct (user_id, model) and the UPDATE is a no-op if
 * the row isn't queued any more.
 *
 * Returns the updated row or null if the row was not in the expected
 * (queued, same-model) state.
 */
export async function promoteQueuedUser(params: {
  userId: string
  model: string
  sessionLengthMs: number
  now: Date
  /** Sticky upstream pin for the admitted session (see `routeForAdmission`).
   *  Decided from the deployment's health at admission and frozen for the
   *  session's life; null for models with no serverless backup. */
  fireworksRoute?: FireworksRoute | null
}): Promise<InternalSessionRow | null> {
  const { userId, model, sessionLengthMs, now, fireworksRoute } = params
  const expiresAt = new Date(now.getTime() + sessionLengthMs)
  const session = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.freeSession)
      .set({
        status: 'active',
        admitted_at: now,
        expires_at: expiresAt,
        fireworks_route: fireworksRoute ?? null,
        updated_at: now,
      })
      .where(
        and(
          eq(schema.freeSession.user_id, userId),
          eq(schema.freeSession.status, 'queued'),
          eq(schema.freeSession.model, model),
        ),
      )
      .returning()
    if (!row) return null
    await tx.insert(schema.freeSessionAdmit).values({
      user_id: userId,
      model,
      access_tier: row.access_tier ?? 'full',
      admitted_at: now,
    })
    return row as InternalSessionRow
  })

  if (session) {
    // Mark the referred user's unified referral as activated at this admit's
    // tier (docs/referrals.md). Best-effort and idempotent — a no-op for users
    // with no referral row; never blocks or fails the admission.
    await recordReferralV2Activation({
      referredId: userId,
      accessTier: session.access_tier ?? 'full',
      now,
    }).catch((error) => {
      logger.warn({ error, userId }, 'Failed to record referral_v2 activation')
    })
  }
  return session
}

/**
 * Reactively pin this user's session to the official MiniMax API after the
 * Fireworks serverless API rate-limited it. Sticky for the rest of the session
 * so we never re-pay the prompt-cache miss of switching upstreams. Idempotent:
 * re-pinning an already-pinned session is a harmless no-op. When no session row
 * exists (waiting room off), this updates zero rows and the hot path falls back
 * per-request instead.
 */
export async function pinMinimaxUpstreamToMinimax(params: {
  userId: string
  now: Date
}): Promise<void> {
  await db
    .update(schema.freeSession)
    .set({ minimax_upstream: 'minimax', updated_at: params.now })
    .where(eq(schema.freeSession.user_id, params.userId))
}

export interface RecentSessionAdmit {
  admittedAt: Date
  model: string
  sessionUnits: number
}

/**
 * List free-session admissions for `userId` inside `[since, ∞)`, ordered
 * oldest-first. Each row carries charged session units; manual early end can
 * revise a freshly written 1.0-unit admit down to a fractional value.
 */
export async function listRecentFreeSessionAdmits(params: {
  userId: string
  models: readonly string[]
  since: Date
  accessTier?: FreebuffAccessTier
}): Promise<RecentSessionAdmit[]> {
  const { userId, models, since, accessTier } = params
  if (models.length === 0) return []
  const filters = [
    eq(schema.freeSessionAdmit.user_id, userId),
    inArray(schema.freeSessionAdmit.model, [...models]),
    gte(schema.freeSessionAdmit.admitted_at, since),
  ]
  if (accessTier) {
    filters.push(eq(schema.freeSessionAdmit.access_tier, accessTier))
  }
  const rows = await db
    .select({
      admitted_at: schema.freeSessionAdmit.admitted_at,
      model: schema.freeSessionAdmit.model,
      session_units: schema.freeSessionAdmit.session_units,
    })
    .from(schema.freeSessionAdmit)
    .where(and(...filters))
    .orderBy(asc(schema.freeSessionAdmit.admitted_at))
  return rows.map((r) => ({
    admittedAt: r.admitted_at,
    model: r.model,
    sessionUnits: Number(r.session_units),
  }))
}

// ---------------------------------------------------------------------------
// Desktop multi-session store (free_session_desktop)
//
// Sibling of the single-session helpers above. Keyed by (user_id,
// active_instance_id) so one user holds many concurrent rows — one per desktop
// tab. The single-session functions are untouched, so CLI/web keep their
// one-row-per-user takeover semantics.
// ---------------------------------------------------------------------------

/** True for a Postgres unique-constraint violation (SQLSTATE 23505), however
 *  drizzle/postgres-js surfaces it. Used to map the premium-bucket partial
 *  unique index rejection to a typed error. */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } })?.code
  const causeCode = (err as { cause?: { code?: string } })?.cause?.code
  return code === '23505' || causeCode === '23505'
}

export async function getDesktopSessionRow(
  userId: string,
  instanceId: string,
): Promise<InternalSessionRow | null> {
  const row = await db.query.freeSessionDesktop.findFirst({
    where: and(
      eq(schema.freeSessionDesktop.user_id, userId),
      eq(schema.freeSessionDesktop.active_instance_id, instanceId),
    ),
  })
  return (row as InternalSessionRow | undefined) ?? null
}

export async function listDesktopSessionRows(
  userId: string,
): Promise<InternalSessionRow[]> {
  const rows = await db.query.freeSessionDesktop.findMany({
    where: eq(schema.freeSessionDesktop.user_id, userId),
  })
  return rows as InternalSessionRow[]
}

/** Count active desktop sessions for a user — bounds desktop fan-out against
 *  FREEBUFF_DESKTOP_MAX_CONCURRENT_SESSIONS. */
export async function getActiveDesktopSessionCount(
  userId: string,
): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(schema.freeSessionDesktop)
    .where(
      and(
        eq(schema.freeSessionDesktop.user_id, userId),
        eq(schema.freeSessionDesktop.status, 'active'),
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

/** The user's currently-active premium-bucket desktop session, if any. Used to
 *  describe the `premium_slot_taken` rejection. */
export async function getActivePremiumBucketDesktopRow(
  userId: string,
): Promise<InternalSessionRow | null> {
  const row = await db.query.freeSessionDesktop.findFirst({
    where: and(
      eq(schema.freeSessionDesktop.user_id, userId),
      eq(schema.freeSessionDesktop.status, 'active'),
      eq(schema.freeSessionDesktop.premium_bucket, true),
    ),
  })
  return (row as InternalSessionRow | undefined) ?? null
}

/**
 * Admit (or refresh) a single desktop tab's session. The client supplies a
 * stable per-tab `instanceId`:
 *   - No row for (user, instance) → INSERT an active row + write a
 *     free_session_admit row (so the daily premium quota counts it exactly once)
 *     + best-effort referral activation.
 *   - Existing row → reclaim: refresh the session window, no new admit row (so
 *     lazy per-turn re-admits never double-count the quota).
 *
 * The premium-bucket concurrency cap is enforced by the partial unique index;
 * a racing second premium admit throws FreeSessionPremiumSlotTakenError.
 */
export async function admitDesktopSession(params: {
  userId: string
  instanceId: string
  model: string
  accessTier: FreebuffAccessTier
  premiumBucket: boolean
  now: Date
  sessionLengthMs: number
  fireworksRoute?: FireworksRoute | null
  countryAccess?: FreeSessionCountryAccessMetadata
  existing?: InternalSessionRow | null
}): Promise<InternalSessionRow> {
  const {
    userId,
    instanceId,
    model,
    accessTier,
    premiumBucket,
    now,
    sessionLengthMs,
    fireworksRoute,
    countryAccess,
  } = params
  const expiresAt = new Date(now.getTime() + sessionLengthMs)
  const countryAccessUpdate = countryAccessColumns(countryAccess)

  try {
    // Reuse the caller's already-fetched row when provided (avoids a duplicate
    // PK read on the hot per-turn path); otherwise look it up.
    const existing =
      params.existing !== undefined
        ? params.existing
        : await getDesktopSessionRow(userId, instanceId)
    if (existing) {
      // Reclaim: refresh window in place; keep the original admitted_at so the
      // charged session units stay anchored to first admit.
      const [row] = await db
        .update(schema.freeSessionDesktop)
        .set({
          status: 'active',
          model,
          premium_bucket: premiumBucket,
          access_tier: accessTier,
          fireworks_route: fireworksRoute ?? existing.fireworks_route ?? null,
          admitted_at: existing.admitted_at ?? now,
          expires_at: expiresAt,
          updated_at: now,
          ...countryAccessUpdate,
        })
        .where(
          and(
            eq(schema.freeSessionDesktop.user_id, userId),
            eq(schema.freeSessionDesktop.active_instance_id, instanceId),
          ),
        )
        .returning()
      return row as InternalSessionRow
    }

    const inserted = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.freeSessionDesktop)
        .values({
          user_id: userId,
          active_instance_id: instanceId,
          status: 'active',
          model,
          premium_bucket: premiumBucket,
          access_tier: accessTier,
          fireworks_route: fireworksRoute ?? null,
          ...countryAccessUpdate,
          queued_at: now,
          admitted_at: now,
          expires_at: expiresAt,
          created_at: now,
          updated_at: now,
        })
        .returning()
      await tx.insert(schema.freeSessionAdmit).values({
        user_id: userId,
        model,
        access_tier: accessTier,
        admitted_at: now,
      })
      return row as InternalSessionRow
    })

    // Mirror the single-session path: mark the referred user's referral as
    // activated. Best-effort, never blocks admission.
    await recordReferralV2Activation({
      referredId: userId,
      accessTier,
      now,
    }).catch((error) => {
      logger.warn(
        { error, userId },
        'Failed to record referral_v2 activation (desktop)',
      )
    })
    return inserted
  } catch (err) {
    if (isUniqueViolation(err)) {
      const premium = await getActivePremiumBucketDesktopRow(userId)
      if (premium) {
        throw new FreeSessionPremiumSlotTakenError(
          premium.model,
          premium.active_instance_id,
        )
      }
    }
    throw err
  }
}

/** End one desktop tab's session, finalizing its charged session units. */
export async function endDesktopSession(params: {
  userId: string
  instanceId: string
  now: Date
  sessionLengthMs: number
}): Promise<void> {
  const { userId, instanceId, now, sessionLengthMs } = params
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.freeSessionDesktop)
      .where(
        and(
          eq(schema.freeSessionDesktop.user_id, userId),
          eq(schema.freeSessionDesktop.active_instance_id, instanceId),
        ),
      )
      .for('update')
      .limit(1)

    if (row) await finalizeLatestAdmit(tx, row, userId, now, sessionLengthMs)

    await tx
      .delete(schema.freeSessionDesktop)
      .where(
        and(
          eq(schema.freeSessionDesktop.user_id, userId),
          eq(schema.freeSessionDesktop.active_instance_id, instanceId),
        ),
      )
  })
}

/** End every desktop session for a user (e.g. logout). */
export async function endAllDesktopSessions(userId: string): Promise<void> {
  await db
    .delete(schema.freeSessionDesktop)
    .where(eq(schema.freeSessionDesktop.user_id, userId))
}

/** Instance-scoped MiniMax upstream pin for a desktop session (see
 *  pinMinimaxUpstreamToMinimax). */
export async function pinDesktopMinimaxUpstreamToMinimax(params: {
  userId: string
  instanceId: string
  now: Date
}): Promise<void> {
  await db
    .update(schema.freeSessionDesktop)
    .set({ minimax_upstream: 'minimax', updated_at: params.now })
    .where(
      and(
        eq(schema.freeSessionDesktop.user_id, params.userId),
        eq(schema.freeSessionDesktop.active_instance_id, params.instanceId),
      ),
    )
}
