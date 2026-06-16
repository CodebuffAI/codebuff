import type { LogRecordInput } from '@codebuff/common/schemas/logs'

/**
 * Browser-side shipper that mirrors PostHog events into the server's Axiom
 * logs sink via same-origin POST /api/logs. Wired as a PostHog `before_send`
 * tap (see PostHogProvider) so every captured event is mirrored with no
 * changes at the call sites. Best-effort: batched, flushed on an interval and
 * on page hide (via sendBeacon), never throws.
 */

const ENDPOINT = '/api/logs'
const MAX_BATCH = 50
const FLUSH_INTERVAL_MS = 10_000
const MAX_BUFFER = 500

let buffer: LogRecordInput[] = []
let started = false

function flush(useBeacon: boolean): void {
  if (buffer.length === 0) return
  const batch = buffer.splice(0, MAX_BATCH)
  const body = JSON.stringify({ records: batch })
  try {
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(
        ENDPOINT,
        new Blob([body], { type: 'application/json' }),
      )
    } else {
      void fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // best-effort
  }
}

function ensureStarted(): void {
  if (started || typeof window === 'undefined') return
  started = true
  const t = setInterval(() => flush(false), FLUSH_INTERVAL_MS)
  ;(t as { unref?: () => void }).unref?.()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true)
  })
  window.addEventListener('pagehide', () => flush(true))
}

/** Buffer one record for shipping. Cheap, synchronous, never throws. */
export function shipBrowserLog(record: LogRecordInput): void {
  if (typeof window === 'undefined') return
  if (buffer.length >= MAX_BUFFER) {
    buffer.shift()
  }
  buffer.push(record)
  ensureStarted()
  if (buffer.length >= MAX_BATCH) {
    flush(false)
  }
}
