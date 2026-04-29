import { db } from '@codebuff/internal/db'
import { coerceBool } from '@codebuff/internal/db/advisory-lock'
import * as schema from '@codebuff/internal/db/schema'
import { and, asc, count, eq, gte, lt, sql } from 'drizzle-orm'

import { FREEBUFF_ADMISSION_LOCK_ID } from './config'

import type { FireworksHealth } from './fireworks-health'
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
  now: Date
  countryAccess?: FreeSessionCountryAccessMetadata
}): Promise<InternalSessionRow> {
  const { userId, model, now, countryAccess } = params
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

export async function endSession(userId: string): Promise<void> {
  await db
    .delete(schema.freeSession)
    .where(eq(schema.freeSession.user_id, userId))
}

export async function queueDepth(params: { model: string }): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(schema.freeSession)
    .where(
      and(
        eq(schema.freeSession.status, 'queued'),
        eq(schema.freeSession.model, params.model),
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

/**
 * Single-query read of queued-row counts bucketed by model. Powers the
 * per-model "N ahead" hint in the waiting-room model selector — one round-trip
 * covers every model's queue depth, so the UI stays cheap to refresh.
 * Models with no queued rows are absent from the map; callers should default
 * missing keys to 0.
 *
 * Excludes rows whose user is banned: `evictBanned` only runs on the 15s
 * admission tick, so between ticks a flood of banned bots would inflate
 * queueDepth by their count and then snap back down. Filtering here keeps
 * the user-facing counter stable.
 */
export async function queueDepthsByModel(): Promise<Record<string, number>> {
  const rows = await db
    .select({ model: schema.freeSession.model, n: count() })
    .from(schema.freeSession)
    .where(
      and(
        eq(schema.freeSession.status, 'queued'),
        sql`NOT EXISTS (
          SELECT 1 FROM ${schema.user}
          WHERE ${schema.user.id} = ${schema.freeSession.user_id}
            AND ${schema.user.banned} = true
        )`,
      ),
    )
    .groupBy(schema.freeSession.model)
  const out: Record<string, number> = {}
  for (const row of rows) out[row.model] = Number(row.n)
  return out
}

/**
 * Count of rows currently in `active` status for one model — the threshold
 * check that gates instant admission. Hot-path lookup; callers avoid the
 * full `activeCountsByModel` scan when they only need one model's count.
 */
export async function activeCountForModel(model: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(schema.freeSession)
    .where(
      and(
        eq(schema.freeSession.status, 'active'),
        eq(schema.freeSession.model, model),
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

/**
 * Single-query read of active-row counts bucketed by model. Mirrors
 * `queueDepthsByModel` so the admission tick can log per-model utilization
 * alongside per-model queue depth. Models with no active sessions are absent
 * from the map; callers should default missing keys to 0.
 */
export async function activeCountsByModel(): Promise<Record<string, number>> {
  const rows = await db
    .select({ model: schema.freeSession.model, n: count() })
    .from(schema.freeSession)
    .where(eq(schema.freeSession.status, 'active'))
    .groupBy(schema.freeSession.model)
  const out: Record<string, number> = {}
  for (const row of rows) out[row.model] = Number(row.n)
  return out
}

export async function queuePositionFor(params: {
  userId: string
  model: string
  queuedAt: Date
}): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(schema.freeSession)
    .where(
      and(
        eq(schema.freeSession.status, 'queued'),
        eq(schema.freeSession.model, params.model),
        sql`(${schema.freeSession.queued_at}, ${schema.freeSession.user_id}) <= (${params.queuedAt.toISOString()}::timestamptz, ${params.userId})`,
        // Exclude banned users ahead of us — matches queueDepthsByModel so the
        // "Position N / M" counter doesn't briefly jump when banned rows are
        // swept by the admission tick.
        sql`NOT EXISTS (
          SELECT 1 FROM ${schema.user}
          WHERE ${schema.user.id} = ${schema.freeSession.user_id}
            AND ${schema.user.banned} = true
        )`,
      ),
    )
  return Number(rows[0]?.n ?? 0)
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
  const deleted = await db
    .delete(schema.freeSession)
    .where(
      and(
        eq(schema.freeSession.status, 'active'),
        lt(schema.freeSession.expires_at, cutoff),
      ),
    )
    .returning({ user_id: schema.freeSession.user_id })
  return deleted.length
}

/**
 * Drop any free_session row whose user has been banned. Bans flipped via the
 * admin UI / direct SQL / Stripe webhook don't cascade into free_session, so
 * without this sweep a banned user keeps holding their admitted slot until
 * expires_at. Cheap to call every tick (EXISTS subquery, indexed PK lookup).
 */
export async function evictBanned(): Promise<number> {
  const deleted = await db
    .delete(schema.freeSession)
    .where(
      sql`EXISTS (
        SELECT 1 FROM ${schema.user}
        WHERE ${schema.user.id} = ${schema.freeSession.user_id}
          AND ${schema.user.banned} = true
      )`,
    )
    .returning({ user_id: schema.freeSession.user_id })
  return deleted.length
}

/**
 * Atomically admit one queued user for a specific model, gated by the
 * upstream health for that model's deployment and guarded by an advisory
 * xact lock so only one pod admits per tick (per model).
 *
 * Each model has its own queue; this admits the longest-waiting user from
 * the given model's queue. Health is passed in (resolved by the caller from
 * a single fleet probe) rather than fetched here, so a slow probe doesn't
 * hold a Postgres connection open.
 *
 * Return semantics:
 *   - `{ admitted: [row], skipped: null }` — admitted one user
 *   - `{ admitted: [], skipped: null }` — empty queue or another pod held the lock
 *   - `{ admitted: [], skipped: 'degraded' | 'unhealthy' }` — health blocked admission
 *
 * Only `healthy` admits; `degraded` and `unhealthy` both pause admission (the
 * distinction is for observability — degraded means "upstream loaded",
 * unhealthy means "upstream unreachable or saturated").
 */
export async function admitFromQueue(params: {
  model: string
  sessionLengthMs: number
  now: Date
  health: FireworksHealth
}): Promise<{
  admitted: InternalSessionRow[]
  skipped: FireworksHealth | null
}> {
  const { model, sessionLengthMs, now, health } = params

  if (health !== 'healthy') {
    return { admitted: [], skipped: health }
  }

  return db.transaction(async (tx) => {
    // Per-model lock: hashing the model into the lock id lets distinct model
    // queues admit concurrently while still serializing within a single queue.
    const modelLockId = FREEBUFF_ADMISSION_LOCK_ID + hashStringToInt32(model)
    const lockResult = await tx.execute<{ acquired: unknown }>(
      sql`SELECT pg_try_advisory_xact_lock(${modelLockId}) AS acquired`,
    )
    if (
      !coerceBool(
        (lockResult as unknown as Array<{ acquired: unknown }>)[0]?.acquired,
      )
    ) {
      return { admitted: [], skipped: null }
    }

    const candidates = await tx
      .select({ user_id: schema.freeSession.user_id })
      .from(schema.freeSession)
      .where(
        and(
          eq(schema.freeSession.status, 'queued'),
          eq(schema.freeSession.model, model),
        ),
      )
      .orderBy(
        asc(schema.freeSession.queued_at),
        asc(schema.freeSession.user_id),
      )
      .limit(1)
      .for('update', { skipLocked: true })

    const candidate = candidates[0]
    if (!candidate) return { admitted: [], skipped: null }

    const expiresAt = new Date(now.getTime() + sessionLengthMs)
    const admitted = await tx
      .update(schema.freeSession)
      .set({
        status: 'active',
        admitted_at: now,
        expires_at: expiresAt,
        updated_at: now,
      })
      .where(
        and(
          eq(schema.freeSession.status, 'queued'),
          eq(schema.freeSession.user_id, candidate.user_id),
        ),
      )
      .returning()

    if (admitted.length > 0) {
      await tx.insert(schema.freeSessionAdmit).values(
        admitted.map((r) => ({
          user_id: r.user_id,
          model: r.model,
          admitted_at: now,
        })),
      )
    }

    return { admitted: admitted as InternalSessionRow[], skipped: null }
  })
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
}): Promise<InternalSessionRow | null> {
  const { userId, model, sessionLengthMs, now } = params
  const expiresAt = new Date(now.getTime() + sessionLengthMs)
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.freeSession)
      .set({
        status: 'active',
        admitted_at: now,
        expires_at: expiresAt,
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
      admitted_at: now,
    })
    return row as InternalSessionRow
  })
}

/**
 * List admissions for `userId` on `model` whose `admitted_at` is within the
 * window `[since, ∞)`, ordered oldest-first. Caller gets both the count
 * (array length, capped at `limit`) and the oldest timestamp (`rows[0]`) —
 * the oldest is needed to compute `retryAfterMs` when the window is full,
 * so one query covers both the check and the reject path.
 *
 * Drives the per-user, per-model rate limit (e.g. at most 5 GLM sessions in
 * the last 12h) enforced before `joinOrTakeOver`.
 */
export async function listRecentAdmits(params: {
  userId: string
  model: string
  since: Date
  limit: number
}): Promise<Date[]> {
  const { userId, model, since, limit } = params
  const rows = await db
    .select({ admitted_at: schema.freeSessionAdmit.admitted_at })
    .from(schema.freeSessionAdmit)
    .where(
      and(
        eq(schema.freeSessionAdmit.user_id, userId),
        eq(schema.freeSessionAdmit.model, model),
        gte(schema.freeSessionAdmit.admitted_at, since),
      ),
    )
    .orderBy(asc(schema.freeSessionAdmit.admitted_at))
    .limit(limit)
  return rows.map((r) => r.admitted_at)
}

/** Stable 31-bit hash so model-keyed advisory lock ids don't overflow int4. */
function hashStringToInt32(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h) % 0x40000000
}
