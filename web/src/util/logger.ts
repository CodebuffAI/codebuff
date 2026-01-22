import fs, { appendFileSync } from 'fs'
import path from 'path'
import { format } from 'util'

import { trackEvent } from '@codebuff/common/analytics'
import { env, IS_DEV, IS_CI } from '@codebuff/common/env'
import { createAnalyticsDispatcher } from '@codebuff/common/analytics'
import { splitData } from '@codebuff/common/util/split-data'
import pino from 'pino'

import type { LoggerWithContextFn } from '@codebuff/common/types/contracts/logger'
import type { ParamsOf } from '@codebuff/common/types/function-params'

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
const analyticsDispatcher = createAnalyticsDispatcher({
  envName: env.NEXT_PUBLIC_CB_ENVIRONMENT,
})

function splitAndLog(
  level: LogLevel,
  data: any,
  msg?: string,
  ...args: any[]
): void {
  const formattedMsg = format(msg ?? '', ...args)
  const availableDataLimit = MAX_LENGTH - BUFFER - formattedMsg.length

  // split data recursively into chunks small enough to log
  const processedData: any[] = splitData({
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
  data: any,
  msg?: string,
  ...args: any[]
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
        logger: logger as any,
      })
    })

    // In prod, use pino with splitAndLog for large payloads
    splitAndLog(level, data, msg, ...args)
  }
}

export const logger: Record<LogLevel, pino.LogFn> = Object.fromEntries(
  loggingLevels.map((level) => {
    return [
      level,
      (data: any, msg?: string, ...args: any[]) =>
        logWithSync(level, data, msg, ...args),
    ]
  }),
) as Record<LogLevel, pino.LogFn>

export function loggerWithContext(
  context: ParamsOf<LoggerWithContextFn>,
): ReturnType<LoggerWithContextFn> {
  return {
    debug: (data: any, ...args) =>
      logger.debug({ ...context, ...data }, ...args),
    info: (data: any, ...args) => logger.info({ ...context, ...data }, ...args),
    warn: (data: any, ...args) => logger.warn({ ...context, ...data }, ...args),
    error: (data: any, ...args) =>
      logger.error({ ...context, ...data }, ...args),
  }
}
