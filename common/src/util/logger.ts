import type { AsyncLocalStorage as NodeAsyncLocalStorage } from 'async_hooks'
import path from 'path'

import pino from 'pino'

import { env } from '@/env'

let AsyncLocalStorageImpl: typeof import('async_hooks').AsyncLocalStorage | null
try {
  // Load AsyncLocalStorage via require
  AsyncLocalStorageImpl = require('async_hooks').AsyncLocalStorage
} catch {
  AsyncLocalStorageImpl = null
}

// Create a no‑op shim when AsyncLocalStorage isn't present
const loggerAsyncStorage =
  AsyncLocalStorageImpl !== null
    ? new AsyncLocalStorageImpl<LoggerContext>()
    : {
        // run() just executes fn without context tracking
        run: <R, A extends any[]>(_: any, fn: (...args: A) => R, ...args: A) =>
          fn(...args),
        getStore: () => undefined,
      }

export interface LoggerContext {
  userId?: string
  userEmail?: string
  clientSessionId?: string
  [key: string]: any // Allow for future extensions
}

export const withLoggerContext = <T>(
  additionalContext: Partial<LoggerContext>,
  fn: () => Promise<T>
) => {
  const store = (loggerAsyncStorage.getStore?.() ?? {}) as LoggerContext
  // Cast to Node's AsyncLocalStorage to resolve overload mismatch
  return (loggerAsyncStorage as NodeAsyncLocalStorage<LoggerContext>).run(
    { ...store, ...additionalContext },
    fn
  )
}

// Only use file transport when not running in Edge/browser‑like env
const runningInEdge = process.env.NEXT_RUNTIME === 'edge'
const fileTransport =
  !runningInEdge && env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod'
    ? pino.transport({
        target: 'pino/file',
        options: { destination: path.join(__dirname, '..', 'debug.log') },
        level: 'debug',
      })
    : undefined

export const logger = pino(
  {
    level: 'debug',
    mixin() {
      // If AsyncLocalStorage isn't available, return undefined
      return { logTrace: loggerAsyncStorage.getStore?.() }
    },
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  },
  fileTransport
)
