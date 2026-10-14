import { IS_DEV, IS_TEST, IS_CI } from '@codebuff/common/env'
import { toJsonSafeLogData } from '@codebuff/common/util/log-data'

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
let naturalExitFlushRegistered = false

export function createClientLogFlusher(deps: {
  takeBatch: () => LogRecordInput[]
  hasPending: () => boolean
  sendBatch: (batch: LogRecordInput[]) => Promise<void>
}) {
  let activeFlush: Promise<void> | null = null

  const flush = (): Promise<void> => {
    if (activeFlush) return activeFlush
    const batch = deps.takeBatch()
    if (batch.length === 0) return Promise.resolve()

    activeFlush = deps
      .sendBatch(batch)
      .catch(() => {
        // Best-effort: drop on error rather than risk unbounded growth.
      })
      .finally(() => {
        activeFlush = null
      })
    return activeFlush
  }

  const drain = async (): Promise<void> => {
    while (activeFlush || deps.hasPending()) {
      await (activeFlush ?? flush())
    }
  }

  return { flush, drain }
}

const clientLogFlusher = createClientLogFlusher({
  takeBatch: () => buffer.splice(0, MAX_BATCH),
  hasPending: () => buffer.length > 0,
  sendBatch: async (batch) => {
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
  },
})

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

function registerNaturalExitFlush(): void {
  if (naturalExitFlushRegistered) return
  naturalExitFlushRegistered = true
  const onExit = () => {
    void drainClientLogs()
  }
  process.once('beforeExit', onExit)
}

/**
 * One record ready for the wire: every `Error` in `data` replaced by its JSON
 * form.
 *
 * `/api/logs` is a second process, so the record goes through a
 * `JSON.stringify` before the Axiom sink's own serializer ever sees it, and
 * that hop is where an error's reason is lost: `name`, `message` and `stack`
 * are non-enumerable, so a thrown `Error` arrives as `{}` and a Bun network
 * error as bare `{ code, errno, path }`. Unwrapping before the record is
 * buffered also keeps the buffer's memory bounded by the same cap the sink
 * uses, instead of holding live error objects (and their stacks) in it.
 */
export function toShippableRecord(record: LogRecordInput): LogRecordInput {
  if (record.data == null) return record
  try {
    return { ...record, data: toJsonSafeLogData(record.data) }
  } catch {
    // Shipping a summary-less row beats dropping the row.
    return record
  }
}

/** Buffer one record for shipping. Cheap, synchronous, never throws. */
export function enqueueClientLog(record: LogRecordInput): void {
  if (!enabled()) return
  if (buffer.length >= MAX_BUFFER) {
    buffer.shift()
  }
  buffer.push(toShippableRecord(record))
  ensureTimer()
  registerNaturalExitFlush()
  if (buffer.length >= MAX_BATCH) {
    void flushClientLogs()
  }
}

/** Flush one batch to /api/logs. Concurrent callers share the active request. */
export function flushClientLogs(): Promise<void> {
  return clientLogFlusher.flush()
}

/** Wait for any active request, then flush every batch buffered before exit. */
export async function drainClientLogs(): Promise<void> {
  await clientLogFlusher.drain()
}
