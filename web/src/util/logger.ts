import fs from 'fs'
import path from 'path'
import { format } from 'util'

import { splitData } from '@codebuff/common/util/split-data'
import { env } from '@codebuff/internal'
import pino from 'pino'

// --- Constants ---
const MAX_LENGTH = 65535 // Max total log size is sometimes 100k (sometimes 65535?)
const BUFFER = 1000 // Buffer for context, etc.

// Ensure debug directory exists for local environment
const debugDir = path.join(__dirname, '../../../debug')
if (
  env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev' &&
  process.env.CODEBUFF_GITHUB_ACTIONS !== 'true'
) {
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
  env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev' &&
    process.env.CODEBUFF_GITHUB_ACTIONS !== 'true'
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
