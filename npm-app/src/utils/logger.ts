import { AsyncLocalStorage } from 'async_hooks'
import path from 'path'
import { format as stringFormat } from 'util'

import { AnalyticsEvent } from 'common/constants/analytics-events'
import pino from 'pino'
import { getCurrentChatDir } from 'src/project-files'

import { trackEvent } from './analytics'

export interface LoggerContext {
  userId?: string
  userEmail?: string
  clientSessionId?: string
  fingerprintId?: string
  clientRequestId?: string
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

const localFileTransport = pino.transport({
  target: 'pino/file',
  options: {
    destination: path.join(__dirname, '../../../debug', 'npm-app.log'),
  },
  level: 'debug',
})

const productionFileTransport = pino.transport({
  target: 'pino/file',
  options: { destination: path.join(getCurrentChatDir(), 'log.jsonl') },
  level: 'debug',
})

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
  process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'production'
    ? productionFileTransport
    : localFileTransport
)

const loggingLevels = ['info', 'debug', 'warn', 'error', 'fatal'] as const
type LogLevel = (typeof loggingLevels)[number]

function sendAnalyticsAndLog(
  level: LogLevel,
  data: any,
  msg?: string,
  ...args: any[]
): void {
  if (Object.values(AnalyticsEvent).includes(data.eventId)) {
    trackEvent(data.eventId as AnalyticsEvent, {
      ...data,
      level,
      msg: stringFormat(msg, ...args),
    })
  }

  pinoLogger[level](data, msg, ...args)
}

/**
 * Wrapper around Pino logger.
 *
 * To also send to Posthog, set data.eventId to type AnalyticsEvent
 *
 * e.g. logger.info({eventId: AnalyticsEvent.SOME_EVENT, data: otherData}, 'some message')
 */
export const logger: Record<LogLevel, pino.LogFn> =
  process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'local'
    ? pinoLogger
    : (Object.fromEntries(
        loggingLevels.map((level) => {
          return [
            level,
            (data: any, msg?: string, ...args: any[]) =>
              sendAnalyticsAndLog(level, data, msg, ...args),
          ]
        })
      ) as Record<LogLevel, pino.LogFn>)
