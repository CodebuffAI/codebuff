import fs from 'fs'
import path from 'path'
import { format } from 'util'

import { env } from '@codebuff/common/env'
import { splitData } from '@codebuff/common/util/split-data'
import pino from 'pino'

// --- Constants ---
const MAX_LENGTH = 65535 // Max total log size is sometimes 100k (sometimes 65535?)
const BUFFER = 1000 // Buffer for context, etc.

// Ensure debug directory exists for local environment
let debugDir: string | null | undefined
function getDebugDir(): string | null {
  if (debugDir !== undefined) {
    return debugDir
  }
  debugDir = __dirname
  while (true) {
    if (fs.existsSync(path.join(debugDir, '.git'))) {
      break
    }
    const parent = path.dirname(debugDir)
    if (parent === debugDir) {
      debugDir = null
      console.error('Failed to find git root directory for logger')
      break
    }
    debugDir = parent
  }

  if (debugDir) {
    debugDir = path.join(debugDir, 'debug')
  }

  return debugDir
}

setLocalDebugDir: if (
  env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev' &&
  process.env.CODEBUFF_GITHUB_ACTIONS !== 'true'
) {
  const debugDir = getDebugDir()
  if (!debugDir) {
    break setLocalDebugDir
  }

  try {
    fs.mkdirSync(debugDir, { recursive: true })
  } catch (err) {
    console.error('Failed to create debug directory:', err)
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
    ? pino.transport({
        target: 'pino/file',
        options: {
          destination: path.join(debugDir, 'web.log'),
        },
        level: 'debug',
      })
    : undefined,
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

export const logger: Record<LogLevel, pino.LogFn> =
  env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev'
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
