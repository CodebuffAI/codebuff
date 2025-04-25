import path from 'path'
import { format as stringFormat } from 'util'

import { AnalyticsEvent } from 'common/constants/analytics-events'
import pino from 'pino'

import { getCurrentChatDir, getProjectRoot } from '../project-files'
import { trackEvent } from './analytics'

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

const localFileTransport = pino.transport({
  target: 'pino/file',
  options: {
    destination: path.join(__dirname, '../../../debug', 'npm-app.log'),
  },
  level: 'debug',
})

let productionFileTransport: any
let storedDir: string | undefined

let pinoLogger = pino(
  {
    level: 'debug',
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() }
      },
    },
    timestamp: () => `,"timestamp":"${new Date(Date.now()).toISOString()}"`,
  },
  localFileTransport
)

const loggingLevels = ['info', 'debug', 'warn', 'error', 'fatal'] as const
type LogLevel = (typeof loggingLevels)[number]

function sendAnalyticsAndLog(
  level: LogLevel,
  data: any,
  msg?: string,
  ...args: any[]
): void {
  if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'production') {
    return
  }
  if (
    (!productionFileTransport || storedDir !== getProjectRoot()) &&
    process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'production'
  ) {
    productionFileTransport = pino.transport({
      target: 'pino/file',
      options: { destination: path.join(getCurrentChatDir(), 'log.jsonl') },
      level: 'debug',
    })

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
      productionFileTransport
    )
  }

  logOrStore: if (Object.values(AnalyticsEvent).includes(data.eventId)) {
    const analyticsEventId = data.eventId as AnalyticsEvent
    const toTrack = {
      data,
      level,
      loggerContext,
      msg: stringFormat(msg, ...args),
    }

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

  pinoLogger[level]({ ...loggerContext, data }, msg, ...args)
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
