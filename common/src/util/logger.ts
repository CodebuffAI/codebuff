import pino from 'pino'
import path from 'path'
import { AsyncLocalStorage } from 'async_hooks'
import { env } from '../env.mjs'

export interface LoggerContext {
  userId?: string
  userEmail?: string
  clientSessionId?: string
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

export const logger = pino(
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
