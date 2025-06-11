import { AsyncLocalStorage } from 'async_hooks'
import { mkdirSync } from 'fs'
import path from 'path'
import { format } from 'util'

import pino from 'pino'

import { env } from '@/env'
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
  fn: () => Promise<T>
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
    : undefined
)

const loggingLevels = ['info', 'debug', 'warn', 'error', 'fatal'] as const
type LogLevel = (typeof loggingLevels)[number]

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
      `${formattedMsg} (chunk ${index + 1}/${processedData.length})`
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
        })
      ) as Record<LogLevel, pino.LogFn>)
