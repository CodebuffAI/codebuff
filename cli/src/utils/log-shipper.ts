import { IS_DEV, IS_TEST, IS_CI } from '@codebuff/common/env'

import { getApiClient } from './codebuff-api'
import { getCliEnv } from './env'

import type { LogRecordInput } from '@codebuff/common/schemas/logs'

/**
 * Client-side shipper that mirrors CLI logs/events into the server's Axiom
 * logs sink via POST /api/logs. Runs alongside PostHog (it does not replace
 * it). Fully best-effort: batched, fire-and-forget, never throws, never logs
 * through the app logger (which would recurse).
 *
 * Tuning via env:
 *  - CODEBUFF_SHIP_LOGS 'true' | 'false'  (default: on outside dev/test)
 */

const MAX_BATCH = 50
const FLUSH_INTERVAL_MS = 10_000
const MAX_BUFFER = 1_000

let buffer: LogRecordInput[] = []
let timer: ReturnType<typeof setInterval> | null = null
let flushing = false
let shutdownRegistered = false

function enabled(): boolean {
  const flag = getCliEnv().CODEBUFF_SHIP_LOGS
  if (flag === 'true') return true
  if (flag === 'false') return false
  return !IS_DEV && !IS_TEST && !IS_CI
}

function ensureTimer(): void {
  if (timer) return
  timer = setInterval(() => {
    void flushClientLogs()
  }, FLUSH_INTERVAL_MS)
  ;(timer as { unref?: () => void }).unref?.()
}

function registerShutdown(): void {
  if (shutdownRegistered) return
  shutdownRegistered = true
  const onExit = () => {
    void flushClientLogs()
  }
  process.once('beforeExit', onExit)
  process.once('SIGTERM', onExit)
  process.once('SIGINT', onExit)
}

/** Buffer one record for shipping. Cheap, synchronous, never throws. */
export function enqueueClientLog(record: LogRecordInput): void {
  if (!enabled()) return
  if (buffer.length >= MAX_BUFFER) {
    buffer.shift()
  }
  buffer.push(record)
  ensureTimer()
  registerShutdown()
  if (buffer.length >= MAX_BATCH) {
    void flushClientLogs()
  }
}

/** Flush a batch to /api/logs. Requeues if not yet authenticated. */
export async function flushClientLogs(): Promise<void> {
  if (flushing || buffer.length === 0) return
  flushing = true
  const batch = buffer.splice(0, MAX_BATCH)
  try {
    const client = getApiClient()
    // Ship whether or not we're logged in. With a token the server stamps the
    // authenticated user_id; without one it accepts the batch anonymously
    // (rate-limited, user_id=null) so pre-auth events like app_launched still
    // reach Axiom. Records carry client_session_id for correlation. See
    // /api/logs and docs/logging.md.
    await client.post(
      '/api/logs',
      { records: batch },
      {
        includeAuth: Boolean(client.authToken),
        retry: false,
        timeoutMs: 5_000,
      },
    )
  } catch {
    // Best-effort: drop on error rather than risk unbounded growth.
  } finally {
    flushing = false
  }
}
