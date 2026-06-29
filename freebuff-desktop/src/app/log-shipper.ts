/**
 * Client-side log shipper for Freebuff Desktop. Mirrors logs/analytics events
 * into the server's Axiom logs sink via POST /api/logs, exactly like the CLI's
 * `cli/src/utils/log-shipper.ts`. PostHog stays the product-analytics source of
 * truth; this is the queryable ops copy (see docs/logging.md).
 *
 * The desktop is a client app on the user's machine, so it must NOT hold the
 * Axiom ingest token — it ships to /api/logs, which stamps the authenticated
 * user_id (from the bearer) or accepts the batch anonymously (rate-limited).
 *
 * Fully best-effort: batched, fire-and-forget, never throws, never logs through
 * any app logger (which would recurse).
 */

import { getAuthToken } from './auth/login-store'

import type { LogRecordInput } from '@codebuff/common/schemas/logs'

const MAX_BATCH = 50
const FLUSH_INTERVAL_MS = 10_000
const MAX_BUFFER = 1_000

let buffer: LogRecordInput[] = []
let timer: ReturnType<typeof setInterval> | null = null
let flushing = false

function apiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'https://codebuff.com'
  ).replace(/\/$/, '')
}

/** Off in dev/test (no token locally, avoids ingest cost); on otherwise.
 *  Honors an explicit FREEBUFF_SHIP_LOGS override either way. */
function enabled(): boolean {
  const flag = process.env.FREEBUFF_SHIP_LOGS
  if (flag === 'true') return true
  if (flag === 'false') return false
  return process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'prod'
}

function ensureTimer(): void {
  if (timer) return
  timer = setInterval(() => {
    void flushClientLogs()
  }, FLUSH_INTERVAL_MS)
  ;(timer as { unref?: () => void }).unref?.()
}

/** Buffer one record for shipping. Cheap, synchronous, never throws. The
 *  periodic timer drains it; a final flush on shutdown is driven by the server
 *  through `flushAnalytics()`, so this module registers no exit hooks of its own. */
export function enqueueClientLog(record: LogRecordInput): void {
  if (!enabled()) return
  if (buffer.length >= MAX_BUFFER) buffer.shift()
  buffer.push(record)
  ensureTimer()
  if (buffer.length >= MAX_BATCH) void flushClientLogs()
}

/** Flush a batch to /api/logs. With a token the server stamps the authed user;
 *  without one the batch is accepted anonymously so pre-auth events still land. */
export async function flushClientLogs(): Promise<void> {
  if (flushing || buffer.length === 0) return
  flushing = true
  const batch = buffer.splice(0, MAX_BATCH)
  try {
    const token = getAuthToken()
    await fetch(`${apiBaseUrl()}/api/logs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ records: batch }),
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    // Best-effort: drop on error rather than risk unbounded growth.
  } finally {
    flushing = false
  }
}
