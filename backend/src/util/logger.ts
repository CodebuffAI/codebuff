import pino from 'pino'
import { env } from '../env.mjs'
import { AsyncLocalStorage } from 'async_hooks'

const loggerAsyncStorage = new AsyncLocalStorage<Record<string, any>>()
export const withLoggerContext = <T>(
  additionalContext: Record<string, any>,
  fn: () => Promise<T>
) => {
  const store = loggerAsyncStorage.getStore() ?? {}
  return loggerAsyncStorage.run({ ...store, ...additionalContext }, fn)
}

export const logger = pino({
  level: 'debug',
  transport:
    env.ENVIRONMENT === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
          },
        },
  mixin() {
    return loggerAsyncStorage.getStore() ?? {}
  },
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() }
    },
  },
  timestamp: () => `,"timestamp":"${new Date(Date.now()).toISOString()}"`,
})
