import pino from 'pino'
import path from 'path'
import { AsyncLocalStorage } from 'async_hooks'
import { env } from '../env.mjs'

const loggerAsyncStorage = new AsyncLocalStorage<Record<string, any>>()
export const withLoggerContext = <T>(
  additionalContext: Record<string, any>,
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

const consoleTransport = pino.transport({
  target: 'pino-pretty',
  options: {
    colorize: true,
    levelFirst: true,
  },
})

export const logger = pino(
  {
    level: 'debug',
    mixin() {
      return { ...loggerAsyncStorage.getStore() }
    },
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() }
      },
    },
    timestamp: () => `,"timestamp":"${new Date(Date.now()).toISOString()}"`,
  },
  env.ENVIRONMENT === 'production' ? undefined : consoleTransport // fileTransport
)
