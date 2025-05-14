import { AsyncLocalStorage } from 'async_hooks'
import { mkdirSync } from 'fs'
import path from 'path'
import { format } from 'util'

import pino from 'pino'

import { env } from '../env.mjs'
import { splitData } from './split-data'

// --- Constants ---
const MAX_LENGTH = 65535 // Max total log size is sometimes 100k (sometimes 65535?)
const BUFFER = 1000 // Buffer for context, etc.

export interface LoggerContext {
  userId?: string
  userEmail?: string
  clientSessionId?: string
  fingerprintId?: string
  clientRequestId?: string
  messageId?: string
  discordId?: string
  [key: string]: any // Allow for future extensions
}

const loggerAsyncStorage = new AsyncLocalStorage<LoggerContext>()

export const withLoggerContext = <T>(
  additionalContext: Partial<LoggerContext>,
  fn: () => Promise<T>
) => {
  const store = loggerAsyncStorage.getStore() ?? {}
  return loggerAsyncStorage.run({ ...store, ...additionalContext }, fn)
}

// Ensure debug directory exists for local environment
const debugDir = path.join(__dirname, '../../../debug')
if (
  env.NEXT_PUBLIC_CB_ENVIRONMENT === 'local' &&
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
      return { logTrace: loggerAsyncStorage.getStore() }
    },
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() }
      },
    },
    timestamp: () => `,"timestamp":"${new Date(Date.now()).toISOString()}"`,
  },
  env.NEXT_PUBLIC_CB_ENVIRONMENT === 'local' &&
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
  process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'local'
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
