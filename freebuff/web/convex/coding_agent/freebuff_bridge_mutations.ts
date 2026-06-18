import { v } from 'convex/values'
import { internalMutation } from '../_generated/server'
import { Id } from '../_generated/dataModel'

type AssistantStreamItem = {
  type: string
  title?: string
  status?: string
  content: string
  description?: string
}

const TERMINAL_RUN_STATUSES = new Set([
  'completed',
  'paused',
  'error',
  'timed_out',
  'cancelled',
])

const RUN_TRACKING_EVENT_TYPES = new Set([
  'status',
  'final',
  'ask_user_pause',
  'time_limit_pause',
  'error',
])

const RUN_HEARTBEAT_INTERVAL_MS = 30_000

async function recordDailyUsage(
  ctx: any,
  args: {
    userId: Id<'users'>
    meteredCredits: number
    status: 'completed' | 'paused' | 'error' | 'timed_out'
    now: number
  },
) {
  const day = new Date(args.now).toISOString().slice(0, 10)
  const existing = await ctx.db
    .query('freebuff_daily_usage')
    .withIndex('by_user_day', (q: any) =>
      q.eq('user_id', args.userId).eq('day', day),
    )
    .unique()

  const errorIncrement = args.status === 'error' ? 1 : 0
  const timedOutIncrement = args.status === 'timed_out' ? 1 : 0
  if (existing) {
    await ctx.db.patch(existing._id, {
      run_count: existing.run_count + 1,
      metered_credits: existing.metered_credits + args.meteredCredits,
      error_count: existing.error_count + errorIncrement,
      timed_out_count: existing.timed_out_count + timedOutIncrement,
      last_run_at: args.now,
    })
    return
  }

  await ctx.db.insert('freebuff_daily_usage', {
    user_id: args.userId,
    day,
    run_count: 1,
    metered_credits: args.meteredCredits,
    error_count: errorIncrement,
    timed_out_count: timedOutIncrement,
    last_run_at: args.now,
  })
}

function appendOrMergeStreamItem(
  assistantStream: AssistantStreamItem[],
  item: AssistantStreamItem,
) {
  if (!item.content) return

  const previous = assistantStream[assistantStream.length - 1]
  const canMerge =
    previous &&
    previous.type === item.type &&
    previous.title === item.title &&
    previous.status === item.status &&
    previous.description === item.description &&
    (item.type === 'text' ||
      item.type === 'reasoning' ||
      item.type === 'subagent')

  if (canMerge) {
    previous.content += item.content
    return
  }

  assistantStream.push(item)
}

function compactAssistantStream(items: AssistantStreamItem[]) {
  const compacted: AssistantStreamItem[] = []
  for (const item of items) {
    appendOrMergeStreamItem(compacted, { ...item })
  }
  return compacted
}

export const recordRunEvent = internalMutation({
  args: {
    event: v.any(),
    runStateStorageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const event = args.event as any
    const now = Date.now()
    // Streaming deltas update the assistant message below, but do not need to
    // read or write the run ledger. Tool/status events act as run heartbeats.
    if (event.runId && RUN_TRACKING_EVENT_TYPES.has(event.type)) {
      const runDoc = await ctx.db
        .query('freebuff_agent_runs')
        .withIndex('by_run_id', (q) => q.eq('run_id', String(event.runId)))
        .unique()

      if (runDoc && !TERMINAL_RUN_STATUSES.has(runDoc.status)) {
        const runPatch: Record<string, any> = { last_event_at: now }
        const meteredCredits = Math.max(0, Number(event.meteredCredits ?? 0))
        const shouldPatchRun =
          event.type !== 'status' ||
          now - (runDoc.last_event_at ?? 0) >= RUN_HEARTBEAT_INTERVAL_MS
        let terminalStatus:
          | 'completed'
          | 'paused'
          | 'error'
          | 'timed_out'
          | undefined
        if (event.type === 'final') {
          runPatch.status = 'completed'
          runPatch.completed_at = now
          terminalStatus = 'completed'
        } else if (event.type === 'ask_user_pause') {
          runPatch.status = 'paused'
          terminalStatus = 'paused'
        } else if (event.type === 'time_limit_pause') {
          runPatch.status = 'timed_out'
          runPatch.timed_out_at = now
          runPatch.error = String(
            event.message ??
              'Maximum time limit for a prompt reached. Engagement required to continue.',
          )
          terminalStatus = 'timed_out'
        } else if (event.type === 'error') {
          runPatch.status = 'error'
          runPatch.error = String(event.message ?? 'Freebuff run failed')
          runPatch.completed_at = now
          terminalStatus = 'error'
        }
        if (terminalStatus) {
          runPatch.metered_credits = meteredCredits
          if (runDoc.user_id) {
            await recordDailyUsage(ctx, {
              userId: runDoc.user_id,
              meteredCredits,
              status: terminalStatus,
              now,
            })
          }
        }
        if (shouldPatchRun || terminalStatus) {
          await ctx.db.patch(runDoc._id, runPatch)
        }
      } else if (runDoc) {
        return { ignored: true, status: runDoc.status }
      }
    }

    const messageId = event.messageId as Id<'agent_message'>
    const message = await ctx.db.get(messageId)
    if (!message) throw new Error('Agent message not found')

    // Once a message is cancelled (user terminated the thread), ignore any
    // late events from the in-flight run so they can't resurrect the message
    // back into a streaming/completed state.
    if (message.state === 'Cancelled') {
      return { ignored: true, reason: 'cancelled' }
    }

    const threadId = event.threadId as Id<'agent_thread'>
    const thread = await ctx.db.get(threadId)
    if (!thread || message.thread_id !== threadId) {
      throw new Error('Thread/message mismatch')
    }

    if (thread.project_id !== (event.projectId as Id<'project'>)) {
      throw new Error('Project/thread mismatch')
    }

    const assistantStream = compactAssistantStream(
      (message.assistant_stream ?? []) as AssistantStreamItem[],
    )

    if (event.type === 'text_delta') {
      appendOrMergeStreamItem(assistantStream, {
        type: 'text',
        content: String(event.chunk ?? ''),
      })
    } else if (event.type === 'reasoning_delta') {
      appendOrMergeStreamItem(assistantStream, {
        type: 'reasoning',
        title: 'Reasoning',
        content: String(event.chunk ?? ''),
      })
    } else if (event.type === 'subagent_delta') {
      appendOrMergeStreamItem(assistantStream, {
        type: 'subagent',
        title: event.agentType,
        content: String(event.chunk ?? ''),
      })
    } else if (event.type === 'status') {
      assistantStream.push({
        type: 'status',
        title: event.title ?? event.status,
        content: String(event.content ?? event.status ?? ''),
      })
    } else if (event.type === 'ask_user_pause') {
      assistantStream.push({
        type: 'ask_user',
        title: 'Question',
        content: JSON.stringify({
          questions: Array.isArray(event.questions) ? event.questions : [],
        }),
      })
    } else if (event.type === 'time_limit_pause') {
      assistantStream.push({
        type: 'timeout_continue',
        title: 'Time limit reached',
        content: String(
          event.message ??
            'Maximum time limit for a prompt reached. Engagement required to continue.',
        ),
      })
    } else if (event.type === 'error') {
      assistantStream.push({
        type: 'error',
        title: 'Freebuff error',
        content: String(event.message ?? 'Unknown Freebuff error'),
      })
    }

    const patch: Record<string, any> = {
      assistant_stream: assistantStream,
    }

    if (event.type === 'start') {
      patch.state = 'Processing'
      patch.isStreaming = true
    } else if (event.type === 'final') {
      patch.state = 'Completed'
      patch.isStreaming = false
      patch.session_id = event.runId
      const threadPatch: Record<string, any> = {
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: Date.now(),
      }
      if (event.preserveThreadSession !== true) {
        threadPatch.active_session_id = event.runId
        threadPatch.active_session_id_freebuff = event.runId
        if (args.runStateStorageId !== undefined) {
          threadPatch.active_freebuff_run_state_storage_id =
            args.runStateStorageId
        }
      }
      await ctx.db.patch(threadId, threadPatch as any)
      await ctx.db.patch(thread.project_id, { state: 'active' })
    } else if (event.type === 'error') {
      patch.state = 'Error'
      patch.state_message = String(event.message ?? 'Freebuff run failed')
      patch.isStreaming = false
      const threadPatch: Record<string, any> = {
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: Date.now(),
      }
      if (args.runStateStorageId) {
        threadPatch.active_freebuff_run_state_storage_id =
          args.runStateStorageId
      }
      await ctx.db.patch(threadId, threadPatch as any)
      await ctx.db.patch(thread.project_id, { state: 'active' })
    } else if (event.type === 'time_limit_pause') {
      patch.state = 'Paused'
      patch.state_message =
        'Maximum time limit for a prompt reached. Engagement required to continue.'
      patch.isStreaming = false
      patch.session_id = event.runId
      const threadPatch: Record<string, any> = {
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: Date.now(),
      }
      if (event.preserveThreadSession !== true) {
        threadPatch.active_session_id = event.runId
        threadPatch.active_session_id_freebuff = event.runId
      }
      if (event.preserveThreadSession !== true && args.runStateStorageId) {
        threadPatch.active_freebuff_run_state_storage_id =
          args.runStateStorageId
      }
      await ctx.db.patch(threadId, threadPatch as any)
      await ctx.db.patch(thread.project_id, { state: 'active' })
    } else if (event.type === 'ask_user_pause') {
      patch.state = 'Paused'
      patch.state_message = 'Waiting for your answer'
      patch.isStreaming = false
      patch.session_id = event.runId
      const threadPatch: Record<string, any> = {
        active_session_id: event.runId,
        active_session_id_freebuff: event.runId,
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: Date.now(),
      }
      if (args.runStateStorageId) {
        threadPatch.active_freebuff_run_state_storage_id =
          args.runStateStorageId
      }
      await ctx.db.patch(threadId, threadPatch as any)
      await ctx.db.patch(thread.project_id, { state: 'active' })
    }

    await ctx.db.patch(messageId, patch)
  },
})

// Finalize a user-cancelled Freebuff run from the (still-running) agent action.
// Persists partial run state on the thread so a follow-up prompt can resume,
// and clears processing flags — without touching the already-Cancelled message.
export const recordFreebuffCancellationState = internalMutation({
  args: {
    threadId: v.id('agent_thread'),
    projectId: v.id('project'),
    runId: v.string(),
    runStateStorageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, args) => {
    const now = Date.now()

    // Defensively ensure the run ledger is marked cancelled.
    const runDoc = await ctx.db
      .query('freebuff_agent_runs')
      .withIndex('by_run_id', (q) => q.eq('run_id', args.runId))
      .unique()
    if (runDoc && !TERMINAL_RUN_STATUSES.has(runDoc.status)) {
      await ctx.db.patch(runDoc._id, {
        status: 'cancelled',
        completed_at: now,
        last_event_at: now,
      })
    }

    const thread = await ctx.db.get(args.threadId)
    if (thread) {
      const threadPatch: Record<string, any> = {
        isProcessing: false,
        workflow_id: undefined,
        last_edited_timestamp: now,
      }
      // Preserve conversation continuity: if we captured partial run state,
      // point the thread at it so the next message resumes from here.
      if (args.runStateStorageId !== undefined) {
        threadPatch.active_session_id = args.runId
        threadPatch.active_session_id_freebuff = args.runId
        threadPatch.active_freebuff_run_state_storage_id =
          args.runStateStorageId
      }
      await ctx.db.patch(args.threadId, threadPatch as any)
      await ctx.db.patch(thread.project_id, { state: 'active' })
    }

    return null
  },
})

export const sweepTimedOutFreebuffRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const cutoff = now - 10 * 60 * 1000

    const staleRunning = await ctx.db
      .query('freebuff_agent_runs')
      .withIndex('by_status_started_at', (q) =>
        q.eq('status', 'running').lt('started_at', cutoff),
      )
      .collect()

    const queuedRuns = await ctx.db
      .query('freebuff_agent_runs')
      .withIndex('by_status', (q) => q.eq('status', 'queued'))
      .collect()
    const staleQueued = queuedRuns.filter((run) => run.queued_at < cutoff)

    let timedOut = 0
    for (const runDoc of [...staleRunning, ...staleQueued]) {
      const latestRunDoc = await ctx.db.get(runDoc._id)
      if (!latestRunDoc || TERMINAL_RUN_STATUSES.has(latestRunDoc.status)) {
        continue
      }

      const message = await ctx.db.get(latestRunDoc.message_id)
      const thread = await ctx.db.get(latestRunDoc.thread_id)

      await ctx.db.patch(latestRunDoc._id, {
        status: 'timed_out',
        timed_out_at: now,
        error:
          'Maximum time limit for a prompt reached. Engagement required to continue.',
        last_event_at: now,
      })
      if (latestRunDoc.user_id) {
        await recordDailyUsage(ctx, {
          userId: latestRunDoc.user_id,
          meteredCredits: latestRunDoc.metered_credits ?? 0,
          status: 'timed_out',
          now,
        })
      }

      if (message) {
        const assistantStream = compactAssistantStream(
          (message.assistant_stream ?? []) as AssistantStreamItem[],
        )
        assistantStream.push({
          type: 'timeout_continue',
          title: 'Time limit reached',
          content:
            'Maximum time limit for a prompt reached. Engagement required to continue.',
        })
        await ctx.db.patch(latestRunDoc.message_id, {
          state: 'Cancelled',
          state_message:
            'Maximum time limit for a prompt reached. Engagement required to continue.',
          isStreaming: false,
          assistant_stream: assistantStream,
        })
      }

      if (thread) {
        await ctx.db.patch(latestRunDoc.thread_id, {
          isProcessing: false,
          workflow_id: undefined,
          last_edited_timestamp: now,
        })
        await ctx.db.patch(thread.project_id, { state: 'active' })
      }

      timedOut += 1
    }

    return { timedOut }
  },
})
