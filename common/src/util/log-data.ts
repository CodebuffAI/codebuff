import { MAX_LOG_DATA_BYTES } from '../schemas/logs'

import type { LogLevel } from '../types/contracts/logs'

/**
 * Shared pieces of the Axiom log-row pipeline used by every producer that
 * ingests rows — the long-lived sink (packages/logging/src/sink.ts) and the
 * Convex direct-ingest helper (freebuff/web/convex/lib/axiom_log.ts). Living
 * here keeps the serialized `data` contract and level ordering identical
 * across producers, so APL queries behave the same regardless of which
 * service emitted a row. Deliberately light on imports (the schemas module
 * pulls only zod) so it stays safe for the Convex bundle.
 */

/** Numeric severity order for LogLevel, used for min-level gating. */
export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
}

/**
 * Serialize a log payload to a single string field, tolerating circular refs
 * and capping size. The cap applies to ALL sources so a large `data` payload
 * can't inflate Axiom ingest cost. The truncated form is still valid JSON so
 * query scripts can `parse_json(data)`.
 */
export function serializeLogData(data: unknown): string | null {
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
