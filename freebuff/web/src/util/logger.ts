import { env } from '@codebuff/common/env'
import { getAnalyticsEventId } from '@codebuff/common/util/analytics-log'
import { enqueueLogRow } from '@codebuff/logging'
import pino from 'pino'

import type {
  LogLevel as LogRowLevel,
  LogRow,
} from '@codebuff/common/types/contracts/logs'

const pinoLogger = pino({
  level: 'debug',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
})

/** Service name stamped on every server log row from this process. Matches the
 *  `service` the browser `/api/logs` route uses, so server + browser freebuff
 *  rows share one queryable service in Axiom. */
const LOG_SERVICE = 'freebuff-web'

/** Pull a string field from a log payload, trying snake_case + camelCase. */
function pickStr(data: unknown, ...keys: string[]): string | null {
  if (data == null || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v) return v
  }
  return null
}

/**
 * Dual-write a server log line to the log sink (Axiom). Non-blocking and
 * best-effort — `enqueueLogRow` just buffers and is gated by the sink's own
 * enable + min-level checks (off in dev, on in prod), so it's a no-op locally.
 *
 * Historically the freebuff-web server `logger` was stdout-only, so its
 * server-side logs (referral redemption/qualification/completion, auth,
 * geo-access, etc.) never reached Axiom — only the browser PostHog mirror
 * (`/api/logs`) did. This wires them in, mirroring web/src/util/logger.ts.
 */
function dualWriteToLogSink(
  level: LogRowLevel,
  data: unknown,
  message: string | undefined,
): void {
  const eventId =
    data != null && typeof data === 'object' ? getAnalyticsEventId(data) : null
  const row: LogRow = {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    level,
    source: 'server',
    service: LOG_SERVICE,
    env: env.NEXT_PUBLIC_CB_ENVIRONMENT,
    event: eventId ? String(eventId) : null,
    message: message || null,
    user_id: pickStr(data, 'user_id', 'userId'),
    client_session_id: pickStr(data, 'client_session_id', 'clientSessionId'),
    client_request_id: pickStr(data, 'client_request_id', 'clientRequestId'),
    fingerprint_id: pickStr(data, 'fingerprint_id', 'fingerprintId'),
    data:
      data && typeof data === 'object' ? data : data == null ? null : { data },
  }
  enqueueLogRow(row)
}

const loggingLevels = ['info', 'debug', 'warn', 'error', 'fatal'] as const
type LogLevel = (typeof loggingLevels)[number]

export const logger: Record<LogLevel, pino.LogFn> = Object.fromEntries(
  loggingLevels.map((level) => [
    level,
    (data: unknown, msg?: string, ...args: unknown[]) => {
      // Best-effort dual-write to Axiom first; never let a sink hiccup break
      // the stdout log line.
      try {
        dualWriteToLogSink(level, data, msg)
      } catch {
        // ignore
      }
      pinoLogger[level === 'fatal' ? 'fatal' : level](data, msg, ...args)
    },
  ]),
) as Record<LogLevel, pino.LogFn>
