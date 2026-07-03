import { getAnalyticsEventId } from '@codebuff/common/util/analytics-log'
import { LOG_LEVEL_ORDER, serializeLogData } from '@codebuff/common/util/log-data'
import { shouldMirrorAnalyticsEvent } from '@codebuff/common/util/log-mirror'

import type { LogLevel } from '@codebuff/common/types/contracts/logs'

/**
 * Direct Axiom ingest from Convex.
 *
 * Rows mirror the shape produced by the shared sink
 * (packages/logging/src/sink.ts → toEvent), so Convex logs/events are
 * queryable in the same `freebuff` dataset alongside server/CLI/browser rows
 * (docs/logging.md), with `service: 'freebuff-convex'` marking the emitter.
 * The contract pieces — `data` serialization/truncation, level ordering, the
 * AXIOM_MIRROR_DENYLIST cost guard, and eventId→event promotion — are
 * imported from `@codebuff/common`, so they can't drift from the sink.
 *
 * What ISN'T shared is `@codebuff/logging` itself: the sink assumes a
 * long-lived Node process (background batching, shutdown-flush hooks,
 * `@codebuff/common/env` validation), none of which hold in a Convex action.
 * Here each call is a single awaited POST to Axiom's REST ingest API;
 * callers should treat it as best-effort (it never throws).
 *
 * Env (Convex deployment; names match the backend convention in
 * docs/logging.md — AXIOM_API_TOKEN ingests, AXIOM_QUERY_TOKEN reads):
 *   AXIOM_API_TOKEN      ingest token; must cover the freebuff dataset
 *   AXIOM_ORG_ID         only needed for a personal token
 *   AXIOM_DATASET        dataset name (default: freebuff[-dev])
 *   AXIOM_LOGS_ENABLED   'true' | 'false' (default: on in prod only)
 *   AXIOM_LOGS_MIN_LEVEL debug|info|warn|error|fatal (default: info)
 */

const AXIOM_API_URL = 'https://api.axiom.co'

// Bound how long a hung Axiom endpoint can hold a (billed) Convex action open.
const INGEST_TIMEOUT_MS = 5_000

export type AxiomLogParams = {
  level: LogLevel
  /** Human-readable message (the `message` column). */
  message: string
  /**
   * AnalyticsEvent name when this row is an analytics event — promoted to the
   * top-level `event` column, which is what makes it an "event" to the query
   * scripts. Values not in the AnalyticsEvent enum are NOT promoted (the
   * column stays null, matching the loggers' getAnalyticsEventId behavior),
   * so a typo can't mint a new value in the `event` column.
   */
  eventId?: string
  /** Canonical codebuff Postgres user id (the `user_id` pivot column). */
  userId?: string
  /** Structured payload; serialized to the single string `data` field. */
  data?: Record<string, unknown>
}

function isProd(): boolean {
  return process.env.NODE_ENV === 'production'
}

function enabled(): boolean {
  const flag = process.env.AXIOM_LOGS_ENABLED
  if (flag === 'true') return true
  if (flag === 'false') return false
  return isProd()
}

function datasetName(): string {
  return process.env.AXIOM_DATASET || (isProd() ? 'freebuff' : 'freebuff-dev')
}

function minLevel(): number {
  const configured = process.env.AXIOM_LOGS_MIN_LEVEL
  return LOG_LEVEL_ORDER[configured as LogLevel] ?? LOG_LEVEL_ORDER.info
}

/**
 * Ship one log/event row to Axiom. Best-effort and never throws; failures go
 * to the Convex console. Await it from an action (Convex may freeze the
 * process once the handler returns, so fire-and-forget can drop the send).
 */
export async function logToAxiom(params: AxiomLogParams): Promise<void> {
  if (!enabled()) return
  if ((LOG_LEVEL_ORDER[params.level] ?? 0) < minLevel()) return
  // Same authoritative cost guard the sink applies (sink.ts enqueueLogRow):
  // denylisted high-volume events never ingest, from any producer.
  if (!shouldMirrorAnalyticsEvent(params.eventId)) return

  const token = process.env.AXIOM_API_TOKEN
  if (!token) {
    // In production a missing token means Convex rows are silently absent
    // from the Axiom-side queries — the exact gap this helper exists to
    // close — so be loud.
    if (isProd()) {
      console.error(
        '[axiom-log] AXIOM_API_TOKEN is unset in the Convex deployment env — Convex logs/events are not reaching Axiom. Set it with `npx convex env set` (an ingest-capable token for the freebuff dataset).',
      )
    }
    return
  }

  const row = {
    _time: new Date().toISOString(),
    id: crypto.randomUUID(),
    level: params.level,
    source: 'server',
    service: 'freebuff-convex',
    env: isProd() ? 'prod' : 'dev',
    event: params.eventId ? getAnalyticsEventId({ eventId: params.eventId }) : null,
    message: params.message,
    user_id: params.userId ?? null,
    client_session_id: null,
    client_request_id: null,
    fingerprint_id: null,
    data: serializeLogData(params.data),
  }

  try {
    const orgId = process.env.AXIOM_ORG_ID
    const res = await fetch(
      `${AXIOM_API_URL}/v1/datasets/${encodeURIComponent(datasetName())}/ingest`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(orgId ? { 'X-Axiom-Org-Id': orgId } : {}),
        },
        body: JSON.stringify([row]),
        ...(typeof AbortSignal.timeout === 'function'
          ? { signal: AbortSignal.timeout(INGEST_TIMEOUT_MS) }
          : {}),
      },
    )
    if (!res.ok) {
      console.error(
        `[axiom-log] Axiom ingest returned ${res.status} for ${params.eventId ?? params.message}` +
          (res.status === 403
            ? ' — the AXIOM_API_TOKEN in the Convex env likely lacks ingest permission for this dataset'
            : ''),
      )
    }
  } catch (error) {
    console.error('[axiom-log] Axiom ingest failed', error)
  }
}
