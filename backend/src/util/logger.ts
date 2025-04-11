import { AsyncLocalStorage } from 'async_hooks'
import path from 'path'
import { format } from 'util'

import pino from 'pino'

import { env } from '../env.mjs'

// --- Constants ---
const MAX_LENGTH = 100_000 // Max total log size
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

const fileTransport = pino.transport({
  target: 'pino/file',
  options: { destination: path.join(__dirname, '..', 'debug.log') },
  level: 'debug',
})

export const pinoLogger = pino(
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
  env.ENVIRONMENT === 'production' ? undefined : fileTransport
)

const loggingLevels = ['info', 'debug', 'warn', 'error', 'fatal'] as const
type LogLevel = (typeof loggingLevels)[number]

function splitData(data: any, characterLimit: number): any[] {
  // Convert to string to check size
  const dataString = JSON.stringify(data)
  if (dataString.length <= characterLimit) {
    return [data]
  }

  // Handle arrays
  if (Array.isArray(data)) {
    const chunks: any[] = []
    let currentChunk: any[] = []
    let currentChunkLength = 2 // Account for [] brackets

    for (const item of data) {
      const itemString = JSON.stringify(item)
      const itemLength = itemString.length + (currentChunk.length > 0 ? 1 : 0) // Add 1 for comma if not first item

      if (currentChunkLength + itemLength > characterLimit) {
        if (itemString.length > characterLimit) {
          // If single item is too large, recursively split it
          const splitItem = splitData(item, characterLimit - '[],'.length)
          chunks.push(...splitItem.map((subItem) => [subItem]))
        } else {
          chunks.push(currentChunk)
          currentChunk = [item]
          currentChunkLength = 2 + itemString.length
        }
      } else {
        currentChunk.push(item)
        currentChunkLength += itemLength
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk)
    }
    return chunks
  }

  // Handle objects
  if (typeof data === 'object') {
    const chunks: Record<string, any>[] = []
    let currentChunk: Record<string, any> = {}
    let currentChunkLength = 2 // Account for {} brackets

    for (const [key, value] of Object.entries(data)) {
      const entryString = JSON.stringify({ [key]: value }).slice(1, -1)
      const entryLength =
        entryString.length + (Object.keys(currentChunk).length > 0 ? 1 : 0) // Add 1 for comma if not first entry

      if (currentChunkLength + entryLength > characterLimit) {
        if (entryString.length > characterLimit) {
          // If single entry is too large, recursively split the value
          const splitValue = splitData(
            value,
            characterLimit - `{"${key}":},`.length
          )
          chunks.push(...splitValue.map((subValue) => ({ [key]: subValue })))
        } else {
          chunks.push(currentChunk)
          currentChunk = { [key]: value }
          currentChunkLength = 2 + entryString.length
        }
      } else {
        currentChunk[key] = value
        currentChunkLength += entryLength
      }
    }
    if (Object.keys(currentChunk).length > 0) {
      chunks.push(currentChunk)
    }
    return chunks
  }

  if (typeof data === 'string') {
    const chunks = []
    const stringified = JSON.stringify(data)
    let start = 0
    while (start < stringified.length) {
      let chunk: string | null = null

      let end = Math.min(start + characterLimit, stringified.length)
      while (chunk === null) {
        const candidate = stringified.slice(start, end) + '"'
        try {
          chunk = JSON.parse(candidate) as string
        } catch (e) {
          // unable to parse JSON (probably escape sequence?)
          // subtract one character and try again
          if (end === stringified.length) {
            // should never happen, just log the stringified string
            chunk = candidate
            break
          }
        }
        end -= 1
      }
      start = end

      chunks.push(chunk)
    }
    return chunks
  }

  // Handle primitive values by splitting the string
  const stringValue = String(data)
  const chunks: any[] = []
  for (let i = 0; i < stringValue.length; i += characterLimit) {
    chunks.push(stringValue.slice(i, i + characterLimit))
  }
  return chunks
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
      `${formattedMsg} (chunk ${index + 1}/${processedData.length})`
    )
  })
}

export const logger: Record<LogLevel, pino.LogFn> = Object.fromEntries(
  loggingLevels.map((level) => {
    return [
      level,
      (data: any, msg?: string, ...args: any[]) =>
        splitAndLog(level, data, msg, ...args),
    ]
  })
) as Record<LogLevel, pino.LogFn>
