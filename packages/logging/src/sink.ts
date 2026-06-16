import { Axiom } from '@axiomhq/js'
import { IS_PROD } from '@codebuff/common/env'
import { MAX_LOG_DATA_BYTES } from '@codebuff/common/schemas/logs'

import type { LogLevel, LogRow } from '@codebuff/common/types/contracts/logs'

/**
 * Server-side sink that ships normalized log/event rows to Axiom.
 *
 * The `@axiomhq/js` batching client already buffers events in the background
 * and flushes on its own interval/size (with retries), so this module is a thin
 * wrapper that:
 *   - gates on an enable flag + minimum level (controls ingest volume = cost),
 *   - lazily constructs a single client (disabled gracefully if no token),
 *   - maps a LogRow to an Axiom event (event time → `_time`, payload → a single
 *     stringified `data` field to keep dataset field-cardinality stable),
 *   - never throws, blocks, or recurses into app logging (errors → console).
 *
 * Env (see docs/logging.md):
 *   AXIOM_API_TOKEN   ingest token (required to enable)
 *   AXIOM_ORG_ID      org id (only for personal tokens)
 *   AXIOM_DATASET     dataset name (default: codebuff-logs[-dev])
 *   AXIOM_LOGS_ENABLED 'true' | 'false'   (default: on in prod only)
 *   AXIOM_LOGS_MIN_LEVEL debug|info|warn|error|fatal (default: info)
 */

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
}

let minLevelWarned = false
function minLevel(): number {
  const configured = process.env.AXIOM_LOGS_MIN_LEVEL
  if (!configured) return LEVEL_ORDER.info
  const level = LEVEL_ORDER[configured as LogLevel]
  if (level === undefined) {
    if (!minLevelWarned) {
      minLevelWarned = true
      console.error(
        `[axiom-log-sink] invalid AXIOM_LOGS_MIN_LEVEL="${configured}"; ` +
          `expected one of ${Object.keys(LEVEL_ORDER).join('|')}. Defaulting to info.`,
      )
    }
    return LEVEL_ORDER.info
  }
  return level
}

function enabled(): boolean {
  const flag = process.env.AXIOM_LOGS_ENABLED
  if (flag === 'true') return true
  if (flag === 'false') return false
  // Default: on in prod, off in dev/test (no token locally, avoids ingest cost).
  return IS_PROD
}

function datasetName(): string {
  return (
    process.env.AXIOM_DATASET || (IS_PROD ? 'codebuff-logs' : 'codebuff-logs-dev')
  )
}

let client: Axiom | null = null
let clientFailed = false
let shutdownRegistered = false

function getClient(): Axiom | null {
  if (client) return client
  if (clientFailed) return null
  const token = process.env.AXIOM_API_TOKEN
  if (!token) {
    clientFailed = true
    console.error('[axiom-log-sink] AXIOM_API_TOKEN not set; log ingest disabled')
    return null
  }
  try {
    const orgId = process.env.AXIOM_ORG_ID
    client = new Axiom({
      token,
      ...(orgId ? { orgId } : {}),
      onError: (error) =>
        console.error('[axiom-log-sink] Axiom ingest error', error),
    })
    return client
  } catch (error) {
    clientFailed = true
    console.error('[axiom-log-sink] failed to init Axiom client', error)
    return null
  }
}

/**
 * Serialize a payload to a single string field, tolerating circular refs and
 * capping size. The cap applies to ALL sources (server + client) so a large
 * server-side `data` payload can't inflate Axiom ingest cost — the client path
 * truncates too, but doing it here guarantees symmetry. The truncated form is
 * still valid JSON so query scripts can `parse_json(data)`.
 */
function serializeData(data: unknown): string | null {
  if (data == null) return null
  let serialized: string
  if (typeof data === 'string') {
    serialized = data
  } else {
    try {
      const seen = new WeakSet()
      serialized = JSON.stringify(data, (_k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]'
          seen.add(v)
        }
        return v
      })
    } catch {
      return null
    }
  }
  if (serialized.length > MAX_LOG_DATA_BYTES) {
    return JSON.stringify({
      _truncated: true,
      original_bytes: serialized.length,
      preview: serialized.slice(0, MAX_LOG_DATA_BYTES),
    })
  }
  return serialized
}

function toEvent(row: LogRow): Record<string, unknown> {
  const ts =
    row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp
  return {
    _time: ts, // Axiom event time; otherwise it stamps ingestion time.
    id: row.id,
    level: row.level,
    source: row.source,
    service: row.service ?? null,
    env: row.env,
    event: row.event ?? null,
    message: row.message ?? null,
    user_id: row.user_id ?? null,
    client_session_id: row.client_session_id ?? null,
    client_request_id: row.client_request_id ?? null,
    fingerprint_id: row.fingerprint_id ?? null,
    data: serializeData(row.data),
  }
}

function registerShutdown(): void {
  if (shutdownRegistered) return
  shutdownRegistered = true
  const onExit = () => {
    void flushLogSink()
  }
  process.once('beforeExit', onExit)
  process.once('SIGTERM', onExit)
  process.once('SIGINT', onExit)
}

/**
 * Enqueue one row for ingestion. Cheap and synchronous: the Axiom client
 * buffers internally. Never throws.
 */
export function enqueueLogRow(row: LogRow): void {
  if (!enabled()) return
  if ((LEVEL_ORDER[row.level] ?? 0) < minLevel()) return
  const axiom = getClient()
  if (!axiom) return
  try {
    axiom.ingest(datasetName(), toEvent(row))
    registerShutdown()
  } catch (error) {
    console.error('[axiom-log-sink] enqueue failed', error)
  }
}

/** Flush buffered events to Axiom. Best-effort; safe to call on shutdown. */
export async function flushLogSink(): Promise<void> {
  if (!client) return
  try {
    await client.flush()
  } catch (error) {
    console.error('[axiom-log-sink] flush failed', error)
  }
}

/** Inspect sink state (for tests / debug). */
export function getLogSinkStats(): { enabled: boolean; initialized: boolean } {
  return { enabled: enabled(), initialized: !!client }
}
