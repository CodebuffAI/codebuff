import { db } from '@codebuff/internal/db'
import { coerceBool } from '@codebuff/internal/db/advisory-lock'
import * as schema from '@codebuff/internal/db/schema'
import { and, asc, count, eq, lt, sql } from 'drizzle-orm'

import { FREEBUFF_ADMISSION_LOCK_ID } from './config'

import type { InternalSessionRow } from './types'

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
 *   - If no row exists: insert status=queued, fresh instance_id, queued_at=now.
 *   - If row exists and active+unexpired: rotate instance_id (takeover),
 *     preserve status/admitted_at/expires_at.
 *   - If row exists and expired: reset to queued with fresh instance_id
 *     and fresh queued_at — effectively re-queue at the back.
 *   - If row exists and already queued: rotate instance_id, preserve
 *     queued_at so user keeps their place in line.
 *
 * Never trusts client-supplied timestamps or instance ids.
 */
export async function joinOrTakeOver(params: {
  userId: string
  now: Date
}): Promise<InternalSessionRow> {
  const { userId, now } = params
  const nextInstanceId = newInstanceId()

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
  //   no row                     → INSERT: status=queued, queued_at=now
  //   active & expires_at > now  → rotate instance_id only (takeover)
  //   queued                     → rotate instance_id, preserve queued_at
  //   active & expired           → re-queue at back: status=queued,
  //                                queued_at=now, admitted_at/expires_at=null
  const activeUnexpired = sql`${schema.freeSession.status} = 'active' AND ${schema.freeSession.expires_at} > ${nowIso}`

  const [row] = await db
    .insert(schema.freeSession)
    .values({
      user_id: userId,
      status: 'queued',
      active_instance_id: nextInstanceId,
      queued_at: now,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: schema.freeSession.user_id,
      set: {
        active_instance_id: nextInstanceId,
        updated_at: now,
        status: sql`CASE WHEN ${activeUnexpired} THEN 'active'::free_session_status ELSE 'queued'::free_session_status END`,
        queued_at: sql`CASE
          WHEN ${schema.freeSession.status} = 'queued' THEN ${schema.freeSession.queued_at}
          WHEN ${activeUnexpired} THEN ${schema.freeSession.queued_at}
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
  return row as InternalSessionRow
}

export async function endSession(userId: string): Promise<void> {
  await db
    .delete(schema.freeSession)
    .where(eq(schema.freeSession.user_id, userId))
}

export async function queueDepth(): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(schema.freeSession)
    .where(eq(schema.freeSession.status, 'queued'))
  return Number(rows[0]?.n ?? 0)
}

export async function queuePositionFor(params: {
  userId: string
  queuedAt: Date
}): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(schema.freeSession)
    .where(
      and(
        eq(schema.freeSession.status, 'queued'),
        sql`(${schema.freeSession.queued_at}, ${schema.freeSession.user_id}) <= (${params.queuedAt.toISOString()}::timestamptz, ${params.userId})`,
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

/**
 * Remove rows whose active session has expired past the drain grace window.
 * Rows whose `expires_at` is in the past but still inside `expires_at + grace`
 * are kept so an in-flight agent run can finish. Safe to call repeatedly.
 */
export async function sweepExpired(now: Date, graceMs: number): Promise<number> {
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
 * Atomically admit one queued user, gated by an upstream reachability probe
 * and guarded by an advisory xact lock so only one pod admits per tick.
 *
 * Return semantics:
 *   - `{ admitted: [row], skipped: null }` — admitted one user
 *   - `{ admitted: [], skipped: null }` — empty queue or another pod held the lock
 *   - `{ admitted: [], skipped: 'health' }` — probe failed, admission paused
 *
 * The probe runs before the transaction so a slow probe doesn't hold a
 * Postgres connection open. Drip-admission of one user per tick keeps load
 * on Fireworks smooth even when a large block of sessions expires at once.
 */
export async function admitFromQueue(params: {
  sessionLengthMs: number
  now: Date
  isFireworksAdmissible: () => Promise<boolean>
}): Promise<{ admitted: InternalSessionRow[]; skipped: 'health' | null }> {
  const { sessionLengthMs, now, isFireworksAdmissible } = params

  if (!(await isFireworksAdmissible())) {
    return { admitted: [], skipped: 'health' }
  }

  return db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ acquired: unknown }>(
      sql`SELECT pg_try_advisory_xact_lock(${FREEBUFF_ADMISSION_LOCK_ID}) AS acquired`,
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
      .where(eq(schema.freeSession.status, 'queued'))
      .orderBy(asc(schema.freeSession.queued_at), asc(schema.freeSession.user_id))
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

    return { admitted: admitted as InternalSessionRow[], skipped: null }
  })
}
