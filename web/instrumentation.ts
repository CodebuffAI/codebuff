/**
 * Next.js Instrumentation
 *
 * This file runs once when the server starts and sets up global error handlers
 * to catch unhandled promise rejections and uncaught exceptions.
 *
 * Without these handlers, unhandled errors can crash the Node.js process,
 * causing Render's proxy to return 502 Bad Gateway errors.
 */

import { logger } from '@/util/logger'

export function register() {
  // Handle unhandled promise rejections (async errors that aren't caught)
  process.on(
    'unhandledRejection',
    (reason: unknown, promise: Promise<unknown>) => {
      logger.error(
        {
          reason:
            reason instanceof Error
              ? { message: reason.message, stack: reason.stack }
              : reason,
          promise: String(promise),
        },
        '[CRITICAL] Unhandled Promise Rejection',
      )
      // Don't exit - let the process continue to handle other requests
      // In production, Render will restart if there's a real crash
    },
  )

  // Handle uncaught exceptions (sync errors that aren't caught)
  process.on('uncaughtException', (error: Error, origin: string) => {
    logger.error(
      {
        message: error.message,
        stack: error.stack,
        origin,
      },
      '[CRITICAL] Uncaught Exception',
    )
    // Don't exit - let the process continue to handle other requests
    // This prevents a single bad request from taking down the entire server
  })

  logger.info({}, '[Instrumentation] Global error handlers registered')
}
