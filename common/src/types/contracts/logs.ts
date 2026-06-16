/** Severity levels for the unified logs stream. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

/** Origin of a log row. */
export type LogSource = 'server' | 'cli' | 'browser'

/**
 * One normalized log/event record. This is the provider-agnostic shape the
 * sink ingests (currently into Axiom — see `@codebuff/logging`). An "event" is
 * just a log row with `event` populated, so all logs and analytics events live
 * in one stream. See docs/logging.md.
 */
export type LogRow = {
  /** UUID for this row. */
  id: string
  /** Event time (becomes Axiom's `_time`). */
  timestamp: Date
  level: LogLevel
  source: LogSource
  /** Emitting service, e.g. 'web', 'agent-runtime', 'freebuff-web', 'cli'. */
  service?: string | null
  /** Deploy environment: 'dev' | 'test' | 'prod'. */
  env: string
  /** AnalyticsEvent name when this row is an analytics event, else null. */
  event?: string | null
  /** Human-readable message (the formatted pino msg). */
  message?: string | null
  user_id?: string | null
  client_session_id?: string | null
  client_request_id?: string | null
  fingerprint_id?: string | null
  /** Structured payload. Serialized to a single string field on ingest. */
  data?: unknown
}
