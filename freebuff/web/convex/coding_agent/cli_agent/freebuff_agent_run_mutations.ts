import { v } from 'convex/values'

import { internalMutation, internalQuery } from '!/_generated/server'
import { Id } from '!/_generated/dataModel'

// Statuses that mean the run is finished and must not be transitioned again.
const TERMINAL_RUN_STATUSES = new Set([
  'completed',
  'paused',
  'error',
  'timed_out',
  'cancelled',
])

export const createFreebuffAgentRun = internalMutation({
  args: {
    runId: v.string(),
    userId: v.id('users'),
    projectId: v.id('project'),
    threadId: v.id('agent_thread'),
    messageId: v.id('agent_message'),
    // Set when this run was started by a scheduled Automation fire; powers the
    // per-automation run history (freebuff_agent_runs by_automation index).
    automationId: v.optional(v.id('automation')),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    await ctx.db.insert('freebuff_agent_runs', {
      run_id: args.runId,
      user_id: args.userId,
      project_id: args.projectId,
      thread_id: args.threadId,
      message_id: args.messageId,
      status: 'queued',
      queued_at: now,
      last_event_at: now,
      ...(args.automationId ? { automation_id: args.automationId } : {}),
    })
  },
})

export const setFreebuffAgentRunWorkId = internalMutation({
  args: {
    runId: v.string(),
    workId: v.string(),
  },
  handler: async (ctx, args) => {
    const runDoc = await ctx.db
      .query('freebuff_agent_runs')
      .withIndex('by_run_id', (q) => q.eq('run_id', args.runId))
      .unique()
    if (!runDoc) return
    await ctx.db.patch(runDoc._id, { work_id: args.workId })
  },
})

export const markFreebuffAgentRunRunning = internalMutation({
  args: {
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    const runDoc = await ctx.db
      .query('freebuff_agent_runs')
      .withIndex('by_run_id', (q) => q.eq('run_id', args.runId))
      .unique()
    if (!runDoc || runDoc.status !== 'queued') return
    const now = Date.now()
    await ctx.db.patch(runDoc._id, {
      status: 'running',
      started_at: now,
      last_event_at: now,
    })
  },
})

// Refresh a run for an auto-continuation across the in-action time limit.
// Resets `started_at` so the 10-minute timeout sweep doesn't reap a run that is
// actively continuing, and clears any partial terminal timestamps. Returns
// `ok: false` if the run was cancelled/finished out from under us so the caller
// stops continuing.
export const restartFreebuffAgentRunForContinuation = internalMutation({
  args: {
    runId: v.string(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const runDoc = await ctx.db
      .query('freebuff_agent_runs')
      .withIndex('by_run_id', (q) => q.eq('run_id', args.runId))
      .unique()
    if (!runDoc) return { ok: false }
    if (TERMINAL_RUN_STATUSES.has(runDoc.status)) return { ok: false }

    const now = Date.now()
    await ctx.db.patch(runDoc._id, {
      status: 'running',
      started_at: now,
      last_event_at: now,
      completed_at: undefined,
      timed_out_at: undefined,
      error: undefined,
    })
    return { ok: true }
  },
})

// Mark a run as cancelled (user terminated the thread). If the run was
// scheduled but hasn't started yet, also cancels the pending Convex scheduler
// invocation so it never runs. If it's already running, the action polls the
// run ledger and aborts itself cooperatively. No-op when the run is already in
// a terminal state.
export const cancelFreebuffAgentRunByRunId = internalMutation({
  args: {
    runId: v.string(),
  },
  returns: v.object({ workId: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const runDoc = await ctx.db
      .query('freebuff_agent_runs')
      .withIndex('by_run_id', (q) => q.eq('run_id', args.runId))
      .unique()
    if (!runDoc) return { workId: undefined }
    if (!TERMINAL_RUN_STATUSES.has(runDoc.status)) {
      await ctx.db.patch(runDoc._id, {
        status: 'cancelled',
        completed_at: Date.now(),
        last_event_at: Date.now(),
      })
    }

    // Stored work_id holds the Convex scheduler function id (carryover field
    // name from the workpool era). Best-effort cancel — throws once the
    // scheduled function has completed, which is fine to swallow.
    if (runDoc.work_id) {
      try {
        await ctx.scheduler.cancel(
          runDoc.work_id as unknown as Id<'_scheduled_functions'>,
        )
      } catch (error) {
        console.warn(
          '[vly-freebuff-cancel] failed to cancel scheduled run',
          error,
        )
      }
    }

    return { workId: runDoc.work_id }
  },
})

// Lightweight status read used by the running agent action to cooperatively
// abort itself when the user cancels.
export const getFreebuffAgentRunStatus = internalQuery({
  args: {
    runId: v.string(),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const runDoc = await ctx.db
      .query('freebuff_agent_runs')
      .withIndex('by_run_id', (q) => q.eq('run_id', args.runId))
      .unique()
    return runDoc?.status ?? null
  },
})
