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

const EVENT_LOOP_LAG_LOG_INTERVAL_MS = 60_000

/**
 * Periodic event-loop lag metric (`metric: 'event_loop_lag'`, one line per
 * instance per minute). Request-scoped timers all start after the event loop
 * dequeues the request, so a starved loop shows up as user-visible latency
 * that no handler-side metric can see — this is the instance-level signal for
 * "the web service is saturated" (2026-07 peak-hours incident).
 */
async function startEventLoopLagMonitor(): Promise<void> {
  // perf_hooks is Node-only; instrumentation also runs in the edge runtime.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { monitorEventLoopDelay, performance } = await import('perf_hooks')
  const os = await import('os')
  const host = os.hostname()

  const histogram = monitorEventLoopDelay({ resolution: 20 })
  histogram.enable()
  let lastElu = performance.eventLoopUtilization()

  const toMs = (ns: number) => Math.round(ns / 1e4) / 100

  const timer = setInterval(() => {
    // Utilization = fraction of the interval the loop spent busy (0..1).
    // Lag percentiles say "the loop stalled"; utilization says "the loop is
    // out of headroom" — the capacity-planning number.
    const elu = performance.eventLoopUtilization()
    const intervalUtilization = performance.eventLoopUtilization(
      elu,
      lastElu,
    ).utilization
    lastElu = elu
    logger.info(
      {
        metric: 'event_loop_lag',
        host,
        pid: process.pid,
        p50Ms: toMs(histogram.percentile(50)),
        p90Ms: toMs(histogram.percentile(90)),
        p99Ms: toMs(histogram.percentile(99)),
        maxMs: toMs(histogram.max),
        utilization: Math.round(intervalUtilization * 1000) / 1000,
      },
      '[EventLoop] lag over last interval',
    )
    histogram.reset()
  }, EVENT_LOOP_LAG_LOG_INTERVAL_MS)
  // Never keep the process alive just for metrics.
  timer.unref()
}

export async function register() {
  await startEventLoopLagMonitor()
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
