import { AsyncLocalStorage } from 'async_hooks'
import { mkdirSync } from 'fs'
import path from 'path'
import { format } from 'util'

import { env } from '@codebuff/internal'
import pino from 'pino'

import { splitData } from './split-data'
import {
  getLoggerContext,
  withAppContext,
  type LoggerContext,
} from '../context/app-context'

// --- Constants ---
const MAX_LENGTH = 65535 // Max total log size is sometimes 100k (sometimes 65535?)
const BUFFER = 1000 // Buffer for context, etc.

const loggerAsyncStorage = new AsyncLocalStorage<LoggerContext>()

export const withLoggerContext = <T>(
  additionalContext: Partial<LoggerContext>,
  fn: () => Promise<T>,
) => {
  // Use the new combined context, preserving any existing request context
  return withAppContext(additionalContext, {}, fn)
}

// Ensure debug directory exists for local environment
const debugDir = path.join(__dirname, '../../../debug')
if (
  env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev' &&
  process.env.CODEBUFF_GITHUB_ACTIONS !== 'true'
) {
  try {
    mkdirSync(debugDir, { recursive: true })
  } catch (err) {
    console.error('Failed to create debug directory:', err)
  }
}

const pinoLogger = pino(
  {
    level: 'debug',
    mixin() {
      // Use the new combined context
      return { logTrace: getLoggerContext() }
    },
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() }
      },
    },
    timestamp: () => `,"timestamp":"${new Date(Date.now()).toISOString()}"`,
  },
  env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev' &&
    process.env.CODEBUFF_GITHUB_ACTIONS !== 'true'
    ? pino.transport({
        target: 'pino/file',
        options: {
          destination: path.join(debugDir, 'backend.log'),
        },
        level: 'debug',
      })
    : undefined,
)

const loggingLevels = ['info', 'debug', 'warn', 'error', 'fatal'] as const
type LogLevel = (typeof loggingLevels)[number]

// Detect CI/GitHub Actions explicitly
const IN_CI = process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true'

// Add a simple subscriber so other modules (like websockets) can mirror logs to clients for debugging
let logSubscriber:
  | undefined
  | ((entry: {
      level: 'debug' | 'info' | 'warn' | 'error'
      msg: string
      data?: any
    }) => void)
export function onLog(cb: typeof logSubscriber) {
  logSubscriber = cb
}

function splitAndLog(
  level: LogLevel,
  data: any,
  msg?: string,
  ...args: any[]
): void {
  const formattedMsg = format(msg ?? '', ...args)
  const availableDataLimit = MAX_LENGTH - BUFFER - formattedMsg.length

  // split data recursively into chunks small enough to log
  const processedData: any[] = splitData(data, availableDataLimit)

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

export const logger: Record<LogLevel, pino.LogFn> =
  process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev'
    ? pinoLogger
    : (Object.fromEntries(
        loggingLevels.map((level) => {
          return [
            level,
            (data: any, msg?: string, ...args: any[]) =>
              splitAndLog(level, data, msg, ...args),
          ]
        }),
      ) as Record<LogLevel, pino.LogFn>)

const orig = logger
logger.debug = (...args: any[]) => {
  try {
    IN_CI && console.debug('[backend][debug]', ...args)
  } catch {}
  try {
    logSubscriber?.({
      level: 'debug',
      msg: String(args[args.length - 1] ?? ''),
      data: args[0],
    })
  } catch {}
  return orig.debug.apply(orig, args as any)
}
logger.info = (...args: any[]) => {
  try {
    IN_CI && console.info('[backend][info]', ...args)
  } catch {}
  try {
    logSubscriber?.({
      level: 'info',
      msg: String(args[args.length - 1] ?? ''),
      data: args[0],
    })
  } catch {}
  return orig.info.apply(orig, args as any)
}
logger.warn = (...args: any[]) => {
  try {
    IN_CI && console.warn('[backend][warn]', ...args)
  } catch {}
  try {
    logSubscriber?.({
      level: 'warn',
      msg: String(args[args.length - 1] ?? ''),
      data: args[0],
    })
  } catch {}
  return orig.warn.apply(orig, args as any)
}
logger.error = (...args: any[]) => {
  try {
    IN_CI && console.error('[backend][error]', ...args)
  } catch {}
  try {
    logSubscriber?.({
      level: 'error',
      msg: String(args[args.length - 1] ?? ''),
      data: args[0],
    })
  } catch {}
  return orig.error.apply(orig, args as any)
}
