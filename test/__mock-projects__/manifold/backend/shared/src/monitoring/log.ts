import { format } from 'node:util'
import { isError, pick, omit } from 'lodash'
import { dim, red, yellow } from 'colors/safe'
import { getMonitoringContext } from './context'

// mapping JS log levels (e.g. functions on console object) to GCP log levels
const JS_TO_GCP_LEVELS = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
} as const

const JS_LEVELS = Object.keys(JS_TO_GCP_LEVELS) as LogLevel[]
const DEFAULT_LEVEL = 'info'
const IS_GCP = process.env.GOOGLE_CLOUD_PROJECT != null

// keys to put in front to categorize a log line in the console
const DISPLAY_CATEGORY_KEYS = ['endpoint', 'job'] as const

// keys to ignore when printing out log details in the console
const DISPLAY_EXCLUDED_KEYS = ['traceId', 'baseEndpoint'] as const

export type LogLevel = keyof typeof JS_TO_GCP_LEVELS
export type LogDetails = Record<string, unknown>
export type TextLogger = (msg: unknown, ...args: unknown[]) => void
export type StructuredLogger = (msg: unknown, props?: LogDetails) => void
export type Logger = TextLogger & {
  [Property in LogLevel]: StructuredLogger
}

function toString(obj: unknown) {
  if (isError(obj)) {
    return obj.stack ?? obj.message // stack is formatted like "Error: message\n[stack]"
  } else {
    return String(obj)
  }
}

function replacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') {
    return value.toString()
  } else if (isError(value)) {
    return {
      // custom enumerable properties on error, like e.g. status code on APIErrors
      ...value,
      // these properties aren't enumerable so we need to include them explicitly
      // see https://stackoverflow.com/questions/18391212/
      name: value.name,
      message: value.message,
      stack: value.stack,
    }
  } else {
    return value
  }
}

function ts() {
  return `[${new Date().toISOString()}]`
}

// handles both the cases where someone wants to write unstructured
// stream-of-consciousness console logging like log('count:', 1, 'user': u)
// and also structured key/value logging with severity
function writeLog(
  level: LogLevel,
  msg: unknown,
  opts?: { props?: LogDetails; rest?: unknown[] }
) {
  try {
    const { props, rest } = opts ?? {}
    const contextData = getMonitoringContext()
    const message = format(toString(msg), ...(rest ?? []))
    const data = { ...(contextData ?? {}), ...(props ?? {}) }
    if (IS_GCP) {
      const severity = JS_TO_GCP_LEVELS[level]
      const output: LogDetails = { severity, message, ...data }
      if (msg instanceof Error) {
        // record error properties in GCP if you just do log(err)
        output['error'] = msg
      }
      console.log(JSON.stringify(output, replacer))
    } else {
      const category = Object.values(pick(data, DISPLAY_CATEGORY_KEYS)).join()
      const categoryLabel = category ? dim(category) + ' ' : ''
      const details = Object.entries(
        omit(data, [...DISPLAY_CATEGORY_KEYS, ...DISPLAY_EXCLUDED_KEYS])
      ).map(([key, value]) => `\n  ${key}: ${JSON.stringify(value)}`)
      const result = `${dim(ts())} ${categoryLabel}${message}${details}`
      if (level === 'error') {
        return console.error(red(result))
      } else if (level === 'warn') {
        return console.warn(yellow(result))
      } else if (level === 'debug') {
        return console.debug(dim(result))
      } else {
        return console[level](result)
      }
    }
  } catch (e) {
    console.error('Could not write log output.', e)
  }
}

export function getLogger(): Logger {
  const logger = ((msg: unknown, ...rest: unknown[]) =>
    writeLog(DEFAULT_LEVEL, msg, { rest })) as Logger
  for (const level of JS_LEVELS) {
    logger[level] = (msg: unknown, props?: LogDetails) =>
      writeLog(level, msg, { props })
  }
  return logger
}

export const log = getLogger()
