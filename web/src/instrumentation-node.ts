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
import {
  constants,
  monitorEventLoopDelay,
  PerformanceObserver,
  performance,
} from 'node:perf_hooks'

import { logger } from '@/util/logger'

const EVENT_LOOP_LAG_LOG_INTERVAL_MS = 60_000

/**
 * Garbage-collection pauses accumulated since the last metric flush. GC runs
 * synchronously on the main thread, so a long old-generation GC on a large
 * heap freezes the whole instance — it's the prime suspect for the multi-second
 * `maxMs` spikes seen in `event_loop_lag`. Tracking it here tells us whether
 * those stalls are GC (→ heap/allocation problem, tune --max-old-space-size /
 * reduce large transient allocations) or synchronous app work (→ something
 * like JSON.stringify of a huge payload on the hot path).
 *
 * `totalMs`/`maxMs`/`count` cover ALL GC kinds — that's the primary "was the
 * worst stall GC?" signal. `oldGen*` isolates the non-scavenge collections
 * (mark-compact + incremental marking + weak-callback phases); those are the
 * ones that actually block for a while. We deliberately don't key only on
 * `NODE_PERFORMANCE_GC_MAJOR`: a long old-space collection can be reported as a
 * run of INCREMENTAL entries plus a MAJOR finalizer, so a MAJOR-only counter
 * would log 0 during an incremental-marking stall and wrongly clear GC.
 * Scavenge (MINOR) is the cheap young-gen collection and is excluded.
 */
type GcAccumulator = {
  count: number
  totalMs: number
  maxMs: number
  oldGenCount: number
  oldGenMs: number
}

function newGcAccumulator(): GcAccumulator {
  return { count: 0, totalMs: 0, maxMs: 0, oldGenCount: 0, oldGenMs: 0 }
}

/**
 * Periodic event-loop lag metric (`metric: 'event_loop_lag'`, one line per
 * instance per minute). Request-scoped timers all start after the event loop
 * dequeues the request, so a starved loop shows up as user-visible latency
 * that no handler-side metric can see — this is the instance-level signal for
 * "the web service is saturated" (2026-07 peak-hours incident). Also carries
 * per-interval GC-pause totals to attribute the loop's worst stalls.
 */
export function startEventLoopLagMonitor(): void {
  const host = os.hostname()

  const histogram = monitorEventLoopDelay({ resolution: 20 })
  histogram.enable()
  let lastElu = performance.eventLoopUtilization()

  let gc = newGcAccumulator()
  const gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      gc.count += 1
      gc.totalMs += entry.duration
      if (entry.duration > gc.maxMs) gc.maxMs = entry.duration
      // entry.detail.kind is a NODE_PERFORMANCE_GC_* constant. Everything that
      // isn't a young-gen Scavenge (MINOR) is old-gen work that can block for a
      // while — mark-compact (MAJOR), incremental marking, weak callbacks.
      const kind = (entry as unknown as { detail?: { kind?: number } }).detail
        ?.kind
      if (kind !== undefined && kind !== constants.NODE_PERFORMANCE_GC_MINOR) {
        gc.oldGenCount += 1
        gc.oldGenMs += entry.duration
      }
    }
  })
  // buffered so we don't wake the loop per-GC; flushed on our interval.
  gcObserver.observe({ entryTypes: ['gc'], buffered: true })

  const toMs = (ns: number) => Math.round(ns / 1e4) / 100
  const round2 = (ms: number) => Math.round(ms * 100) / 100

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

    const gcSnapshot = gc
    gc = newGcAccumulator()

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
        // GC pause attribution for the interval. Compare magnitudes, not exact
        // values: `maxMs` is the loop's scheduling delay (sampled at the 20ms
        // histogram resolution) and `gcMaxMs` is the raw span of the longest GC,
        // so a GC-dominated interval shows gcMaxMs on the same order as maxMs
        // rather than identical. gcOldGenMs isolates the blocking old-gen work.
        gcCount: gcSnapshot.count,
        gcTotalMs: round2(gcSnapshot.totalMs),
        gcMaxMs: round2(gcSnapshot.maxMs),
        gcOldGenCount: gcSnapshot.oldGenCount,
        gcOldGenMs: round2(gcSnapshot.oldGenMs),
      },
      '[EventLoop] lag over last interval',
    )
    histogram.reset()
  }, EVENT_LOOP_LAG_LOG_INTERVAL_MS)
  // Never keep the process alive just for metrics.
  timer.unref()
}
