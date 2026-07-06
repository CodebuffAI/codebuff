import { internal } from '../../web/convex/_generated/api'
import { logger } from './logger'

import type { RunnerCtx } from './convexBridge'
import type { FreebuffRunEvent } from './harness'

// Batched replacement for the action path's createRunEventBuffer: instead of
// one Convex mutation per delta/status, EVERY event buffered over the flush
// window ships as one recordRunEventBatch call. Each mutation invalidates the
// client's streaming subscription (a re-read the browser pays for), so fewer,
// fatter mutations cut both function calls and DB I/O.
const FLUSH_INTERVAL_MS = 2000
// Quiet-run heartbeat: an empty batch bumps last_event_at so the sweep knows
// the runner is alive during long tool calls with no streamed output.
const HEARTBEAT_INTERVAL_MS = 30_000

type DeltaEvent = {
  type: 'text_delta' | 'reasoning_delta' | 'subagent_delta'
  chunk: string
  agentType?: string
}

export function createEventBatcher(params: {
  ctx: RunnerCtx
  runId: string
  projectId: string
  threadId: string
  messageId: string
}) {
  const { ctx, runId, projectId, threadId, messageId } = params

  let pending: FreebuffRunEvent[] = []
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let chain = Promise.resolve()
  let lastFlushAt = Date.now()
  let stopped = false

  const send = async (
    events: FreebuffRunEvent[],
    runStateStorageId?: string,
  ) => {
    if (events.length === 0 && runStateStorageId === undefined) {
      // Pure heartbeat.
      await ctx.runMutation(
        internal.coding_agent.freebuff_bridge_mutations.recordRunEventBatch,
        { runId, events: [] },
      )
      return
    }
    await ctx.runMutation(
      internal.coding_agent.freebuff_bridge_mutations.recordRunEventBatch,
      {
        runId,
        events: events.map((event) => ({
          runId,
          projectId,
          threadId,
          messageId,
          ...event,
        })),
        ...(runStateStorageId ? { runStateStorageId } : {}),
      },
    )
  }

  const takePending = () => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = undefined
    }
    const events = pending
    pending = []
    return events
  }

  const enqueueFlush = () => {
    if (flushTimer || stopped) return
    flushTimer = setTimeout(() => {
      flushTimer = undefined
      const events = takePending()
      lastFlushAt = Date.now()
      chain = chain
        .then(() => send(events))
        .catch((error) => {
          logger.error('stream flush failed', { runId, error })
        })
    }, FLUSH_INTERVAL_MS)
  }

  const heartbeatTimer = setInterval(() => {
    if (stopped) return
    if (Date.now() - lastFlushAt < HEARTBEAT_INTERVAL_MS) return
    lastFlushAt = Date.now()
    chain = chain
      .then(() => send([]))
      .catch((error) => {
        logger.warn('heartbeat failed', { runId, error })
      })
  }, HEARTBEAT_INTERVAL_MS)

  return {
    /** Append a streaming delta, merging into the previous chunk when the
     *  stream kind hasn't changed (one array entry per contiguous stretch). */
    appendDelta(event: DeltaEvent) {
      const last = pending.at(-1)
      if (
        last &&
        last.type === event.type &&
        last.agentType === event.agentType
      ) {
        last.chunk = (last.chunk ?? '') + event.chunk
      } else {
        pending.push({ ...event })
      }
      enqueueFlush()
    },

    /** Append a non-delta event (status, start, ...) in stream order. */
    append(event: FreebuffRunEvent) {
      pending.push(event)
      enqueueFlush()
    },

    /** Flush everything buffered so far and wait for it to land. */
    async flush() {
      const events = takePending()
      lastFlushAt = Date.now()
      if (events.length > 0) {
        chain = chain.then(() => send(events))
      }
      await chain
    },

    /** Terminal flush: everything pending plus the terminal event, in one
     *  mutation, carrying the persisted run-state pointer. Stops timers. */
    async finish(event: FreebuffRunEvent, runStateStorageId?: string) {
      stopped = true
      clearInterval(heartbeatTimer)
      const events = [...takePending(), event]
      lastFlushAt = Date.now()
      chain = chain.then(() => send(events, runStateStorageId))
      await chain
    },

    /** Stop timers without emitting a terminal event (requeue/cancel paths). */
    async stop() {
      stopped = true
      clearInterval(heartbeatTimer)
      const events = takePending()
      if (events.length > 0) {
        chain = chain.then(() => send(events))
      }
      await chain.catch(() => {})
    },
  }
}

export type EventBatcher = ReturnType<typeof createEventBatcher>
