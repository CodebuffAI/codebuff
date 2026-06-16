import fs, { appendFileSync } from 'fs'
import path from 'path'
import { format } from 'util'

import { trackEvent } from '@codebuff/common/analytics'
import { env, IS_DEV, IS_CI } from '@codebuff/common/env'
import { createAnalyticsDispatcher } from '@codebuff/common/util/analytics-dispatcher'
import { getAnalyticsEventId } from '@codebuff/common/util/analytics-log'
import { splitData } from '@codebuff/common/util/split-data'
import { enqueueLogRow } from '@codebuff/logging'
import pino from 'pino'

import type {
  LogLevel as LogRowLevel,
  LogRow,
} from '@codebuff/common/types/contracts/logs'
import type { LoggerWithContextFn } from '@codebuff/common/types/contracts/logger'
import type { ParamsOf } from '@codebuff/common/types/function-params'

/** Service name stamped on every log row from this process. */
const LOG_SERVICE = 'web'

/** Pull a string field from a log payload, trying snake_case + camelCase. */
function pickStr(
  data: unknown,
  ...keys: string[]
): string | null {
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
 * best-effort — `enqueueLogRow` just buffers; it never throws. Common filter
 * fields are promoted out of `data` to top-level event fields.
 */
function dualWriteToLogSink(
  level: LogRowLevel,
  data: unknown,
  message: string,
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
    data: data && typeof data === 'object' ? data : data == null ? null : { data },
  }
  enqueueLogRow(row)
}

// --- Constants ---
const MAX_LENGTH = 65535 // Max total log size is sometimes 100k (sometimes 65535?)
const BUFFER = 1000 // Buffer for context, etc.

// Ensure debug directory exists for local environment
let debugDir: string | null | undefined
function getDebugDir(): string | null {
  if (debugDir !== undefined) {
    return debugDir
  }
  // Walk up from cwd to find the git root (where .git exists)
  let dir = process.cwd()
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      debugDir = path.join(dir, 'debug')
      return debugDir
    }
    dir = path.dirname(dir)
  }
  debugDir = null
  console.error('Failed to find git root directory for logger')
  return debugDir
}

// Initialize debug directory in dev environment
if (IS_DEV && !IS_CI) {
  const dir = getDebugDir()
  if (dir) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch {
      // Ignore errors when creating debug directory
    }
  }
}

const pinoLogger = pino(
  {
    level: 'debug',
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() }
      },
    },
    timestamp: () => `,"timestamp":"${new Date(Date.now()).toISOString()}"`,
  },
  debugDir
    ? pino.destination({
        dest: path.join(debugDir, 'web.jsonl'),
        mkdir: true,
        sync: true, // sync writes for real-time logging
      })
    : undefined,
)

const loggingLevels = ['info', 'debug', 'warn', 'error', 'fatal'] as const
type LogLevel = (typeof loggingLevels)[number]

/**
 * Log data can be any serializable value
 */
export type LogData = unknown

/**
 * Log arguments (format string arguments)
 */
export type LogArgs = unknown[]
const analyticsDispatcher = createAnalyticsDispatcher({
  envName: env.NEXT_PUBLIC_CB_ENVIRONMENT,
})

function splitAndLog(
  level: LogLevel,
  data: LogData,
  msg?: string,
  ...args: LogArgs
): void {
  const formattedMsg = format(msg ?? '', ...args)
  const availableDataLimit = MAX_LENGTH - BUFFER - formattedMsg.length

  // split data recursively into chunks small enough to log
  const processedData: unknown[] = splitData({
    data,
    maxChunkSize: availableDataLimit,
  })

  if (processedData.length === 1) {
    pinoLogger[level](processedData[0], msg, ...args)
    return
  }

  processedData.forEach((chunk, index) => {
    pinoLogger[level](
      chunk,
      `${formattedMsg} (chunk ${index + 1}/${processedData.length})`,
    )
  })
}

// In dev mode, use appendFileSync for real-time file logging (Bun has issues with pino sync)
// Also output to console so logs remain visible in the terminal
function logWithSync(
  level: LogLevel,
  data: LogData,
  msg?: string,
  ...args: LogArgs
): void {
  const formattedMsg = format(msg ?? '', ...args)
  if (IS_DEV) {
    // Write to file for real-time logging
    if (debugDir) {
      const logEntry = JSON.stringify({
        level: level.toUpperCase(),
        timestamp: new Date().toISOString(),
        ...(data && typeof data === 'object' ? data : { data }),
        msg: formattedMsg,
      })
      try {
        appendFileSync(path.join(debugDir, 'web.jsonl'), logEntry + '\n')
      } catch {
        // Ignore write errors
      }
    }
    // Also output to console for interactive debugging (don't use pinoLogger here
    // as it's configured to write to the same file, which would cause double logging)
    console[level === 'fatal' ? 'error' : level](formattedMsg, data)
  } else {
    const analyticsPayloads = analyticsDispatcher.process({
      data,
      level,
      msg: formattedMsg,
    })

    analyticsPayloads.forEach((payload) => {
      trackEvent({
        event: payload.event,
        userId: payload.userId,
        properties: payload.properties,
        logger: logger as unknown as typeof logger,
      })
    })

    // Dual-write to the Axiom logs sink (non-blocking, best-effort).
    dualWriteToLogSink(level, data, formattedMsg)

    // In prod, use pino with splitAndLog for large payloads
    splitAndLog(level, data, msg, ...args)
  }
}

export const logger: Record<LogLevel, pino.LogFn> = Object.fromEntries(
  loggingLevels.map((level) => {
    return [
      level,
      (data: LogData, msg?: string, ...args: LogArgs) =>
        logWithSync(level, data, msg, ...args),
    ]
  }),
) as Record<LogLevel, pino.LogFn>

export function loggerWithContext(
  context: ParamsOf<LoggerWithContextFn>,
): ReturnType<LoggerWithContextFn> {
  const mergeData = (data: LogData) => ({
    ...context,
    ...(typeof data === 'object' && data !== null ? data : { data }),
  })
  return {
    debug: (data: LogData, msg?: string, ...args: LogArgs) =>
      logger.debug(mergeData(data), msg, ...args),
    info: (data: LogData, msg?: string, ...args: LogArgs) =>
      logger.info(mergeData(data), msg, ...args),
    warn: (data: LogData, msg?: string, ...args: LogArgs) =>
      logger.warn(mergeData(data), msg, ...args),
    error: (data: LogData, msg?: string, ...args: LogArgs) =>
      logger.error(mergeData(data), msg, ...args),
  }
}
