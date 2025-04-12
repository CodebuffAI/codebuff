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

type Chunk = any
type PlainObject = Record<string, any>

function isPlainObject(val: any): val is PlainObject {
  return (
    typeof val === 'object' &&
    val !== null &&
    Object.getPrototypeOf(val) === Object.prototype
  )
}

function getJsonSize(val: any): number {
  return JSON.stringify(val).length
}

function splitString(str: string, maxSize: number): string[] {
  const chunks: string[] = []
  let current = ''

  // Account for JSON string quotes
  const actualMaxSize = maxSize - 2

  for (let i = 0; i < str.length; i++) {
    if (current.length >= actualMaxSize) {
      chunks.push(current)
      current = ''
    }
    current += str[i]
  }

  if (current) {
    chunks.push(current)
  }

  return chunks.length ? chunks : [str]
}

function splitNestedObject(obj: PlainObject, maxSize: number): PlainObject[] {
  const chunks: PlainObject[] = []

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue

    // Calculate overhead for this key in an object
    const keyOverhead = getJsonSize({ [key]: '' }) - 2

    if (isPlainObject(value)) {
      // For nested objects, we need to account for the additional nesting overhead
      const nestedMaxSize = maxSize - keyOverhead
      const nestedChunks = splitNestedObject(value, nestedMaxSize)

      for (const nested of nestedChunks) {
        const chunk = { [key]: nested }
        if (getJsonSize(chunk) <= maxSize) {
          chunks.push(chunk)
        }
      }
    } else if (typeof value === 'string') {
      // For strings, split if needed
      const stringMaxSize = maxSize - keyOverhead
      const stringChunks = splitString(value, stringMaxSize)

      for (const str of stringChunks) {
        const chunk = { [key]: str }
        if (getJsonSize(chunk) <= maxSize) {
          chunks.push(chunk)
        }
      }
    } else {
      // For other values (numbers, booleans), try to add as-is
      const chunk = { [key]: value }
      if (getJsonSize(chunk) <= maxSize) {
        chunks.push(chunk)
      }
    }
  }

  // If no chunks were created (everything was too big), at least try to split the first property
  if (chunks.length === 0 && Object.keys(obj).length > 0) {
    const [[firstKey, firstValue]] = Object.entries(obj)
    if (typeof firstValue === 'string') {
      const keyOverhead = getJsonSize({ [firstKey]: '' }) - 2
      const stringMaxSize = maxSize - keyOverhead
      const stringChunks = splitString(firstValue, stringMaxSize)
      for (const str of stringChunks) {
        const chunk = { [firstKey]: str }
        if (getJsonSize(chunk) <= maxSize) {
          chunks.push(chunk)
        }
      }
    }
  }

  return chunks
}

function splitArray(arr: any[], maxSize: number): any[][] {
  const chunks: any[][] = []
  let currentChunk: any[] = []

  // Account for array brackets and commas
  const itemMaxSize = maxSize - 4

  for (const item of arr) {
    if (isPlainObject(item)) {
      // For objects in arrays, split them independently
      const objectChunks = splitNestedObject(item, itemMaxSize)
      for (const chunk of objectChunks) {
        if (getJsonSize([chunk]) <= maxSize) {
          chunks.push([chunk])
        }
      }
    } else if (typeof item === 'string') {
      // For strings, split if needed
      const stringChunks = splitString(item, itemMaxSize)
      for (const str of stringChunks) {
        if (getJsonSize([str]) <= maxSize) {
          chunks.push([str])
        }
      }
    } else {
      // For other values, try to add as-is
      const newChunk = [item]
      if (getJsonSize(newChunk) <= maxSize) {
        chunks.push(newChunk)
      }
    }
  }

  return chunks
}

export function splitData(data: any, maxChunkSize = 99_000): Chunk[] {
  // Handle primitives
  if (typeof data !== 'object' || data === null) {
    if (typeof data === 'string') {
      const result = splitString(data, maxChunkSize)
      return result
    }
    return [data]
  }

  // Non-plain objects (Date, RegExp, etc.)
  if (!Array.isArray(data) && !isPlainObject(data)) {
    return [data]
  }

  // Arrays
  if (Array.isArray(data)) {
    const result = splitArray(data, maxChunkSize)
    return result
  }

  // Plain objects
  const result = splitNestedObject(data, maxChunkSize)
  return result
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

export const logger: Record<LogLevel, pino.LogFn> =
  process.env.ENVIRONMENT === 'local'
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
