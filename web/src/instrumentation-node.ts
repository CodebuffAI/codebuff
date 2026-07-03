/**
 * Node-only instrumentation.
 *
 * This module is imported *only* from `register()` when
 * `process.env.NEXT_RUNTIME === 'nodejs'`. Keeping the Node built-in imports
 * (`perf_hooks`, `os`) out of `instrumentation.ts` prevents Next.js from trying
 * to resolve them while compiling the Edge-runtime bundle, which would fail with
 * "Module not found: Can't resolve 'os'".
 */

import os from 'node:os'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'

import { logger } from '@/util/logger'

const EVENT_LOOP_LAG_LOG_INTERVAL_MS = 60_000

/**
 * Periodic event-loop lag metric (`metric: 'event_loop_lag'`, one line per
 * instance per minute). Request-scoped timers all start after the event loop
 * dequeues the request, so a starved loop shows up as user-visible latency
 * that no handler-side metric can see — this is the instance-level signal for
 * "the web service is saturated" (2026-07 peak-hours incident).
 */
export function startEventLoopLagMonitor(): void {
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
