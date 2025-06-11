import { mkdirSync } from 'fs'
import path, { dirname } from 'path'
import { format as stringFormat } from 'util'

import { AnalyticsEvent } from 'common/constants/analytics-events'
import { pino } from 'pino'

import { getCurrentChatDir } from '../project-files'
import { flushAnalytics, logError, trackEvent } from './analytics'

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

function setLogPath(p: string): void {
  if (logPath === p) {
    return
  }

  logPath = p
  mkdirSync(dirname(p), { recursive: true })
  pinoLogger = pino(
    {
      level: 'debug',
      formatters: {
        level: (label) => {
          return { level: label.toUpperCase() }
        },
      },
      timestamp: () => `,"timestamp":"${new Date(Date.now()).toISOString()}"`,
    },
    pino.transport({
      target: 'pino/file',
      options: { destination: p },
      level: 'debug',
    })
  )
}

function sendAnalyticsAndLog(
  level: LogLevel,
  data: any,
  msg?: string,
  ...args: any[]
): void {
  if (process.env.CODEBUFF_GITHUB_ACTIONS !== 'true') {
    setLogPath(
      process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev'
        ? path.join(__dirname, '../../../debug', 'npm-app.log')
        : path.join(getCurrentChatDir(), 'log.jsonl')
    )
  }

  const toTrack = {
    data,
    level,
    loggerContext,
    msg: stringFormat(msg, ...args),
  }

  logAsErrorIfNeeded(toTrack)

  logOrStore: if (
    process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'dev' &&
    Object.values(AnalyticsEvent).includes(data.eventId)
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
    pinoLogger[level]({ ...loggerContext, data }, msg, ...args)
  }
}

function logAsErrorIfNeeded(toTrack: {
  data: any
  level: LogLevel
  loggerContext: LoggerContext
  msg: string
}) {
  if (toTrack.level === 'error' || toTrack.level === 'fatal') {
    logError(
      new Error(toTrack.msg),
      toTrack.loggerContext.userId ?? 'unknown',
      { ...toTrack.data, context: toTrack.loggerContext }
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
  })
) as Record<LogLevel, pino.LogFn>
