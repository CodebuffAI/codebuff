import { MAX_LOG_DATA_BYTES } from '../schemas/logs'

import type { LogRecordInput } from '../schemas/logs'
import type { LogRow, LogSource } from '../types/contracts/logs'

/**
 * Truncate an oversized payload so a single client cannot bloat ingest volume.
 * Returns the original value when small.
 */
function truncateData(data: unknown): unknown {
  if (data === undefined) return null
  let serialized: string
  try {
    serialized = JSON.stringify(data)
  } catch {
    return { _unserializable: true }
  }
  if (serialized.length <= MAX_LOG_DATA_BYTES) return data
  return {
    _truncated: true,
    original_bytes: serialized.length,
    preview: serialized.slice(0, MAX_LOG_DATA_BYTES),
  }
}

/**
 * Map validated client ingest records onto `LogRow`s. The server is the source
 * of truth for identity/environment: it stamps `source`, `service`, `env`, the
 * authenticated `user_id`, and a received-at fallback timestamp.
 */
export function buildLogRows(params: {
  records: LogRecordInput[]
  source: LogSource
  service: string
  env: string
  userId?: string | null
  now: Date
}): LogRow[] {
  const { records, source, service, env, userId = null, now } = params
  return records.map((record) => {
    const ts = record.timestamp ? new Date(record.timestamp) : now
    return {
      id: crypto.randomUUID(),
      timestamp: isNaN(ts.getTime()) ? now : ts,
      level: record.level,
      source,
      service,
      env,
      event: record.event ?? null,
      message: record.message ?? null,
      user_id: userId,
      client_session_id: record.client_session_id ?? null,
      client_request_id: record.client_request_id ?? null,
      fingerprint_id: record.fingerprint_id ?? null,
      data: truncateData(record.data),
    }
  })
}
