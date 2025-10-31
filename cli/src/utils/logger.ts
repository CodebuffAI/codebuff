import { existsSync, mkdirSync, unlinkSync } from 'fs'
import path, { dirname } from 'path'
import { format as stringFormat } from 'util'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { env } from '@codebuff/common/env'
import { pino } from 'pino'

import { flushAnalytics, logError, trackEvent } from './analytics'
import { getCurrentChatDir, getProjectRoot } from '../project-files'

export interface LoggerContext {
  userId?: string
  userEmail?: string
  clientSessionId?: string
  fingerprintId?: string
  clientRequestId?: string
  [key: string]: any // Allow for future extensions
}

export const loggerContext: LoggerContext = {}

const analyticsBuffer: { analyticsEventId: AnalyticsEvent; toTrack: any }[] = []

let logPath: string | undefined = undefined
let pinoLogger: any = undefined

const loggingLevels = ['info', 'debug', 'warn', 'error', 'fatal'] as const
type LogLevel = (typeof loggingLevels)[number]

function isEmptyObject(value: any): boolean {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  )
}

function setLogPath(p: string): void {
  if (p === logPath) return // nothing to do

  logPath = p
  mkdirSync(dirname(p), { recursive: true })

  // ──────────────────────────────────────────────────────────────
  //  pino.destination(..) → SonicBoom stream, no worker thread
  // ──────────────────────────────────────────────────────────────
  const fileStream = pino.destination({
    dest: p, // absolute or relative file path
    mkdir: true, // create parent dirs if they don’t exist
    sync: false, // set true if you *must* block on every write
  })

  pinoLogger = pino(
    {
      level: 'debug',
      formatters: {
        level: (label) => ({ level: label.toUpperCase() }),
      },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    },
    fileStream, // <-- no worker thread involved
  )
}

export function clearLogFile(): void {
  const projectRoot = getProjectRoot() || process.cwd()
  const defaultLog = path.join(projectRoot, 'debug', 'cli.log')
  const targets = new Set<string>()

  if (logPath) {
    targets.add(logPath)
  }
  targets.add(defaultLog)

  for (const target of targets) {
    try {
      if (existsSync(target)) {
        unlinkSync(target)
      }
    } catch {
      // Ignore errors when clearing logs
    }
  }

  logPath = undefined
  pinoLogger = undefined
}

function sendAnalyticsAndLog(
  level: LogLevel,
  data: any,
  msg?: string,
  ...args: any[]
): void {
  if (
    process.env.CODEBUFF_GITHUB_ACTIONS !== 'true' &&
    env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'test'
  ) {
    const projectRoot = getProjectRoot() || process.cwd()

    const logTarget =
      env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev'
        ? path.join(projectRoot, 'debug', 'cli.log')
        : (() => {
            try {
              return path.join(getCurrentChatDir(), 'log.jsonl')
            } catch {
              return path.join(projectRoot, 'debug', 'cli.log')
            }
          })()

    setLogPath(logTarget)
  }

  const isStringOnly = typeof data === 'string' && msg === undefined
  const normalizedData = isStringOnly ? undefined : data
  const normalizedMsg = isStringOnly ? (data as string) : msg
  const includeData = normalizedData != null && !isEmptyObject(normalizedData)

  const toTrack = {
    ...(includeData ? { data: normalizedData } : {}),
    level,
    loggerContext,
    msg: stringFormat(normalizedMsg, ...args),
  }

  logAsErrorIfNeeded(toTrack)

  logOrStore: if (
    env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'dev' &&
    normalizedData &&
    typeof normalizedData === 'object' &&
    'eventId' in normalizedData &&
    Object.values(AnalyticsEvent).includes((normalizedData as any).eventId)
  ) {
    const analyticsEventId = data.eventId as AnalyticsEvent
    // Not accurate for anonymous users
    if (!loggerContext.userId) {
      analyticsBuffer.push({ analyticsEventId, toTrack })
      break logOrStore
    }

    for (const item of analyticsBuffer) {
      trackEvent(item.analyticsEventId, item.toTrack)
    }
    analyticsBuffer.length = 0
    trackEvent(analyticsEventId, toTrack)
  }

  if (pinoLogger !== undefined) {
    const base = { ...loggerContext }
    const obj = includeData ? { ...base, data: normalizedData } : base
    pinoLogger[level](obj, normalizedMsg as any, ...args)
  }
}

function logAsErrorIfNeeded(toTrack: {
  data?: any
  level: LogLevel
  loggerContext: LoggerContext
  msg: string
}) {
  if (toTrack.level === 'error' || toTrack.level === 'fatal') {
    logError(
      new Error(toTrack.msg),
      toTrack.loggerContext.userId ?? 'unknown',
      { ...(toTrack.data ?? {}), context: toTrack.loggerContext },
    )
    flushAnalytics()
  }
}

/**
 * Wrapper around Pino logger.
 *
 * To also send to Posthog, set data.eventId to type AnalyticsEvent
 *
 * e.g. logger.info({eventId: AnalyticsEvent.SOME_EVENT, field: value}, 'some message')
 */
export const logger: Record<LogLevel, pino.LogFn> = Object.fromEntries(
  loggingLevels.map((level) => {
    return [
      level,
      (data: any, msg?: string, ...args: any[]) =>
        sendAnalyticsAndLog(level, data, msg, ...args),
    ]
  }),
) as Record<LogLevel, pino.LogFn>
